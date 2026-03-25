import { NextRequest, NextResponse } from "next/server";
import { generatePost } from "@/lib/ai/generate";
import { adminAuth } from "@/lib/firebase-admin";

// Extend Vercel function timeout to 60s (Hobby max) — generation needs 1-2 AI calls
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
    const result = await generatePost(body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/ai/generate] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Generation failed" }, { status: 500 });
  }
}
