/**
 * Voice-rewrite pass — runs as the final step of every post generation.
 *
 * Why a dedicated 2nd pass instead of more rules in the main generate prompt:
 * the main prompt juggles research, intent, segment, hook, length, brand etc.
 * Voice gets diluted. A focused single-job rewrite restores it and strips the
 * AI-slop tells (jargon, "In today's digital age", excessive em-dashes, etc.)
 * far more reliably.
 *
 * Pure helper: no auth, no Firestore, no usage gate. Safe to call from edge or
 * node. Always returns — falls back to the original rawText if anything fails,
 * so the caller can chain it without try/catch.
 */
import { openRouter, DEFAULT_MODEL, FALLBACK_MODEL } from "./openrouter";
import { REWRITE_IN_VOICE_PROMPT } from "./neel-prompt-sections";
import { withDateContext } from "./currentContext";

export interface RewriteInVoiceResult {
  rewrittenPost: string;
  changes: string[];
  ok: boolean;
}

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Build the voice description block. Greedy field extraction — works for the
 * structured voiceProfile shape (.tone/.vocabulary/.avgSentence/.pov) and for
 * the wider clientProfile shape (.personality/.verbatimLanguage/.wordsToAvoid).
 * Caller can also pass a pre-built string and it is used as-is.
 */
function buildVoiceBlock(voiceProfile: any): string {
  if (typeof voiceProfile === "string" && voiceProfile.trim().length > 0) {
    return `USER VOICE PROFILE:\n${voiceProfile.trim().slice(0, 2000)}`;
  }
  if (!voiceProfile || typeof voiceProfile !== "object") {
    return "(no explicit voice profile provided — infer from samples if any, otherwise write in a sharp, plain-spoken first-person voice)";
  }

  // Some callers wrap the structured shape inside a .voiceProfile key
  const vp = voiceProfile.voiceProfile && typeof voiceProfile.voiceProfile === "object"
    ? { ...voiceProfile, ...voiceProfile.voiceProfile }
    : voiceProfile;

  const lines: string[] = [];
  if (vp.tone)             lines.push(`- Typical tone: ${String(vp.tone).slice(0, 200)}`);
  if (vp.vocabulary)       lines.push(`- Vocabulary cues: ${String(vp.vocabulary).slice(0, 300)}`);
  if (vp.avgSentence)      lines.push(`- Average sentence length: ${String(vp.avgSentence).slice(0, 100)}`);
  if (vp.pov)              lines.push(`- Point of view: ${String(vp.pov).slice(0, 200)}`);
  if (vp.personality)      lines.push(`- Personality: ${String(vp.personality).slice(0, 300)}`);
  if (vp.verbatimLanguage) lines.push(`- Native phrases to weave in: ${String(vp.verbatimLanguage).slice(0, 300)}`);
  if (vp.wordsToAvoid)     lines.push(`- Words / phrases to NEVER use: ${String(vp.wordsToAvoid).slice(0, 300)}`);

  return lines.length > 0
    ? `USER VOICE PROFILE:\n${lines.join("\n")}`
    : "(no explicit voice profile provided — infer from samples if any, otherwise write in a sharp, plain-spoken first-person voice)";
}

/**
 * Build the writing-samples block. Accepts:
 *   - string[]                       (raw post text)
 *   - { content | text }[]           (UI-side sample objects)
 *   - PostMemory[]                   (style_notes / summary / keywords)
 */
function buildSamplesBlock(writingSamples: any): string {
  if (!Array.isArray(writingSamples) || writingSamples.length === 0) return "";

  const samples: string[] = writingSamples
    .map((s: any) => {
      if (typeof s === "string") return s;
      if (!s || typeof s !== "object") return "";
      if (typeof s.content === "string" && s.content.trim()) return s.content;
      if (typeof s.text === "string" && s.text.trim())       return s.text;
      // PostMemory shape — no raw post text, but style_notes is high-signal.
      const parts: string[] = [];
      if (s.style_notes) parts.push(`Voice pattern: ${String(s.style_notes)}`);
      if (s.summary)     parts.push(`What it covered: ${String(s.summary)}`);
      if (Array.isArray(s.keywords) && s.keywords.length > 0) {
        parts.push(`Key terms: ${s.keywords.join(", ")}`);
      }
      return parts.join("\n");
    })
    .filter((s: string) => typeof s === "string" && s.trim().length > 0)
    .slice(0, 3)
    .map((s: string) => s.trim().slice(0, 800));

  if (samples.length === 0) return "";

  return `\n\nUSER WRITING SAMPLES (ground-truth voice):\n${samples
    .map((s, i) => `Sample ${i + 1}:\n${s}`)
    .join("\n\n")}`;
}

async function callWithTimeout(model: string, prompt: string, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await openRouter.chat.completions.create(
      {
        model,
        messages: withDateContext([{ role: "user", content: prompt }]),
        temperature: 0.6,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      },
      { signal: controller.signal as any }
    );
  } finally {
    clearTimeout(id);
  }
}

export async function rewriteInVoice(args: {
  rawText: string;
  voiceProfile?: any;
  writingSamples?: any;
  timeoutMs?: number;
}): Promise<RewriteInVoiceResult> {
  const rawText = (args.rawText || "").trim();
  const fallback: RewriteInVoiceResult = { rewrittenPost: rawText, changes: [], ok: false };

  if (!rawText || rawText.length < 5) return fallback;

  const voiceBlock   = buildVoiceBlock(args.voiceProfile);
  const samplesBlock = buildSamplesBlock(args.writingSamples);
  const filledVoice  = `${voiceBlock}${samplesBlock}`;

  const prompt = REWRITE_IN_VOICE_PROMPT
    .replace("{voiceProfile}", filledVoice)
    .replace("{rawText}", rawText.slice(0, 6000));

  const timeoutMs = args.timeoutMs ?? 10000;

  let parsed: any = null;
  try {
    let completion;
    try {
      completion = await callWithTimeout(DEFAULT_MODEL, prompt, timeoutMs);
    } catch (err: any) {
      const reason = err?.name === "AbortError" ? "timeout" : (err?.status || err?.code || err?.message);
      console.warn(`[rewriteInVoice] ${DEFAULT_MODEL} failed (${reason}) — retrying with ${FALLBACK_MODEL}`);
      completion = await callWithTimeout(FALLBACK_MODEL, prompt, Math.max(6000, Math.floor(timeoutMs * 0.8)));
    }
    const raw = completion.choices?.[0]?.message?.content || "";
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
      }
    }
  } catch (err: any) {
    console.error("[rewriteInVoice] OpenRouter error:", err?.message || err);
    return fallback;
  }

  const rewritten: string = (parsed && typeof parsed.rewrittenPost === "string" && parsed.rewrittenPost.trim().length > 0)
    ? parsed.rewrittenPost.replace(/\*+/g, "").trim()
    : "";

  // Guard against degenerate outputs (model returned a stub or echoed an instruction)
  if (rewritten.length < Math.max(80, Math.floor(rawText.length * 0.4))) {
    console.warn(`[rewriteInVoice] rewritten output suspiciously short (raw=${rawText.length}, rewritten=${rewritten.length}) — keeping original`);
    return fallback;
  }

  const changesRaw: any[] = Array.isArray(parsed?.changes) ? parsed.changes : [];
  const changes: string[] = changesRaw
    .filter((c) => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 6);

  return { rewrittenPost: rewritten, changes, ok: true };
}
