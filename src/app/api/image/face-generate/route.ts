import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { checkAndIncrementUsage } from "@/lib/usageTracking";
import { getUserPlan } from "@/lib/checkSubscription";

const STYLE_PROMPTS: Record<string, string> = {
  professional: "professional LinkedIn headshot, modern office background, natural window light, clean corporate setting, confident pose",
  casual: "casual professional photo, cafe or coworking space background, warm natural light, relaxed confident expression",
  minimal: "clean minimal background, light gray gradient, professional portrait, studio lighting",
  creative: "creative workspace background, colorful but professional, dynamic composition, modern creative office",
};

export async function POST(req: NextRequest) {
  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Gate: free plan cannot use Use My Face
    const plan = await getUserPlan(uid);
    if (plan === "free") {
      return NextResponse.json(
        {
          error: "Use My Face is not available on the Free plan. Upgrade to Starter or above.",
          code: "PLAN_GATE",
          plan: "free",
          upgradeUrl: "/#pricing",
        },
        { status: 403 }
      );
    }

    // Check and increment face image quota
    const usageCheck = await checkAndIncrementUsage(uid, "faceImage");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: "Monthly face image limit reached. Upgrade your plan to continue.",
          code: "LIMIT_EXCEEDED",
          limit: usageCheck.limit,
          used: usageCheck.used,
          plan: usageCheck.plan,
          upgradeUrl: "/#pricing",
        },
        { status: 429 }
      );
    }

    const { backgroundStyle = "professional", postTopic = "" } = await req.json();

    // Read profile photo URL from Firestore
    const profileSnap = await adminDb.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      return NextResponse.json({ error: "Profile not found. Upload a profile photo in Settings first." }, { status: 400 });
    }
    const profileData = profileSnap.data() as any;
    const profilePhotoUrl = profileData?.profilePhotoUrl;
    if (!profilePhotoUrl) {
      return NextResponse.json({ error: "No profile photo found. Upload one in Settings → Identity." }, { status: 400 });
    }

    const falApiKey = process.env.FAL_API_KEY;
    if (!falApiKey) {
      return NextResponse.json({ error: "FAL_API_KEY not configured." }, { status: 500 });
    }

    const stylePrompt = STYLE_PROMPTS[backgroundStyle] || STYLE_PROMPTS.professional;
    const prompt = `Portrait of a professional person, ${stylePrompt}, high quality photography, sharp focus, LinkedIn profile photo style${postTopic ? `, relevant to the topic: ${postTopic}` : ""}`;

    const falRes = await fetch("https://fal.run/fal-ai/flux-pulid", {
      method: "POST",
      headers: {
        Authorization: `Key ${falApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference_images: [{ url: profilePhotoUrl }],
        prompt,
        image_size: "square_hd",
        num_inference_steps: 28,
        num_images: 1,
      }),
    });

    if (!falRes.ok) {
      const errText = await falRes.text();
      console.error("[face-generate] FAL error:", falRes.status, errText);
      return NextResponse.json({ error: "Image generation failed. Please try again." }, { status: 500 });
    }

    const falData = await falRes.json();
    const imageUrl = falData?.images?.[0]?.url || falData?.image?.url;
    if (!imageUrl) {
      return NextResponse.json({ error: "No image returned from generator." }, { status: 500 });
    }

    return NextResponse.json({ url: imageUrl });
  } catch (err: any) {
    console.error("[face-generate] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
