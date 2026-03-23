/**
 * savePostMemory — shared helper called after any confirmed LinkedIn publish.
 * Works in both Server Actions (preview page) and API routes (cron worker).
 */
import { extractMemory } from "./memory-extract";
import { memoryService } from "@/lib/db/memory";

export async function savePostMemory({
  content,
  topic,
  audience,
  tone,
  segment,
  userId = "demo-user",
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
    console.log(`[Memory] Saved memory for topic: ${topic.slice(0, 60)}`);
  } catch (err) {
    console.warn("[Memory] savePostMemory failed (non-critical):", err);
  }
}
