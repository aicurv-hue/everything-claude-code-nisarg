import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { generateCarouselPrompts } from "@/lib/ai/generate";
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

  // Plan gate — carousel is Pro+ only.
  const plan = await getUserPlan(uid);
  if (!canUseCarousel(plan)) {
    return NextResponse.json(
      { error: "Carousel posts require the Pro plan or higher.", code: "PLAN_UPGRADE_REQUIRED" },
      { status: 403 }
    );
  }

  try {
    const { topic, audience, tone, post, slideCount } = await req.json();
    if (!post || typeof post !== "string") {
      return NextResponse.json({ error: "post required" }, { status: 400 });
    }
    const n = Math.max(2, Math.min(5, Number(slideCount) || 0));
    if (!n) return NextResponse.json({ error: "slideCount must be 2–5" }, { status: 400 });

    const prompts = await generateCarouselPrompts({
      topic:    topic    || "LinkedIn post",
      audience: audience || "professionals",
      tone:     tone     || "professional",
      post,
      slideCount: n,
    });
    return NextResponse.json({ prompts });
  } catch (err: any) {
    console.error("[api/ai/carousel-prompts] Error:", err?.message || err);
    return NextResponse.json({ error: "Carousel prompt generation failed" }, { status: 500 });
  }
}
