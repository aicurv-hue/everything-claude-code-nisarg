import { NextRequest, NextResponse } from "next/server";
import { generatePost } from "@/lib/ai/generate";

// Extend Vercel function timeout to 60s (Hobby max) — generation needs 1-2 AI calls
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await generatePost(body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/ai/generate] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Generation failed" }, { status: 500 });
  }
}
