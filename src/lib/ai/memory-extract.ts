/**
 * Memory Extraction — Post-generation summarisation pipeline
 *
 * After Neel writes a post, this module extracts:
 *   - A 2-sentence summary capturing the angle + core argument
 *   - 5–10 concrete keywords for relevance scoring in future retrievals
 *
 * Design principles (backend-patterns skill):
 *   - Uses the cheapest capable model (gpt-4o-mini) — ~$0.0002 per call
 *   - Structured JSON output enforced by prompt — no parsing ambiguity
 *   - Fails silently — extraction failure must NEVER block post generation
 *   - Token budget: ~600 in / ~100 out — well within cost targets
 */

import { openRouter } from "./openrouter";

export interface MemoryExtract {
  summary: string;      // 2 sentences: angle taken + core argument/conclusion
  keywords: string[];   // 5–10 concrete, lowercase terms — no stop-words
  style_notes: string;  // 1 sentence: HOW this person writes — voice, rhythm, tone markers
}

const EXTRACT_MODEL = "openai/gpt-4o-mini"; // Always use cheapest model for extraction

/**
 * Extract a compact memory record from a generated post.
 *
 * Called fire-and-forget after generation — never awaited by the UI.
 * On any failure, returns null so the caller can skip saving gracefully.
 */
export async function extractMemory(
  content: string,
  topic: string,
  audience: string,
  tone: string
): Promise<MemoryExtract | null> {
  try {
    // Truncate content to 800 chars max — enough context, fewer tokens
    const truncated = content.length > 800 ? content.slice(0, 800) + "…" : content;

    const systemPrompt = `You are a memory indexer for a LinkedIn content system.
Your job: extract a compact memory record from a LinkedIn post so future posts can:
1. Avoid exact repetition of angles and conclusions
2. Maintain the author's consistent writing voice and style

OUTPUT RULES:
- Return ONLY valid JSON. No markdown, no explanation, no preamble.
- Exact schema: { "summary": "string", "keywords": ["string"], "style_notes": "string" }
- summary: exactly 2 sentences. Sentence 1 = the angle or perspective used. Sentence 2 = the core argument or conclusion made.
- keywords: 5–10 terms. Concrete nouns and phrases only. Lowercase. No generic words like "linkedin", "post", "content", "tips".
- style_notes: exactly 1 sentence. Describe HOW this person writes — their sentence rhythm (short/long), vocabulary register (simple/technical), use of data (heavy/light), personal vs analytical voice, and any distinctive patterns (e.g. "Uses very short punchy sentences with data in the hook, then builds with 2-sentence paragraphs, conversational closing").

GOOD example output:
{
  "summary": "Argued that 72% of factory owners overpay for energy due to one meter calibration issue. Positioned regular audits as the fix, not capital investment.",
  "keywords": ["energy audit", "factory costs", "meter calibration", "manufacturing efficiency", "gujarat industry", "pump data"],
  "style_notes": "Short declarative sentences with specific numbers in the hook, analytical mid-section with 2-sentence paragraphs, ends with a direct question to the reader."
}

BAD keywords: ["linkedin", "post", "tips", "professional", "growth", "success"]
BAD style_notes: "Professional and engaging" (too vague — describe the actual sentence patterns)`;

    const userPrompt = `Extract memory from this LinkedIn post.

Topic: ${topic}
Audience: ${audience}
Tone: ${tone}

Post:
${truncated}

Return JSON only.`;

    const res = await openRouter.chat.completions.create({
      model: EXTRACT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      temperature: 0.1, // Low temp — we want consistent structured output
      max_tokens: 200,  // Summary + 10 keywords fit easily in 200 tokens
    });

    const raw = (res.choices[0].message.content || "").trim();

    // Parse — tolerates ```json fences
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonStr = fenced ? fenced[1].trim() : raw;
    const parsed = JSON.parse(jsonStr);

    if (!parsed.summary || !Array.isArray(parsed.keywords)) {
      console.error("[Memory Extract] Unexpected shape:", parsed);
      return null;
    }

    return {
      summary:     String(parsed.summary).trim(),
      keywords:    (parsed.keywords as string[])
        .map((k) => String(k).toLowerCase().trim())
        .filter((k) => k.length > 2)
        .slice(0, 10),
      style_notes: parsed.style_notes ? String(parsed.style_notes).trim() : "",
    };
  } catch (err) {
    // Silent failure — memory extraction is always optional
    console.error("[Memory Extract] Failed:", err);
    return null;
  }
}
