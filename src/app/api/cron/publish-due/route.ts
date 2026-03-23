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
import { cookies } from "next/headers";
import { postService } from "@/lib/db/posts";
import { tokenService } from "@/lib/db/tokens";
import type { LinkedInTokenRecord } from "@/lib/db/tokens";

const LI_VERSION  = "202505";
const TIMEOUT_MS  = 20_000;
const CRON_SECRET = process.env.CRON_SECRET; // optional guard

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
        client_id:     process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }),
    });
    if (!res.ok) { console.error("[cron] Token refresh failed:", await res.text()); return null; }
    const data        = await res.json();
    const newToken    = data.access_token;
    const expiresAt   = Date.now() + (data.expires_in || 5184000) * 1000;
    await tokenService.updateAccessToken(userId, newToken, expiresAt);
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
  // Optional secret guard — set CRON_SECRET env var to lock this endpoint
  if (CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  console.log(`[cron] publish-due triggered at ${now.toISOString()}`);

  // ── Fetch all scheduled posts that are due ─────────────────────────────────
  let allScheduled: Awaited<ReturnType<typeof postService.getScheduled>>;
  try {
    allScheduled = await postService.getScheduled("demo-user");
    console.log(`[cron] Fetched ${allScheduled.length} scheduled post(s) from DB.`);
  } catch (fetchErr: any) {
    console.error("[cron] Failed to fetch scheduled posts:", fetchErr?.message || fetchErr);
    return NextResponse.json({
      processed: 0,
      error: `DB read failed: ${fetchErr?.message || "unknown"}. Check Firestore rules — allow read/write for server-side access.`,
    }, { status: 500 });
  }

  const due = allScheduled.filter(p => {
    const secs = p.scheduled_at?.seconds ?? (p.scheduled_at instanceof Date ? p.scheduled_at.getTime() / 1000 : null);
    if (!secs) return false;
    return secs * 1000 <= now.getTime();
  });

  if (due.length === 0) {
    console.log("[cron] No posts due.");
    return NextResponse.json({ processed: 0, message: "No posts due." });
  }

  console.log(`[cron] ${due.length} post(s) due for publishing.`);

  // ── Get LinkedIn tokens (DB first, cookie fallback) ───────────────────────
  let tokenRecord = await tokenService.get("demo-user").catch(() => null);

  if (!tokenRecord) {
    // Fallback: read tokens directly from cookies (set by OAuth callback)
    const cookieStore = await cookies();
    const accessToken   = cookieStore.get("li_access_token")?.value;
    const refreshToken  = cookieStore.get("li_refresh_token")?.value;
    const expiryStr     = cookieStore.get("li_token_expiry")?.value;
    const userSub       = cookieStore.get("li_user_sub")?.value;
    const userName      = cookieStore.get("li_user_name")?.value;
    const userEmail     = cookieStore.get("li_user_email")?.value;
    const userPicture   = cookieStore.get("li_user_picture")?.value;

    if (accessToken) {
      console.log("[cron] Token not in DB — using cookie fallback. Saving to DB for future runs.");
      tokenRecord = {
        user_id:       "demo-user",
        access_token:  accessToken,
        refresh_token: refreshToken,
        user_sub:      userSub       || "",
        user_name:     userName      || "",
        user_email:    userEmail     || "",
        user_picture:  userPicture   || "",
        expires_at:    expiryStr ? parseInt(expiryStr) : Date.now() + 60 * 24 * 60 * 60 * 1000,
        updated_at:    null,
      } as LinkedInTokenRecord;
      // Persist to DB so future runs don't need cookie fallback
      tokenService.save({ ...tokenRecord }).catch(e =>
        console.warn("[cron] Could not save token to DB:", e?.message)
      );
    } else {
      console.error("[cron] No LinkedIn token in DB or cookies. User must connect LinkedIn.");
      return NextResponse.json({
        processed: 0,
        error: "No LinkedIn token found. Go to Settings and connect LinkedIn.",
      }, { status: 503 });
    }
  }

  // Refresh token if expired or within 5 minutes of expiry
  let accessToken = tokenRecord.access_token;
  const fiveMin   = 5 * 60 * 1000;
  if (tokenRecord.expires_at < Date.now() + fiveMin) {
    if (tokenRecord.refresh_token) {
      const refreshed = await refreshAccessToken("demo-user", tokenRecord.refresh_token);
      if (refreshed) {
        accessToken = refreshed;
      } else {
        return NextResponse.json({
          processed: 0,
          error: "Access token expired and refresh failed. User must reconnect LinkedIn.",
        }, { status: 503 });
      }
    } else {
      return NextResponse.json({
        processed: 0,
        error: "Access token expired. No refresh token available. User must reconnect LinkedIn.",
      }, { status: 503 });
    }
  }

  // ── Process each due post ──────────────────────────────────────────────────
  const results: Array<{ id: string; status: "published" | "failed"; reason?: string }> = [];

  for (const post of due) {
    if (!post.id) continue;
    try {
      // Resolve author URN
      const userSub   = tokenRecord.user_sub;
      const orgId     = process.env.LINKEDIN_ORGANIZATION_ID;
      const authorUrn = post.segment === "corporate" && orgId
        ? `urn:li:organization:${orgId}`
        : `urn:li:person:${userSub}`;

      // Use post content (skip placeholder-only posts gracefully)
      let content = post.content || "";
      if (content.startsWith("[Pending generation]")) {
        // Content was never generated — use topic as fallback content
        console.warn(`[cron] Post ${post.id} has placeholder content — using topic as fallback.`);
        content = post.topic || content;
      }

      if (!content.trim()) {
        throw new Error("Post content is empty.");
      }

      const postId = await postToLinkedIn(accessToken, authorUrn, content, post.image_url || undefined);

      await postService.markPublished(post.id, postId, post.image_url || undefined);
      console.log(`[cron] ✅ Published post ${post.id} → LinkedIn ${postId}`);
      results.push({ id: post.id, status: "published" });

    } catch (err: any) {
      console.error(`[cron] ❌ Failed to publish post ${post.id}:`, err?.message || err);
      await postService.markFailed(post.id).catch(() => {});
      results.push({ id: post.id, status: "failed", reason: err?.message });
    }
  }

  const published = results.filter(r => r.status === "published").length;
  const failed    = results.filter(r => r.status === "failed").length;

  console.log(`[cron] Done. Published: ${published}, Failed: ${failed}`);
  return NextResponse.json({ processed: due.length, published, failed, results });
}

// Also support GET for easy manual testing in browser
export const GET = POST;
