import { NextRequest, NextResponse } from "next/server";
import { generatePost } from "@/lib/ai/generate";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

// Edge Runtime — no timeout on Vercel Hobby plan (unlike serverless 10s limit)
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const result = await generatePost(body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/ai/generate] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Generation failed" }, { status: 500 });
  }
}
