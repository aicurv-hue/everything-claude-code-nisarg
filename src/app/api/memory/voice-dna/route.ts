import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { voiceDNAService } from "@/lib/db/voice-dna";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const d = await adminAuth.verifyIdToken(h.slice(7));
    uid = d.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const segment = searchParams.get("segment") || "individual";

  const dna = await voiceDNAService.get(uid, segment);
  if (!dna) {
    return NextResponse.json({ notBuilt: true });
  }

  return NextResponse.json(dna);
}
