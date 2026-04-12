import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { savePostMemory } from "@/lib/ai/save-memory";

const LI_VERSION = "202505"; // LinkedIn API version header (YYYYMM)
const TIMEOUT_MS  = 15_000;

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

function resolveAuthorUrn(segment: string, userSub: string, organizationId?: string): string {
  if (segment === "corporate") {
    // MUST come from the user's own profile — never fall back to global env var
    // (env var is Nisarg's org; using it for another user causes 400 "not an admin")
    if (!organizationId) {
      throw new Error("LinkedIn Organization ID not set. Go to Settings → Corporate → Identity tab and enter your LinkedIn Organization ID.");
    }
    return `urn:li:organization:${organizationId}`;
  }
  return `urn:li:person:${userSub}`;
}

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

/**
 * Upload image to LinkedIn using the new Images API (replaces deprecated /v2/assets).
 *
 * Flow:
 *   1. POST /rest/images?action=initializeUpload  → get uploadUrl + image URN
 *   2. PUT  {uploadUrl}                           → binary upload
 *   Returns the image URN (e.g. "urn:li:image:xxxx") or null on failure.
 */
async function uploadImage(
  accessToken: string,
  authorUrn: string,
  imageUrl: string
): Promise<string | null> {
  try {
    // ── Step 1: Initialize upload ─────────────────────────────────────────────
    const { signal: s1, clear: c1 } = withTimeout(TIMEOUT_MS);
    const initRes = await fetch(
      "https://api.linkedin.com/rest/images?action=initializeUpload",
      {
        method: "POST",
        signal: s1,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LI_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          initializeUploadRequest: { owner: authorUrn },
        }),
      }
    );
    c1();

    if (!initRes.ok) {
      console.error("[linkedin/image] initializeUpload failed:", await initRes.text());
      return null;
    }

    const initData  = await initRes.json();
    const uploadUrl = initData?.value?.uploadUrl;
    const imageUrn  = initData?.value?.image; // "urn:li:image:xxxx"

    if (!uploadUrl || !imageUrn) {
      console.error("[linkedin/image] Missing uploadUrl or image URN in response", initData);
      return null;
    }

    console.log(`[linkedin/image] Upload URL obtained. Image URN: ${imageUrn}`);

    // ── Step 2: Fetch image bytes from fal.ai ─────────────────────────────────
    const { signal: s2, clear: c2 } = withTimeout(TIMEOUT_MS);
    const falRes = await fetch(imageUrl, { signal: s2 });
    c2();

    if (!falRes.ok) {
      console.error("[linkedin/image] Failed to fetch image from fal.ai:", falRes.status);
      return null;
    }

    const imageBuffer = await falRes.arrayBuffer();
    const contentType = falRes.headers.get("content-type") || "image/jpeg";

    // ── Step 3: Upload binary to LinkedIn ─────────────────────────────────────
    const { signal: s3, clear: c3 } = withTimeout(30_000); // larger timeout for binary upload
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      signal: s3,
      headers: { "Content-Type": contentType },
      body: imageBuffer,
    });
    c3();

    if (!uploadRes.ok) {
      console.error("[linkedin/image] Binary upload failed:", uploadRes.status, await uploadRes.text());
      return null;
    }

    console.log(`[linkedin/image] Upload successful → ${imageUrn}`);
    return imageUrn;

  } catch (err: any) {
    console.error("[linkedin/image] Exception:", err?.message || err);
    return null;
  }
}

/**
 * POST /api/linkedin/publish
 *
 * Body: { content, imageUrl?, segment? }
 *
 * Uses LinkedIn Posts API (/rest/posts) + Images API (/rest/images).
 * Switches author URN between personal profile and company page based on segment.
 */
export async function POST(request: NextRequest) {
  let accessToken: string | undefined;
  let userSub: string | undefined;
  let firebaseUid: string | undefined;

  // ── Step 1: Try Firestore token keyed by Firebase UID (correct multi-user path) ──
  const authHeader = request.headers.get("authorization") || "";
  const firebaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (firebaseToken && adminAuth && adminDb) {
    try {
      const decoded = await adminAuth.verifyIdToken(firebaseToken);
      firebaseUid = decoded.uid;
      const snap = await adminDb.collection("tokens").doc(firebaseUid).get();
      if (snap.exists) {
        const data = snap.data()!;
        accessToken = data.access_token;
        userSub     = data.user_sub;
        console.log(`[linkedin/publish] Using Firestore token for Firebase UID: ${firebaseUid} (${data.user_email})`);
      }
    } catch (e) {
      console.warn("[linkedin/publish] Firebase token verify failed, falling back to cookies:", e);
    }
  }

  if (!accessToken || !userSub) {
    return NextResponse.json(
      { error: "Not connected to LinkedIn. Please connect your account in Settings." },
      { status: 401 }
    );
  }

  const { content, imageUrl, segment = "individual", organizationId, topic, audience, tone, postDbId } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Post content is empty." }, { status: 400 });
  }

  let authorUrn: string;
  try {
    authorUrn = resolveAuthorUrn(segment, userSub, organizationId);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  console.log(`[linkedin/publish] Posting as ${segment} → ${authorUrn}`);

  // Upload image if provided
  let imageUrn: string | null = null;
  if (imageUrl) {
    if (!isAllowedImageUrl(imageUrl)) {
      console.warn("[linkedin/publish] Blocked SSRF attempt — imageUrl hostname not in allowlist:", imageUrl);
    } else {
      console.log("[linkedin/publish] Uploading image via new Images API...");
      imageUrn = await uploadImage(accessToken, authorUrn, imageUrl);
      if (!imageUrn) {
        console.warn("[linkedin/publish] Image upload failed — posting text only.");
      } else {
        console.log(`[linkedin/publish] Image ready: ${imageUrn}`);
      }
    }
  }

  // Build post body using new Posts API (/rest/posts)
  const postBody: Record<string, any> = {
    author: authorUrn,
    commentary: content,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  // Attach image if upload succeeded
  if (imageUrn) {
    postBody.content = {
      media: {
        title: "AI generated image by Neel",
        id: imageUrn,
      },
    };
  }

  const { signal, clear } = withTimeout(TIMEOUT_MS);
  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    signal,
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
    console.error(`[linkedin/publish] Post failed (${segment}):`, errText);

    // 400/422 on corporate = missing w_organization_social scope (requires LinkedIn Partner approval)
    const isOrgPermissionError = segment === "corporate" && (
      res.status === 422 ||
      (res.status === 400 && errText.toLowerCase().includes("organization permission"))
    );
    if (isOrgPermissionError) {
      return NextResponse.json(
        {
          error: "Company page posting requires LinkedIn Partner approval for the w_organization_social scope. Please use Schedule instead — scheduled posts will publish automatically once approved.",
          details: errText,
          code: "PARTNER_APPROVAL_REQUIRED",
        },
        { status: 422 }
      );
    }

    // Parse LinkedIn error for a readable message
    let liError = errText;
    try {
      const parsed = JSON.parse(errText);
      liError = parsed.message || parsed.error_description || parsed.error || errText;
    } catch {}

    return NextResponse.json(
      { error: `LinkedIn API error: ${res.status} — ${liError}`, details: errText },
      { status: res.status }
    );
  }

  // Posts API returns the post URN in the "x-restli-id" header
  const postId = res.headers.get("x-restli-id") || res.headers.get("location") || "unknown";
  console.log(`[linkedin/publish] ✅ Success — postId: ${postId} | account: ${segment} | image: ${!!imageUrn}`);

  // Save memory — fire and forget, never blocks the response
  if (firebaseUid) {
    savePostMemory({
      content,
      topic:    topic    || "",
      audience: audience || "",
      tone:     tone     || "professional",
      segment:  segment as "individual" | "corporate",
      userId:   firebaseUid,
      postId:   postDbId || undefined,
    }).catch((err) => console.error('[Memory] savePostMemory failed:', err));
  }

  return NextResponse.json({
    success: true,
    postId,
    segment,
    authorUrn,
    withImage: !!imageUrn,
  });
}
