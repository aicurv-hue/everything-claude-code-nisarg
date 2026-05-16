import { NextRequest, NextResponse, after } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { savePostMemory } from "@/lib/ai/save-memory";
import { getUserPlan, canUseCorporate, canUseCarousel } from "@/lib/checkSubscription";
import { buildCarouselPdf } from "@/lib/linkedin/buildCarouselPdf";
import { getActiveMembership } from "@/lib/team";

const LI_VERSION = "202604"; // LinkedIn API version header (YYYYMM)
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
 * Upload a PDF to LinkedIn via the Documents API.
 * Used for carousel posts — multi-image carousels on LinkedIn are PDF document shares.
 *
 *   1. POST /rest/documents?action=initializeUpload  → uploadUrl + document URN
 *   2. PUT  {uploadUrl}                              → PDF binary
 *   Returns the document URN (e.g. "urn:li:document:xxxx") or null on failure.
 */
async function uploadDocument(
  accessToken: string,
  authorUrn:   string,
  pdfBytes:    Buffer
): Promise<string | null> {
  try {
    const { signal: s1, clear: c1 } = withTimeout(TIMEOUT_MS);
    const initRes = await fetch(
      "https://api.linkedin.com/rest/documents?action=initializeUpload",
      {
        method: "POST",
        signal: s1,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LI_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner: authorUrn } }),
      }
    );
    c1();

    if (!initRes.ok) {
      console.error("[linkedin/document] initializeUpload failed:", await initRes.text());
      return null;
    }

    const initData    = await initRes.json();
    const uploadUrl   = initData?.value?.uploadUrl;
    const documentUrn = initData?.value?.document;

    if (!uploadUrl || !documentUrn) {
      console.error("[linkedin/document] Missing uploadUrl or document URN", initData);
      return null;
    }

    const { signal: s2, clear: c2 } = withTimeout(60_000); // larger window for PDF upload
    const upRes = await fetch(uploadUrl, {
      method: "PUT",
      signal: s2,
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array(pdfBytes),
    });
    c2();

    if (!upRes.ok) {
      console.error("[linkedin/document] Binary upload failed:", upRes.status, await upRes.text());
      return null;
    }

    console.log(`[linkedin/document] Upload successful → ${documentUrn}`);
    return documentUrn;
  } catch (err: any) {
    console.error("[linkedin/document] Exception:", err?.message || err);
    return null;
  }
}

/**
 * POST /api/linkedin/publish
 *
 * Body: { content, imageUrl?, imageUrls?, carouselTitle?, segment? }
 *
 * Uses LinkedIn Posts API (/rest/posts) + Images API (/rest/images) + Documents API (/rest/documents).
 * Switches author URN between personal profile and company page based on segment.
 * If imageUrls.length >= 2, builds a PDF carousel and posts as a document share.
 */
export async function POST(request: NextRequest) {
  let accessToken: string | undefined;
  let userSub: string | undefined;
  let firebaseUid: string | undefined;

  // ── Step 1: Verify Firebase ID token ──
  const authHeader = request.headers.get("authorization") || "";
  const firebaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (firebaseToken && adminAuth && adminDb) {
    try {
      const decoded = await adminAuth.verifyIdToken(firebaseToken);
      firebaseUid = decoded.uid;
    } catch (e) {
      console.warn("[linkedin/publish] Firebase token verify failed:", e);
    }
  }

  if (!firebaseUid || !adminDb) {
    return NextResponse.json(
      { error: "Not connected to LinkedIn. Please connect your account in Settings." },
      { status: 401 }
    );
  }

  const {
    content,
    imageUrl,
    imageUrls,
    carouselTitle,
    segment = "individual",
    organizationId: bodyOrgId,
    topic,
    audience,
    tone,
    postDbId,
  } = await request.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Post content is empty." }, { status: 400 });
  }

  // ── Step 2: Resolve effective publisher UID ──
  // For team members posting to a company page, the post must go out via the
  // team owner's LinkedIn token (only they have w_organization_social admin
  // for the company page) — same routing used by /api/cron/publish-due and
  // /api/posts/publish-now. For individual posts, member always uses their
  // own token.
  let effectiveUid = firebaseUid;
  let isTeamMemberCorp = false;
  if (segment === "corporate") {
    const membership = await getActiveMembership(firebaseUid);
    if (membership) {
      effectiveUid = membership.ownerUid;
      isTeamMemberCorp = true;
    }
  }

  // ── Step 3: Load LinkedIn token for the effective publisher ──
  const tokenSnap = await adminDb.collection("tokens").doc(effectiveUid).get();
  if (tokenSnap.exists) {
    const data = tokenSnap.data()!;
    accessToken = data.access_token;
    userSub     = data.user_sub;
  }

  if (!accessToken || !userSub) {
    const msg = isTeamMemberCorp
      ? "Team owner has not connected LinkedIn yet — ask them to connect in Settings before you can publish to the company page."
      : "Not connected to LinkedIn. Please connect your account in Settings.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  console.log(`[linkedin/publish] Caller UID: ${firebaseUid} | publishing as effective UID: ${effectiveUid}${isTeamMemberCorp ? " (team owner)" : ""}`);

  // Plan gate — corporate posting is Pro+ only. Use effective publisher's plan
  // so team members inherit the team owner's Business entitlement.
  if (segment === "corporate") {
    const plan = await getUserPlan(effectiveUid);
    if (!canUseCorporate(plan)) {
      return NextResponse.json(
        { error: "Company page posting requires the Pro plan or higher.", code: "PLAN_UPGRADE_REQUIRED" },
        { status: 403 }
      );
    }
  }

  // ── Step 4: Resolve organization ID ──
  // For team members, ignore any orgId the client sent (it came from the
  // member's own empty profile) and read the owner's instead. For solo
  // corporate posts, fall back to the caller's profile if the body didn't
  // include one — guards against undefined client state.
  let resolvedOrgId: string | undefined = bodyOrgId;
  if (segment === "corporate" && (isTeamMemberCorp || !resolvedOrgId)) {
    const profileSnap = await adminDb.collection("profiles").doc(effectiveUid).get();
    resolvedOrgId = profileSnap.data()?.corporate?.linkedinOrganizationId;
  }

  let authorUrn: string;
  try {
    authorUrn = resolveAuthorUrn(segment, userSub, resolvedOrgId);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  console.log(`[linkedin/publish] Posting as ${segment} → ${authorUrn}`);

  // Carousel takes precedence: 2+ images become a PDF document share.
  // Single image (or imageUrls of length 1) goes through the normal Images API path.
  const isCarousel = Array.isArray(imageUrls) && imageUrls.length >= 2;
  let imageUrn: string | null = null;
  let documentUrn: string | null = null;

  if (isCarousel) {
    const plan = await getUserPlan(effectiveUid);
    if (!canUseCarousel(plan)) {
      return NextResponse.json(
        { error: "Carousel posts require the Pro plan or higher.", code: "PLAN_UPGRADE_REQUIRED" },
        { status: 403 }
      );
    }
    const safeUrls = (imageUrls as string[]).filter(isAllowedImageUrl).slice(0, 5);
    if (safeUrls.length < 2) {
      return NextResponse.json(
        { error: "Carousel needs at least 2 valid images." },
        { status: 400 }
      );
    }
    try {
      console.log(`[linkedin/publish] Building carousel PDF from ${safeUrls.length} images...`);
      const pdfBytes = await buildCarouselPdf(safeUrls);
      documentUrn = await uploadDocument(accessToken, authorUrn, pdfBytes);
      if (!documentUrn) {
        return NextResponse.json(
          { error: "Carousel upload to LinkedIn failed. Try again." },
          { status: 502 }
        );
      }
      console.log(`[linkedin/publish] Carousel ready: ${documentUrn}`);
    } catch (err: any) {
      console.error("[linkedin/publish] Carousel build failed:", err?.message || err);
      return NextResponse.json(
        { error: "Could not build carousel PDF from the selected images." },
        { status: 500 }
      );
    }
  } else {
    const singleUrl = imageUrl || (Array.isArray(imageUrls) && imageUrls[0]);
    if (singleUrl) {
      if (!isAllowedImageUrl(singleUrl)) {
        console.warn("[linkedin/publish] Blocked SSRF attempt — imageUrl hostname not in allowlist:", singleUrl);
      } else {
        console.log("[linkedin/publish] Uploading image via Images API...");
        imageUrn = await uploadImage(accessToken, authorUrn, singleUrl);
        if (!imageUrn) {
          console.warn("[linkedin/publish] Image upload failed — posting text only.");
        } else {
          console.log(`[linkedin/publish] Image ready: ${imageUrn}`);
        }
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

  // Attach image or carousel document if upload succeeded
  if (documentUrn) {
    postBody.content = {
      media: {
        title: (carouselTitle && String(carouselTitle).slice(0, 100)) || "Carousel",
        id: documentUrn,
      },
    };
  } else if (imageUrn) {
    postBody.content = {
      media: {
        title: "AI generated image by Cortex",
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
          code: "PARTNER_APPROVAL_REQUIRED",
        },
        { status: 422 }
      );
    }

    // Parse LinkedIn error for a readable message (details logged server-side only — never sent to client)
    let liError = "Publishing failed. Please try again.";
    try {
      const parsed = JSON.parse(errText);
      const msg = parsed.message || parsed.error_description || parsed.error || "";
      // Surface only safe, non-sensitive parts of LinkedIn errors
      if (msg && msg.length < 200) liError = msg;
    } catch {}

    return NextResponse.json(
      { error: liError },
      { status: res.status }
    );
  }

  // Posts API returns the post URN in the "x-restli-id" header
  const postId = res.headers.get("x-restli-id") || res.headers.get("location") || "unknown";
  console.log(`[linkedin/publish] ✅ Success — postId: ${postId} | account: ${segment} | image: ${!!imageUrn}`);

  // Save memory after response is sent — after() keeps the function alive
  // until this completes. Key memory on the effective publisher UID (team
  // owner for member-drafted corporate posts) so the company-page voice
  // pools across the team — same routing as cron + publish-now.
  after(async () => {
    try {
      await savePostMemory({
        content,
        topic:    topic    || "",
        audience: audience || "",
        tone:     tone     || "professional",
        segment:  segment as "individual" | "corporate",
        userId:   effectiveUid,
        postId:   postDbId || undefined,
      });
    } catch (err) {
      console.error('[Memory] savePostMemory failed:', err);
    }
  });

  return NextResponse.json({
    success:    true,
    postId,
    segment,
    authorUrn,
    withImage:    !!imageUrn,
    withCarousel: !!documentUrn,
  });
}
