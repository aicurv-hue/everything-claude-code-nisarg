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
      source:      "auto",
      topic:       topic || "",
      audience:    audience || "",
      tone:        tone || "professional",
      summary:     extract.summary,
      keywords:    extract.keywords,
      style_notes: extract.style_notes || "",
      created_at:  FieldValue.serverTimestamp(),
    });

    console.log(`[memory/save] Memory saved for user ${firebaseUid}, topic: ${(topic || "").slice(0, 60)}`);

    // Trigger Voice DNA rebuild every 10th memory (fire-and-forget)
    const seg = segment || "individual";
    adminDb.collection("post_memories")
      .where("user_id", "==", firebaseUid)
      .where("segment", "==", seg)
      .count().get()
      .then((countSnap) => {
        const total = countSnap.data().count;
        if (total >= 5 && total % 10 === 0) {
          console.log(`[memory/save] Triggering Voice DNA build (${total} memories)`);
          const origin = req.headers.get("origin") || req.nextUrl.origin;
          fetch(`${origin}/api/memory/build-voice-dna`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: req.headers.get("authorization") || "",
            },
            body: JSON.stringify({ segment: seg }),
          }).catch((e) => console.error("[memory/save] Voice DNA trigger failed:", e));
        }
      })
      .catch(() => {});

    return NextResponse.json({ saved: true });
  } catch (err: any) {
    console.error("[memory/save] Failed:", err?.message || err);
    return NextResponse.json({ saved: false, error: err?.message });
  }
}
