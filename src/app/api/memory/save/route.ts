/**
 * POST /api/memory/save
 *
 * Extracts memory from a post and saves to Firestore using Admin SDK.
 * Requires Authorization: Bearer <firebase-id-token> header.
 * The userId in the body MUST match the verified Firebase UID — no spoofing.
 *
 * Node.js runtime required — uses Firebase Admin SDK.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { extractMemory } from "@/lib/ai/memory-extract";

export async function POST(req: NextRequest) {
  try {
    // ── Auth: verify Firebase token ───────────────────────────────────────────
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ") || !adminAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let firebaseUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      firebaseUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const { content, topic, audience, tone, segment } = await req.json();

    if (!content) {
      return NextResponse.json({ error: "Missing content" }, { status: 400 });
    }

    if (!adminDb) {
      console.warn("[memory/save] adminDb unavailable — memory not saved");
      return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
    }

    const extract = await extractMemory(content, topic || "", audience || "", tone || "professional");
    if (!extract) {
      return NextResponse.json({ saved: false, reason: "extraction returned null" });
    }

    await adminDb.collection("post_memories").add({
      user_id:     firebaseUid,          // always from verified token — never from body
      segment:     segment || "individual",
      topic:       topic || "",
      audience:    audience || "",
      tone:        tone || "professional",
      summary:     extract.summary,
      keywords:    extract.keywords,
      style_notes: extract.style_notes || "",
      created_at:  FieldValue.serverTimestamp(),
    });

    console.log(`[memory/save] Memory saved for user ${firebaseUid}, topic: ${(topic || "").slice(0, 60)}`);
    return NextResponse.json({ saved: true });
  } catch (err: any) {
    console.error("[memory/save] Failed:", err?.message || err);
    return NextResponse.json({ saved: false, error: err?.message });
  }
}
