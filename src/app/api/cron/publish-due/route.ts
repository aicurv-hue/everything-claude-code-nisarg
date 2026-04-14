/**
 * POST /api/cron/publish-due
 *
 * Scheduled post worker — finds all posts due for publishing and posts them
 * to LinkedIn using the stored access tokens.
 *
 * Called by:
 *   • cron-job.org — every 1 hour in production
 *   • Dashboard client poller (/schedule page only) — every 5 min in browser
 *
 * Flow per post:
 *   1. Refresh token if access_token is expired (or within 5 min of expiry)
 *   2. Generate content if post has a "[Pending generation]" placeholder
 *   3. Upload image to LinkedIn if image_url is set
 *   4. POST to LinkedIn /rest/posts
 *   5. Mark post as "published" or "failed"
 */

import { NextRequest, NextResponse } from "next/server";
import { postService, Post } from "@/lib/db/posts";
import { savePostMemory } from "@/lib/ai/save-memory";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserPlan, canUseCorporate } from "@/lib/checkSubscription";

const LI_VERSION  = "202504";
const TIMEOUT_MS  = 20_000;
const CRON_SECRET = process.env.CRON_SECRET; // required — set this in Vercel env vars

const ALLOWED_IMAGE_HOSTS = new Set([
  "storage.googleapis.com",
  "firebasestorage.googleapis.com",
  "fal.run",
  "storage.fal.run",
  "v2.fal.media",
  "cdn.fal.ai",
]);

function isAllowedImageUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_IMAGE_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

// In-memory lock — prevents duplicate publishes when two cron calls overlap
// (works in local dev where there is one server process)
const publishingIds = new Set<string>();

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

/** Refresh the access token using the stored refresh token */
async function refreshAccessToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
        client_id:     (process.env.LINKEDIN_CLIENT_ID || "").trim().replace(/\n/g, ""),
        client_secret: (process.env.LINKEDIN_CLIENT_SECRET || "").trim().replace(/\n/g, ""),
      }),
    });
    if (!res.ok) { console.error("[cron] Token refresh failed:", await res.text()); return null; }
    const data        = await res.json();
    const newToken    = data.access_token;
    const expiresAt   = Date.now() + (data.expires_in || 5184000) * 1000;
    if (adminDb) {
      await adminDb.collection("tokens").doc(userId).set(
        { access_token: newToken, expires_at: expiresAt, updated_at: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    console.log(`[cron] Token refreshed for ${userId}`);
    return newToken;
  } catch (err) {
    console.error("[cron] Token refresh exception:", err);
    return null;
  }
}

/** Upload image to LinkedIn Images API. Returns image URN or null. */
async function uploadImage(accessToken: string, authorUrn: string, imageUrl: string): Promise<string | null> {
  try {
    const { signal: s1, clear: c1 } = withTimeout(TIMEOUT_MS);
    const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
      method: "POST", signal: s1,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LI_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
    });
    c1();
    if (!initRes.ok) { console.warn("[cron/image] initializeUpload failed:", await initRes.text()); return null; }

    const initData  = await initRes.json();
    const uploadUrl = initData?.value?.uploadUrl;
    const imageUrn  = initData?.value?.image;
    if (!uploadUrl || !imageUrn) return null;

    const { signal: s2, clear: c2 } = withTimeout(TIMEOUT_MS);
    const imgRes = await fetch(imageUrl, { signal: s2 });
    c2();
    if (!imgRes.ok) return null;

    const buffer      = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    const { signal: s3, clear: c3 } = withTimeout(30_000);
    const upRes = await fetch(uploadUrl, {
      method: "PUT", signal: s3,
      headers: { "Content-Type": contentType },
      body: buffer,
    });
    c3();
    if (!upRes.ok) { console.warn("[cron/image] upload failed:", upRes.status); return null; }
    return imageUrn;
  } catch (err) {
    console.warn("[cron/image] exception:", err);
    return null;
  }
}

/** Post to LinkedIn. Returns postId or throws. */
async function postToLinkedIn(
  accessToken: string,
  authorUrn:   string,
  content:     string,
  imageUrl?:   string
): Promise<string> {
  let imageUrn: string | null = null;
  if (imageUrl && !imageUrl.startsWith("data:")) {
    if (!isAllowedImageUrl(imageUrl)) {
      console.warn("[cron/image] Blocked SSRF attempt — imageUrl hostname not in allowlist:", imageUrl);
    } else {
      imageUrn = await uploadImage(accessToken, authorUrn, imageUrl);
      if (!imageUrn) {
        throw new Error("Image upload to LinkedIn failed. Post held — fix the image URL or remove it, then reschedule.");
      }
    }
  }

  const body: Record<string, any> = {
    author:       authorUrn,
    commentary:   content,
    visibility:   "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState:            "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (imageUrn) body.content = { media: { title: "Post image", id: imageUrn } };

  const { signal, clear } = withTimeout(TIMEOUT_MS);
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST", signal,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LI_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  clear();

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LinkedIn API ${res.status}: ${errText}`);
  }

  return res.headers.get("x-restli-id") || res.headers.get("location") || "unknown";
}

export async function POST(req: NextRequest) {
  // Auth: CRON_SECRET is mandatory. If not configured, fail hard.
  // x-vercel-cron bypass removed — any client can set that header.
  if (!CRON_SECRET) {
    console.error("[cron] CRON_SECRET is not configured");
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  {
    const authHeader = req.headers.get("authorization") || "";
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  console.log(`[cron] publish-due triggered at ${now.toISOString()}`);

  // ── Fetch ALL scheduled posts across ALL users (Admin SDK bypasses security rules) ──
  let due: Post[] = [];
  try {
    if (adminDb) {
      // Admin SDK path — works in production with Firestore security rules enabled
      const snapshot = await adminDb.collection("posts")
        .where("status", "==", "scheduled")
        .get();
      const allScheduled = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Post));
      due = allScheduled.filter(p => {
        const secs = p.scheduled_at?.seconds
          ?? (p.scheduled_at instanceof Date ? p.scheduled_at.getTime() / 1000 : null)
          ?? (typeof p.scheduled_at === "string" ? new Date(p.scheduled_at).getTime() / 1000 : null);
        if (!secs) return false;
        return secs * 1000 <= now.getTime();
      });
    } else {
      // Fallback — local dev without Admin SDK (uses mock/client-side Firestore)
      const allScheduled = await postService.getScheduled("local-dev");
      due = allScheduled.filter(p => {
        const secs = p.scheduled_at?.seconds
          ?? (p.scheduled_at instanceof Date ? p.scheduled_at.getTime() / 1000 : null)
          ?? (typeof p.scheduled_at === "string" ? new Date(p.scheduled_at).getTime() / 1000 : null);
        if (!secs) return false;
        return secs * 1000 <= now.getTime();
      });
    }
    console.log(`[cron] ${due.length} post(s) due across all users.`);
  } catch (fetchErr: any) {
    console.error("[cron] Failed to fetch scheduled posts:", fetchErr?.message || fetchErr);
    return NextResponse.json({ processed: 0, error: `DB read failed: ${fetchErr?.message}` }, { status: 500 });
  }

  if (due.length === 0) {
    console.log("[cron] No posts due — proceeding to engagement sync.");
  }

  // ── Process due posts in parallel batches of 5 ───────────────────────────
  // Sequential publishing (1 post at a time) was O(n × 3s) — 100 posts = ~5 min.
  // Batching reduces that to O(n/5 × 3s) — 100 posts = ~1 min.
  // Same-user posts are not grouped into the same batch to avoid LinkedIn rate limits.
  const results: Array<{ id: string; status: "published" | "failed"; reason?: string }> = [];
  // Per-run token cache: refresh each user's token at most once per cron invocation.
  // Without this, 100 posts from the same user would call LinkedIn's token endpoint 100 times.
  const tokenCache = new Map<string, string>(); // userId → valid access_token
  // Mutex map: prevents two concurrent publishes for the same user hitting LinkedIn simultaneously
  const userInFlight = new Set<string>();

  async function publishOne(post: Post): Promise<{ id: string; status: "published" | "failed"; reason?: string }> {
    if (!post.id) return { id: post.id!, status: "failed" as const, reason: "no id" };
    if (publishingIds.has(post.id)) return { id: post.id, status: "failed" as const, reason: "in-flight" };
    publishingIds.add(post.id);

    // Wait if this user already has a post being published in the current batch
    // (prevents hitting LinkedIn per-user rate limits within a single batch)
    while (userInFlight.has(post.user_id)) {
      await new Promise(r => setTimeout(r, 200));
    }
    userInFlight.add(post.user_id);

    try {
      const postRef = adminDb!.collection("posts").doc(post.id);
      const claimed = await adminDb!.runTransaction(async (tx) => {
        const snap = await tx.get(postRef);
        if (!snap.exists || snap.data()?.status !== "scheduled") return false;
        tx.update(postRef, { status: "processing", updated_at: FieldValue.serverTimestamp() });
        return true;
      });
      if (!claimed) {
        console.log(`[cron] Post ${post.id} already claimed — skipping.`);
        return { id: post.id, status: "failed" as const, reason: "already claimed" };
      }

      // Plan check for corporate posts
      if (post.segment === "corporate") {
        const userPlan = await getUserPlan(post.user_id);
        if (!canUseCorporate(userPlan)) {
          console.log(`[cron] Post ${post.id} blocked — user ${post.user_id} plan (${userPlan}) does not allow corporate.`);
          await postRef.update({
            status: "plan_blocked",
            failed_reason: "Company page posting requires Pro or Business plan.",
            updated_at: FieldValue.serverTimestamp(),
          });
          return { id: post.id, status: "failed" as const, reason: "plan_blocked" };
        }
      }

      const userId = post.user_id;
      let accessToken = tokenCache.get(userId);
      let userSub: string | undefined;
      if (!accessToken) {
        const tokenSnap = await adminDb!.collection("tokens").doc(userId).get();
        const tokenRecord = tokenSnap.exists ? tokenSnap.data() : null;
        if (!tokenRecord) throw new Error(`No LinkedIn token for user ${userId}. User must reconnect LinkedIn in Settings.`);
        userSub = tokenRecord.user_sub;
        const fiveMin = 5 * 60 * 1000;
        if (!tokenRecord.expires_at || tokenRecord.expires_at < Date.now() + fiveMin) {
          if (tokenRecord.refresh_token) {
            const refreshed = await refreshAccessToken(userId, tokenRecord.refresh_token);
            if (refreshed) { accessToken = refreshed; }
            else throw new Error("Access token expired and refresh failed. User must reconnect LinkedIn.");
          } else {
            throw new Error("Access token expired. No refresh token. User must reconnect LinkedIn.");
          }
        } else {
          accessToken = tokenRecord.access_token as string;
        }
        tokenCache.set(userId, accessToken);
      }

      if (!userSub) {
        const tokenSnap = await adminDb!.collection("tokens").doc(userId).get();
        userSub = tokenSnap.data()?.user_sub || "";
      }
      let authorUrn = `urn:li:person:${userSub}`;
      if (post.segment === "corporate") {
        let orgId = (post as any).organization_id;
        if (!orgId) {
          const profileSnap = await adminDb!.collection("profiles").doc(userId).get();
          orgId = profileSnap.data()?.corporate?.linkedinOrganizationId;
        }
        if (!orgId) throw new Error("No LinkedIn Organization ID set. Add it in Settings → Identity (Corporate).");
        authorUrn = `urn:li:organization:${orgId}`;
      }

      let content = post.content || "";
      if (content.startsWith("[Pending generation]")) content = post.topic || content;
      if (!content.trim()) throw new Error("Post content is empty.");

      const postId = await postToLinkedIn(accessToken!, authorUrn, content, post.image_url || undefined);
      await postRef.update({
        status: "published",
        linkedin_post_id: postId,
        published_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      console.log(`[cron] ✅ Published post ${post.id} (user: ${userId}) → LinkedIn ${postId}`);
      savePostMemory({
        content, topic: post.topic || "", audience: post.audience || "",
        tone: post.tone || "professional",
        segment: (post.segment as "individual" | "corporate") || "individual",
        userId, postId: post.id,
      }).catch((err) => console.error('[Memory] savePostMemory failed:', err));
      return { id: post.id, status: "published" as const };

    } catch (err: any) {
      console.error(`[cron] ❌ Failed to publish post ${post.id}:`, err?.message || err);
      await adminDb!.collection("posts").doc(post.id).update({
        status: "failed",
        failed_reason: err?.message || "Unknown error",
        updated_at: FieldValue.serverTimestamp(),
      }).catch(() => {});
      return { id: post.id, status: "failed" as const, reason: err?.message };
    } finally {
      publishingIds.delete(post.id);
      userInFlight.delete(post.user_id);
    }
  }

  // Process in batches of 5 — each batch runs in parallel, batches run sequentially
  const BATCH_SIZE = 5;
  const validPosts = due.filter(p => p.id);
  for (let i = 0; i < validPosts.length; i += BATCH_SIZE) {
    const batch = validPosts.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map(post => publishOne(post)));
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
      // rejected = unexpected throw — already handled inside publishOne, so this shouldn't happen
    }
  }

  const published = results.filter(r => r.status === "published").length;
  const failed    = results.filter(r => r.status === "failed" && r.reason !== "in-flight" && r.reason !== "already claimed").length;

  // ── Engagement sync disabled ──────────────────────────────────────────────
  // LinkedIn moved all social engagement endpoints (reactions, comments, socialActions)
  // to Partner API only in April 2025. All calls return 403/404 without Partner approval.
  // Confirmed via diagnostic: partnerApiSocialActions.GET_ALL.20250401
  // Re-enable this block if/when LinkedIn Partner access is granted.
  console.log("[cron] Engagement sync skipped — requires LinkedIn Partner API access.");

  console.log(`[cron] Done. Published: ${published}, Failed: ${failed}`);
  return NextResponse.json({ processed: due.length, published, failed, results });
}

// Also support GET for easy manual testing in browser
export const GET = POST;
