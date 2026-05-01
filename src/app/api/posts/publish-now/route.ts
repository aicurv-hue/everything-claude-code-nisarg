/**
 * POST /api/posts/publish-now
 *
 * Immediately publishes a scheduled (or failed) post to LinkedIn.
 * Reuses the same LinkedIn Posts API flow as the cron worker.
 *
 * Body: { postId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserPlan, canUseCorporate } from "@/lib/checkSubscription";

const LI_VERSION = "202505";
const TIMEOUT_MS = 20_000;

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

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

async function uploadImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string
): Promise<string | null> {
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
    if (!initRes.ok) return null;

    const initData = await initRes.json();
    const uploadUrl = initData?.value?.uploadUrl;
    const imageUrn = initData?.value?.image;
    if (!uploadUrl || !imageUrn) return null;

    const { signal: s2, clear: c2 } = withTimeout(TIMEOUT_MS);
    const imgRes = await fetch(imageUrl, { signal: s2 });
    c2();
    if (!imgRes.ok) return null;

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    const { signal: s3, clear: c3 } = withTimeout(30_000);
    const upRes = await fetch(uploadUrl, {
      method: "PUT", signal: s3,
      headers: { "Content-Type": contentType },
      body: buffer,
    });
    c3();
    if (!upRes.ok) return null;
    return imageUrn;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!adminDb || !adminAuth) {
    return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
  }

  // Verify Firebase auth
  const authHeader = req.headers.get("authorization") || "";
  const firebaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!firebaseToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(firebaseToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId } = await req.json();
  if (!postId) return NextResponse.json({ error: "Missing postId" }, { status: 400 });

  // Fetch post
  const postRef = adminDb.collection("posts").doc(postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const post = postSnap.data()!;
  if (post.user_id !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (post.status !== "scheduled" && post.status !== "failed" && post.status !== "published") {
    return NextResponse.json({ error: "Post is not in a publishable state" }, { status: 400 });
  }

  // Plan gate — corporate posting is Pro+ only
  if (post.segment === "corporate") {
    const plan = await getUserPlan(uid);
    if (!canUseCorporate(plan)) {
      return NextResponse.json(
        { error: "Company page posting requires the Pro plan or higher.", code: "PLAN_UPGRADE_REQUIRED" },
        { status: 403 }
      );
    }
  }

  // Get LinkedIn token
  const tokenSnap = await adminDb.collection("tokens").doc(uid).get();
  if (!tokenSnap.exists) {
    return NextResponse.json({ error: "LinkedIn not connected. Connect in Settings first." }, { status: 401 });
  }
  const tokenData = tokenSnap.data()!;
  const accessToken: string = tokenData.access_token;
  const userSub: string = tokenData.user_sub;

  if (!accessToken) {
    return NextResponse.json({ error: "No LinkedIn access token. Reconnect LinkedIn in Settings." }, { status: 401 });
  }

  // Resolve author URN
  let authorUrn = `urn:li:person:${userSub}`;
  if (post.segment === "corporate") {
    let orgId = post.organization_id;
    if (!orgId) {
      const profileSnap = await adminDb.collection("profiles").doc(uid).get();
      orgId = profileSnap.data()?.corporate?.linkedinOrganizationId;
    }
    if (!orgId) {
      return NextResponse.json({
        error: "No LinkedIn Organization ID set. Add it in Settings → Corporate → Identity tab.",
      }, { status: 400 });
    }
    authorUrn = `urn:li:organization:${orgId}`;
  }

  const content: string = post.content || post.topic || "";
  if (!content.trim()) {
    return NextResponse.json({ error: "Post content is empty." }, { status: 400 });
  }

  const isRepost = post.status === "published";

  // Mark as processing to prevent double-publish (skip for repost — keep status as published)
  if (!isRepost) {
    await postRef.update({ status: "processing", updated_at: FieldValue.serverTimestamp() });
  }

  try {
    // Upload image if present
    let imageUrn: string | null = null;
    const imageUrl: string | undefined = post.image_url;
    if (imageUrl && !imageUrl.startsWith("data:")) {
      if (!isAllowedImageUrl(imageUrl)) {
        if (!isRepost) await postRef.update({ status: "failed", failed_reason: "Image URL host not allowed.", updated_at: FieldValue.serverTimestamp() });
        return NextResponse.json({ error: "Image URL host not allowed." }, { status: 400 });
      }
      imageUrn = await uploadImage(accessToken, authorUrn, imageUrl);
      if (!imageUrn) {
        if (!isRepost) await postRef.update({ status: "failed", failed_reason: "Image upload to LinkedIn failed. The image URL may have expired — regenerate the image and try again.", updated_at: FieldValue.serverTimestamp() });
        return NextResponse.json({ error: "Image upload to LinkedIn failed. The image URL may have expired — regenerate the image and try again." }, { status: 502 });
      }
    }

    // Build LinkedIn post body
    const postBody: Record<string, any> = {
      author: authorUrn,
      commentary: content,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    if (imageUrn) {
      postBody.content = { media: { title: "Post image", id: imageUrn } };
    }

    const { signal, clear } = withTimeout(TIMEOUT_MS);
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST", signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "LinkedIn-Version": LI_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(postBody),
    });
    clear();

    if (!res.ok) {
      const errText = await res.text();
      let liError = errText;
      try { liError = JSON.parse(errText).message || errText; } catch {}
      if (!isRepost) {
        await postRef.update({
          status: "failed",
          failed_reason: `LinkedIn API ${res.status}: ${liError}`,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      return NextResponse.json({ error: `LinkedIn API error: ${liError}` }, { status: res.status });
    }

    const linkedinPostId = res.headers.get("x-restli-id") || res.headers.get("location") || "unknown";
    await postRef.update({
      status: "published",
      linkedin_post_id: linkedinPostId,
      published_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    console.log(`[publish-now] ✅ Published post ${postId} → ${linkedinPostId}`);
    return NextResponse.json({ success: true, linkedinPostId });
  } catch (err: any) {
    if (!isRepost) {
      await postRef.update({
        status: "failed",
        failed_reason: err?.message || "Unknown error",
        updated_at: FieldValue.serverTimestamp(),
      });
    }
    return NextResponse.json({ error: err?.message || "Publish failed" }, { status: 500 });
  }
}
