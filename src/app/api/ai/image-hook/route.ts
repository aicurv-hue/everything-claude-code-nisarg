import { NextRequest, NextResponse } from "next/server";
import { generateImageHook } from "@/lib/ai/generate";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

// Edge Runtime — no timeout on Vercel Hobby plan
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { post, topic } = await req.json();
    if (!post) return NextResponse.json({ error: "post required" }, { status: 400 });
    const hook = await generateImageHook(post, topic || "LinkedIn post");
    return NextResponse.json({ hook });
  } catch (err: any) {
    console.error("[api/ai/image-hook] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Hook generation failed" }, { status: 500 });
  }
}
