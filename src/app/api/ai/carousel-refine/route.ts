import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { refineCarouselPrompt } from "@/lib/ai/generate";
import { getUserPlan, canUseCarousel } from "@/lib/checkSubscription";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth!.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const plan = await getUserPlan(uid);
  if (!canUseCarousel(plan)) {
    return NextResponse.json(
      { error: "Carousel posts require the Pro plan or higher.", code: "PLAN_UPGRADE_REQUIRED" },
      { status: 403 }
    );
  }

  try {
    const { originalPrompt, userComment, topic } = await req.json();
    if (!originalPrompt || typeof originalPrompt !== "string") {
      return NextResponse.json({ error: "originalPrompt required" }, { status: 400 });
    }
    if (!userComment || typeof userComment !== "string") {
      return NextResponse.json({ error: "userComment required" }, { status: 400 });
    }
    const newPrompt = await refineCarouselPrompt({
      originalPrompt,
      userComment,
      topic: topic || "LinkedIn post",
    });
    return NextResponse.json({ prompt: newPrompt });
  } catch (err: any) {
    console.error("[api/ai/carousel-refine] Error:", err?.message || err);
    return NextResponse.json({ error: "Refinement failed" }, { status: 500 });
  }
}
