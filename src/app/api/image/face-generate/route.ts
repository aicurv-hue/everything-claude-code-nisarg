import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { checkAndIncrementUsage, refundUsage } from "@/lib/usageTracking";
import { getUserPlan } from "@/lib/checkSubscription";

// Node runtime: POST requires Firestore (profile photo URL, plan gate, quota).
// GET (poll) stays Node too — same file, same auth pattern, <1s per call.
export const runtime = "nodejs";

const FAL_SLUG   = "fal-ai/flux-pulid";
const QUEUE_BASE = "https://queue.fal.run";

const STYLE_PROMPTS: Record<string, string> = {
  professional: "professional LinkedIn headshot, modern office background, natural window light, clean corporate setting, confident pose",
  casual: "casual professional photo, cafe or coworking space background, warm natural light, relaxed confident expression",
  minimal: "clean minimal background, light gray gradient, professional portrait, studio lighting",
  creative: "creative workspace background, colorful but professional, dynamic composition, modern creative office",
};

// ── POST — submit a new face-generation job ─────────────────────────────────
// Body: { backgroundStyle: string, postTopic?: string }
// Returns: { request_id: string }
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const plan = await getUserPlan(uid);
    if (plan === "free") {
      return NextResponse.json(
        { error: "Use My Face is not available on the Free plan. Upgrade to Starter or above.", code: "PLAN_GATE", plan: "free", upgradeUrl: "/#pricing" },
        { status: 403 }
      );
    }

    // Parse body before quota increment so a malformed request doesn't leak a usage count.
    const { backgroundStyle = "professional", postTopic = "" } = await req.json();

    const usageCheck = await checkAndIncrementUsage(uid, "faceImage");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "Monthly face image limit reached. Upgrade your plan to continue.", code: "LIMIT_EXCEEDED", limit: usageCheck.limit, used: usageCheck.used, plan: usageCheck.plan, upgradeUrl: "/#pricing" },
        { status: 429 }
      );
    }

    const profileSnap = await adminDb.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      await refundUsage(uid, "faceImage");
      return NextResponse.json({ error: "Profile not found. Upload a profile photo in Settings first." }, { status: 400 });
    }
    const profilePhotoUrl = (profileSnap.data() as any)?.profilePhotoUrl;
    if (!profilePhotoUrl) {
      await refundUsage(uid, "faceImage");
      return NextResponse.json({ error: "No profile photo found. Upload one in Settings → Identity." }, { status: 400 });
    }

    const falApiKey = process.env.FAL_API_KEY;
    if (!falApiKey) {
      await refundUsage(uid, "faceImage");
      return NextResponse.json({ error: "FAL_API_KEY not configured." }, { status: 500 });
    }

    const stylePrompt = STYLE_PROMPTS[backgroundStyle] || STYLE_PROMPTS.professional;
    const prompt = `Portrait of a professional person, ${stylePrompt}, high quality photography, sharp focus, LinkedIn profile photo style${postTopic ? `, relevant to the topic: ${postTopic}` : ""}`;

    // Submit to fal.ai queue — returns immediately with a request_id.
    // The client polls GET below; no Vercel timeout risk.
    const submitRes = await fetch(`${QUEUE_BASE}/${FAL_SLUG}`, {
      method: "POST",
      headers: { Authorization: `Key ${falApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        reference_images: [{ url: profilePhotoUrl }],
        prompt,
        image_size: "square_hd",
        num_inference_steps: 28,
        num_images: 1,
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      console.error("[face-generate] fal submit error:", submitRes.status, errText);
      // Refund — quota charged but job never entered the queue.
      await refundUsage(uid, "faceImage");
      return NextResponse.json({ error: "Image generation service unavailable. Please try again." }, { status: 502 });
    }

    const submitData = await submitRes.json() as { request_id?: string };
    if (!submitData.request_id) {
      await refundUsage(uid, "faceImage");
      return NextResponse.json({ error: "No request_id from image service." }, { status: 502 });
    }

    return NextResponse.json({ request_id: submitData.request_id });
  } catch (err: any) {
    console.error("[face-generate POST] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// ── GET — poll an existing face-generation job ──────────────────────────────
// ?id=<request_id>
// Returns: { status: "IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"|"FAILED", url?, error? }
// On FAILED, best-effort refunds the faceImage quota charged on POST.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const falApiKey = process.env.FAL_API_KEY;
    if (!falApiKey) return NextResponse.json({ status: "FAILED", error: "FAL_API_KEY not configured." });

    // Check status
    const statusRes = await fetch(`${QUEUE_BASE}/${FAL_SLUG}/requests/${id}/status`, {
      headers: { Authorization: `Key ${falApiKey}` },
    });
    if (!statusRes.ok) {
      return NextResponse.json({ status: "FAILED", error: `Status check failed (HTTP ${statusRes.status}).` });
    }
    const statusData = await statusRes.json() as { status?: string };

    if (statusData.status === "COMPLETED") {
      const resultRes = await fetch(`${QUEUE_BASE}/${FAL_SLUG}/requests/${id}`, {
        headers: { Authorization: `Key ${falApiKey}` },
      });
      if (!resultRes.ok) {
        return NextResponse.json({ status: "FAILED", error: `Result fetch failed (HTTP ${resultRes.status}).` });
      }
      const resultData = await resultRes.json();
      const imageUrl = resultData?.images?.[0]?.url || resultData?.image?.url;
      if (!imageUrl) {
        return NextResponse.json({ status: "FAILED", error: "No image URL in fal.ai result." });
      }
      return NextResponse.json({ status: "COMPLETED", url: imageUrl });
    }

    if (statusData.status === "FAILED" || statusData.status === "ERROR") {
      // Best-effort refund — job failed on fal side, user should not be charged.
      refundUsage(uid, "faceImage").catch(() => {});
      return NextResponse.json({ status: "FAILED", error: "Image generation failed on the fal.ai side." });
    }

    return NextResponse.json({ status: statusData.status || "IN_PROGRESS" });
  } catch (err: any) {
    console.error("[face-generate GET] Error:", err);
    return NextResponse.json({ status: "FAILED", error: err.message || "Poll failed." }, { status: 500 });
  }
}
