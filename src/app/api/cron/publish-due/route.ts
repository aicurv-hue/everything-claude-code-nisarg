/**
 * POST /api/cron/publish-due
 *
 * Scheduled post worker — finds all posts due for publishing and posts them
 * to LinkedIn using the stored access tokens.
 *
 * Called by:
 *   • Vercel Cron (vercel.json) — every minute in production
 *   • Dashboard client poller   — every 60s in local dev
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

const LI_VERSION  = "202505";
const TIMEOUT_MS  = 20_000;
const CRON_SECRET = process.env.CRON_SECRET; // required — set this in Vercel env vars

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
    imageUrn = await uploadImage(accessToken, authorUrn, imageUrl);
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
  // Auth: always require CRON_SECRET or Vercel cron header
  // A valid Firebase ID token is also accepted for manual dashboard triggers
  {
    const authHeader = req.headers.get("authorization") || "";
    const isVercelCron = req.headers.get("x-vercel-cron") === "1";
    const isCronSecret = !!CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
    const isFirebaseUser = !isCronSecret && !isVercelCron && adminAuth && authHeader.startsWith("Bearer ")
      ? await adminAuth.verifyIdToken(authHeader.slice(7)).then(() => true).catch(() => false)
      : false;
    if (!isVercelCron && !isCronSecret && !isFirebaseUser) {
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

  // ── Process each due post (each may belong to a different user) ────────────
  const results: Array<{ id: string; status: "published" | "failed"; reason?: string }> = [];

  for (const post of due) {
    if (!post.id) continue;

    // In-memory lock — prevents duplicate publish within same invocation
    if (publishingIds.has(post.id)) {
      console.log(`[cron] Post ${post.id} already in-flight — skipping.`);
      continue;
    }
    publishingIds.add(post.id);

    try {
      // Atomically claim the post: only proceed if it's still "scheduled"
      const postRef = adminDb!.collection("posts").doc(post.id);
      const claimed = await adminDb!.runTransaction(async (tx) => {
        const snap = await tx.get(postRef);
        if (!snap.exists || snap.data()?.status !== "scheduled") return false;
        tx.update(postRef, { status: "processing", updated_at: FieldValue.serverTimestamp() });
        return true;
      });
      if (!claimed) {
        console.log(`[cron] Post ${post.id} already claimed — skipping.`);
        publishingIds.delete(post.id);
        continue;
      }

      // ── Get LinkedIn token for this post's owner ──────────────────────────
      const userId = post.user_id;
      const tokenSnap = await adminDb!.collection("tokens").doc(userId).get();
      const tokenRecord = tokenSnap.exists ? tokenSnap.data() : null;

      if (!tokenRecord) {
        throw new Error(`No LinkedIn token for user ${userId}. User must reconnect LinkedIn in Settings.`);
      }

      // Refresh token if expired or within 5 minutes of expiry
      let accessToken = tokenRecord.access_token;
      const fiveMin = 5 * 60 * 1000;
      if (!tokenRecord.expires_at || tokenRecord.expires_at < Date.now() + fiveMin) {
        if (tokenRecord.refresh_token) {
          const refreshed = await refreshAccessToken(userId, tokenRecord.refresh_token);
          if (refreshed) {
            accessToken = refreshed;
          } else {
            throw new Error("Access token expired and refresh failed. User must reconnect LinkedIn.");
          }
        } else {
          throw new Error("Access token expired. No refresh token. User must reconnect LinkedIn.");
        }
      }

      // Resolve author URN — org ID: post record first, then user profile, then env fallback
      let authorUrn = `urn:li:person:${tokenRecord.user_sub}`;
      if (post.segment === "corporate") {
        let orgId = (post as any).organization_id;
        if (!orgId) {
          const profileSnap = await adminDb!.collection("profiles").doc(userId).get();
          orgId = profileSnap.data()?.corporate?.linkedinOrganizationId;
        }
        if (!orgId) throw new Error("No LinkedIn Organization ID set. Add it in Settings → Identity (Corporate).");
        authorUrn = `urn:li:organization:${orgId}`;
      }

      // Use post content
      let content = post.content || "";
      if (content.startsWith("[Pending generation]")) {
        content = post.topic || content;
      }
      if (!content.trim()) throw new Error("Post content is empty.");

      const postId = await postToLinkedIn(accessToken, authorUrn, content, post.image_url || undefined);
      await postRef.update({
        status: "published",
        linkedin_post_id: postId,
        published_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      console.log(`[cron] ✅ Published post ${post.id} (user: ${userId}) → LinkedIn ${postId}`);

      savePostMemory({
        content,
        topic:    post.topic    || "",
        audience: post.audience || "",
        tone:     post.tone     || "professional",
        segment:  (post.segment as "individual" | "corporate") || "individual",
        userId,
        postId:   post.id,
      }).catch(() => {});

      results.push({ id: post.id, status: "published" });

    } catch (err: any) {
      console.error(`[cron] ❌ Failed to publish post ${post.id}:`, err?.message || err);
      await adminDb!.collection("posts").doc(post.id).update({
        status: "failed",
        failed_reason: err?.message || "Unknown error",
        updated_at: FieldValue.serverTimestamp(),
      }).catch(() => {});
      results.push({ id: post.id, status: "failed", reason: err?.message });
    } finally {
      publishingIds.delete(post.id);
    }
  }

  const published = results.filter(r => r.status === "published").length;
  const failed    = results.filter(r => r.status === "failed").length;

  // ── Hourly engagement sync — direct LinkedIn API calls using per-user tokens ──
  try {
    if (adminDb) {
      const oneHourAgo    = Date.now() - 60 * 60 * 1000;
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

      const snap = await adminDb.collection("posts").where("status", "==", "published").get();
      const allPublished: Post[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Post));

      const toSync = allPublished.filter(p => {
        if (!p.linkedin_post_id) return false;
        const pubMs = (p.published_at?.seconds || 0) * 1000;
        if (pubMs < thirtyDaysAgo) return false;
        return !p.engagement_synced_at || p.engagement_synced_at < oneHourAgo;
      }).slice(0, 20);

      if (toSync.length > 0) {
        console.log(`[cron] Syncing engagement for ${toSync.length} post(s)…`);

        // Group by user, look up each user's token from Firestore directly
        const byUser = new Map<string, Post[]>();
        for (const p of toSync) {
          const uid = p.user_id;
          if (!uid) continue;
          if (!byUser.has(uid)) byUser.set(uid, []);
          byUser.get(uid)!.push(p);
        }

        for (const [uid, userPosts] of byUser) {
          const tokenSnap = await adminDb.collection("tokens").doc(uid).get().catch(() => null);
          const accessToken: string | undefined = tokenSnap?.exists ? tokenSnap.data()?.access_token : undefined;
          if (!accessToken) continue;

          for (const post of userPosts) {
            try {
              const postUrn = post.linkedin_post_id!;
              const encoded = encodeURIComponent(postUrn);

              // Fetch likes count via /rest/reactions
              const { signal: s1, clear: c1 } = withTimeout(10_000);
              const likesRes = await fetch(
                `https://api.linkedin.com/rest/reactions?q=entity&entity=${encoded}&count=0`,
                {
                  signal: s1,
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "LinkedIn-Version": LI_VERSION,
                    "X-Restli-Protocol-Version": "2.0.0",
                  },
                }
              );
              c1();

              // Fetch comments count via /rest/comments
              const { signal: s2, clear: c2 } = withTimeout(10_000);
              const commentsRes = await fetch(
                `https://api.linkedin.com/rest/comments?q=comments&commentUrn=${encoded}&count=0`,
                {
                  signal: s2,
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "LinkedIn-Version": LI_VERSION,
                    "X-Restli-Protocol-Version": "2.0.0",
                  },
                }
              );
              c2();

              let likes = 0;
              let comments = 0;

              if (likesRes.ok) {
                const likesData = await likesRes.json();
                likes = likesData.paging?.total ?? likesData.total ?? 0;
              } else {
                console.warn(`[cron/engagement] Likes fetch ${likesRes.status} for ${postUrn}: ${await likesRes.text()}`);
              }

              if (commentsRes.ok) {
                const commentsData = await commentsRes.json();
                comments = commentsData.paging?.total ?? commentsData.total ?? 0;
              } else {
                console.warn(`[cron/engagement] Comments fetch ${commentsRes.status} for ${postUrn}: ${await commentsRes.text()}`);
              }

              await adminDb.collection("posts").doc(post.id!).update({
                likes_count: likes,
                comments_count: comments,
                engagement_synced_at: Date.now(),
                updated_at: FieldValue.serverTimestamp(),
              }).catch(() => {});

              console.log(`[cron/engagement] ${postUrn} → ${likes} likes, ${comments} comments`);
            } catch (e: any) {
              console.warn(`[cron/engagement] Failed for ${post.id}: ${e?.message}`);
            }
          }
          console.log(`[cron] Engagement synced for user ${uid}: ${userPosts.length} post(s).`);
        }
      }
    }
  } catch (engErr: any) {
    console.warn("[cron] Engagement sync failed (non-critical):", engErr?.message);
  }

  console.log(`[cron] Done. Published: ${published}, Failed: ${failed}`);
  return NextResponse.json({ processed: due.length, published, failed, results });
}

// Also support GET for easy manual testing in browser
export const GET = POST;
