import { NextRequest, NextResponse } from "next/server";
import { generateImagePrompt } from "@/lib/ai/generate";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

// Edge Runtime — no timeout on Vercel Hobby plan
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    return NextResponse.json({ error: "Image prompt generation failed" }, { status: 500 });
  }
}
