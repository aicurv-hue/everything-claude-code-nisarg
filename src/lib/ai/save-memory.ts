/**
 * savePostMemory — shared helper called after any confirmed LinkedIn publish.
 *
 * Works in both server-side API routes (cron worker) and as a fallback.
 * Uses Admin SDK when available (server-side) — bypasses Firestore security rules.
 * Falls back to client SDK when adminDb is unavailable (local dev mock mode).
 */
import { extractMemory } from "./memory-extract";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function savePostMemory({
  content,
  topic,
  audience,
  tone,
  segment,
  userId = "",
}: {
  content: string;
  topic: string;
  audience: string;
  tone: string;
  segment: "individual" | "corporate";
  userId?: string;
}): Promise<void> {
  try {
    const extract = await extractMemory(content, topic, audience, tone);
    if (!extract) return;

    if (adminDb) {
      // Server-side path — Admin SDK bypasses Firestore security rules
      await adminDb.collection("post_memories").add({
        user_id:     userId,
        segment,
        source:      "auto",
        topic,
        audience,
        tone,
        summary:     extract.summary,
        keywords:    extract.keywords,
        style_notes: extract.style_notes || "",
        created_at:  FieldValue.serverTimestamp(),
      });
    } else {
      // Fallback — client SDK (local dev mock mode only)
      const { memoryService } = await import("@/lib/db/memory");
      await memoryService.save({
        user_id:     userId,
        segment,
        topic,
        audience,
        tone,
        summary:     extract.summary,
        keywords:    extract.keywords,
        style_notes: extract.style_notes || undefined,
      });
    }

    console.log(`[Memory] Saved memory for topic: ${topic.slice(0, 60)}`);
  } catch (err) {
    console.warn("[Memory] savePostMemory failed (non-critical):", err);
  }
}
