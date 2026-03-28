import { NextRequest, NextResponse } from "next/server";
import { generateImagePrompt } from "@/lib/ai/generate";

// Edge Runtime — no timeout on Vercel Hobby plan
export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { topic, segment, post, imageStyle } = await req.json();
    if (!post) return NextResponse.json({ error: "post required" }, { status: 400 });
    const imagePrompt = await generateImagePrompt(
      topic || "LinkedIn post",
      segment || "individual",
      post,
      imageStyle,
    );
    return NextResponse.json({ imagePrompt });
  } catch (err: any) {
    console.error("[api/ai/image-prompt] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Image prompt generation failed" }, { status: 500 });
  }
}
