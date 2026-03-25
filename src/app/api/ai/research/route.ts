import { NextRequest, NextResponse } from "next/server";
import { performResearch } from "@/lib/ai/research";

// Extend Vercel function timeout to 60s (Hobby max) — research needs 2 AI calls
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, options } = body;
    if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });
    const result = await performResearch(topic, options || {});
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/ai/research] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Research failed" }, { status: 500 });
  }
}
