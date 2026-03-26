/**
 * POST /api/memory/save
 *
 * Internal endpoint — extracts memory from a post and saves to Firestore
 * using Admin SDK (bypasses security rules, works from both client fetch
 * and server-side cron calls).
 *
 * Called by preview/page.tsx after instant publish, and can be used
 * anywhere server-side auth context is unavailable.
 *
 * Node.js runtime required — uses Firebase Admin SDK.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { extractMemory } from "@/lib/ai/memory-extract";

export async function POST(req: NextRequest) {
  try {
    const { content, topic, audience, tone, segment, userId } = await req.json();

    if (!content || !userId) {
      return NextResponse.json({ error: "Missing content or userId" }, { status: 400 });
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
      user_id:     userId,
      segment:     segment || "individual",
      topic:       topic || "",
      audience:    audience || "",
      tone:        tone || "professional",
      summary:     extract.summary,
      keywords:    extract.keywords,
      style_notes: extract.style_notes || "",
      created_at:  FieldValue.serverTimestamp(),
    });

    console.log(`[memory/save] Memory saved for user ${userId}, topic: ${(topic || "").slice(0, 60)}`);
    return NextResponse.json({ saved: true });
  } catch (err: any) {
    console.error("[memory/save] Failed:", err?.message || err);
    // Non-critical — never return 500 to the caller
    return NextResponse.json({ saved: false, error: err?.message });
  }
}
