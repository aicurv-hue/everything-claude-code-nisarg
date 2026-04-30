import { openRouter, DEFAULT_MODEL, FALLBACK_MODEL } from "./openrouter";
import type { VoiceDNA } from "@/lib/db/voice-dna";

export async function buildVoiceDNA(
  userId: string,
  segment: "individual" | "corporate",
  styleNotes: string[],
  existingDNA?: VoiceDNA | null
): Promise<Omit<VoiceDNA, "lastBuiltAt"> | null> {
  if (styleNotes.length < 5) return null;

  const continuityBlock = existingDNA
    ? `\nPrevious Voice DNA (v${existingDNA.version}, ${existingDNA.postsAnalysed} posts) — refine, don't restart:\n- Sentence Rhythm: ${existingDNA.sentenceRhythm}\n- Vocabulary: ${existingDNA.vocabularyRegister}\n- Hook Pattern: ${existingDNA.hookPreference}\n- CTA Style: ${existingDNA.ctaStyle}\n- Emoji Usage: ${existingDNA.emojiUsage}\n- Formatting: ${existingDNA.formattingHabits}\n- Consistency Score: ${existingDNA.consistencyScore}/100\n`
    : "";

  const system = `You are a writing style analyst. Given style observations from the same author's posts, synthesize a Voice DNA profile.

Return ONLY valid JSON with these fields:
- sentenceRhythm: string (how they structure sentences — length, patterns, rhythm)
- vocabularyRegister: string (formal/casual, jargon usage, word choices)
- hookPreference: string (how they typically open posts)
- ctaStyle: string (how they end posts — questions, imperatives, reflections)
- emojiUsage: string (frequency, placement, types)
- formattingHabits: string (bullet lists, paragraphs, whitespace usage)
- consistencyScore: number 0-100 (how uniform these patterns are across posts)
- dominantPatterns: string[] (top 3-5 observed writing patterns)

Each dimension must be a specific, actionable sentence a ghost-writer could follow.${continuityBlock}`;

  const user = `Style observations from ${styleNotes.length} posts:\n${styleNotes.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;

  let parsed: any = null;
  for (const model of [DEFAULT_MODEL, FALLBACK_MODEL]) {
    try {
      const res = await openRouter.chat.completions.create({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.1,
        max_tokens: 500,
      });
      const text = res.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { console.warn(`[voice-dna] ${model} returned no JSON — trying next`); continue; }
      parsed = JSON.parse(jsonMatch[0]);
      if (parsed) break;
    } catch (err) {
      console.error(`[voice-dna] ${model} failed:`, err);
    }
  }
  if (!parsed) return null;
  try {
    return {
      user_id: userId,
      segment,
      sentenceRhythm: parsed.sentenceRhythm || "",
      vocabularyRegister: parsed.vocabularyRegister || "",
      hookPreference: parsed.hookPreference || "",
      ctaStyle: parsed.ctaStyle || "",
      emojiUsage: parsed.emojiUsage || "",
      formattingHabits: parsed.formattingHabits || "",
      consistencyScore: parsed.consistencyScore ?? 0,
      dominantPatterns: parsed.dominantPatterns || [],
      postsAnalysed: styleNotes.length,
      version: (existingDNA?.version || 0) + 1,
      previousConsistencyScore: existingDNA?.consistencyScore,
      previousDominantPatterns: existingDNA?.dominantPatterns,
    };
  } catch (err) {
    console.error("[voice-dna] Build failed:", err);
    return null;
  }
}

export function buildVoiceDNAPromptBlock(dna: VoiceDNA): string {
  return `
══════════════════════════════════════════
VOICE DNA — PERMANENT WRITING FINGERPRINT (v${dna.version}, built from ${dna.postsAnalysed} posts)
══════════════════════════════════════════
Sentence Rhythm: ${dna.sentenceRhythm}
Vocabulary: ${dna.vocabularyRegister}
Hook Pattern: ${dna.hookPreference}
CTA Style: ${dna.ctaStyle}
Emoji Usage: ${dna.emojiUsage}
Formatting: ${dna.formattingHabits}
Core Patterns: ${dna.dominantPatterns.join(", ")}

MANDATE: Your output MUST match every dimension above exactly. This is the author's established writing fingerprint extracted from ${dna.postsAnalysed} real posts.
══════════════════════════════════════════`;
}
