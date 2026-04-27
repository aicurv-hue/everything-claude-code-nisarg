import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { voiceDNAService } from "@/lib/db/voice-dna";
import { buildVoiceDNA } from "@/lib/ai/voice-dna";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

  const { segment = "individual" } = await req.json();

  // Fetch all style_notes
  const snap = await adminDb
    .collection("post_memories")
    .where("user_id", "==", uid)
    .where("segment", "==", segment)
    .orderBy("created_at", "desc")
    .limit(100)
    .get();

  const styleNotes = snap.docs
    .map((d) => d.data().style_notes)
    .filter((s): s is string => !!s);

  if (styleNotes.length < 5) {
    return NextResponse.json({ skipped: true, reason: "not enough posts", count: styleNotes.length });
  }

  const existing = await voiceDNAService.get(uid, segment);
  const dna = await buildVoiceDNA(uid, segment as "individual" | "corporate", styleNotes, existing);

  if (!dna) {
    return NextResponse.json({ skipped: true, reason: "build failed" });
  }

  await voiceDNAService.save(dna as any);
  return NextResponse.json({ built: true, version: dna.version, postsAnalysed: dna.postsAnalysed });
}
