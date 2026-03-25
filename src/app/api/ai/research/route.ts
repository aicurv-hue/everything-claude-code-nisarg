import { NextRequest, NextResponse } from "next/server";
import { performResearch } from "@/lib/ai/research";
import { adminAuth } from "@/lib/firebase-admin";

// Extend Vercel function timeout to 60s (Hobby max) — research needs 2 AI calls
export const maxDuration = 60;

async function verifyUser(req: NextRequest): Promise<boolean> {
  if (!adminAuth) return true; // local dev without Admin SDK — allow all
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return false;
  try { await adminAuth.verifyIdToken(token); return true; } catch { return false; }
}

export async function POST(req: NextRequest) {
  if (!await verifyUser(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
