import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";
import { openRouter } from "@/lib/ai/openrouter";

const PRIMARY_SCORE_MODEL  = "google/gemini-2.5-flash";
const FALLBACK_SCORE_MODEL = "google/gemini-2.5-flash";
import { POST_QUALITY_SCORE_PROMPT } from "@/lib/ai/neel-prompt-sections";

// Edge runtime — quality scoring uses OpenRouter, mirrors /api/ai/research pattern.
export const runtime = "edge";

type Breakdown = { hook: number; voiceMatch: number; structure: number; engagement: number; antiSlop: number };
type ScoreResult = {
  score: number;
  breakdown: Breakdown;
  suggestions: string[];
  rewrittenHook?: string;
};

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function safeFallback(): ScoreResult {
  return {
    score: 0,
    breakdown: { hook: 0, voiceMatch: 0, structure: 0, engagement: 0, antiSlop: 0 },
    suggestions: [
      "Cortex couldn't score this post right now — try Re-score in a moment.",
      "Check that the post has at least a hook and a body paragraph.",
      "If this keeps happening, regenerate the post and try again.",
    ],
  };
}

function clamp(n: any, lo: number, hi: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function normalize(parsed: any): ScoreResult {
  const b = parsed?.breakdown ?? {};
  const breakdown: Breakdown = {
    hook:        clamp(b.hook, 0, 30),
    voiceMatch:  clamp(b.voiceMatch, 0, 25),
    structure:   clamp(b.structure, 0, 20),
    engagement:  clamp(b.engagement, 0, 15),
    antiSlop:    clamp(b.antiSlop, 0, 10),
  };
  const sumBreakdown = breakdown.hook + breakdown.voiceMatch + breakdown.structure + breakdown.engagement + breakdown.antiSlop;
  const rawScore = clamp(parsed?.score, 0, 100);
  const score = rawScore > 0 ? rawScore : sumBreakdown;
  const suggestionsRaw: string[] = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const suggestions = suggestionsRaw.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 3);
  while (suggestions.length < 3) suggestions.push("Tighten the hook and make the opening more specific.");
  const rewrittenHook = typeof parsed?.rewrittenHook === "string" && parsed.rewrittenHook.trim().length > 0
    ? parsed.rewrittenHook.trim()
    : undefined;
  return { score, breakdown, suggestions, rewrittenHook };
}

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { postText, voiceProfile, writingSamples } = await req.json();
    if (!postText || typeof postText !== "string" || postText.trim().length < 10) {
      return NextResponse.json({ error: "postText required" }, { status: 400 });
    }

    // Build voice context block (caller is expected to pass these from the page state;
    // matches /api/ai/research and /api/ai/extract-context which receive context via body).
    const voiceLines: string[] = [];
    if (voiceProfile && typeof voiceProfile === "object") {
      if (voiceProfile.tone)        voiceLines.push(`- Typical tone: ${String(voiceProfile.tone).slice(0, 200)}`);
      if (voiceProfile.vocabulary)  voiceLines.push(`- Vocabulary cues: ${String(voiceProfile.vocabulary).slice(0, 300)}`);
      if (voiceProfile.avgSentence) voiceLines.push(`- Average sentence length: ${String(voiceProfile.avgSentence).slice(0, 100)}`);
      if (voiceProfile.pov)         voiceLines.push(`- Point of view: ${String(voiceProfile.pov).slice(0, 200)}`);
    }
    const voiceBlock = voiceLines.length > 0
      ? `USER VOICE PROFILE:\n${voiceLines.join("\n")}\n\n`
      : "";

    const samplesArr: string[] = Array.isArray(writingSamples)
      ? writingSamples
          .map((s: any) => (typeof s === "string" ? s : (s?.content || s?.text || "")))
          .filter((s: string) => typeof s === "string" && s.trim().length > 0)
          .slice(0, 3)
          .map((s: string) => s.trim().slice(0, 800))
      : [];
    const samplesBlock = samplesArr.length > 0
      ? `USER WRITING SAMPLES (ground-truth voice):\n${samplesArr.map((s, i) => `Sample ${i + 1}:\n${s}`).join("\n\n")}\n\n`
      : "";

    const systemMsg = `You are Cridl Cortex, an expert LinkedIn ghostwriter and editor. You grade drafts strictly against the rubric. You ALWAYS respond with a single valid JSON object — no prose, no code fences, no markdown. Be honest and specific: do not give credit unless the post earns it. Different posts must get different scores.`;

    const userMsg = `${voiceBlock}${samplesBlock}${POST_QUALITY_SCORE_PROMPT}

POST TO SCORE (verbatim, between <<< >>>):
<<<
${postText.slice(0, 5000)}
>>>

Return ONLY the JSON object specified above. No commentary.`;

    function parseRaw(raw: string): any {
      if (!raw) return null;
      try { return JSON.parse(stripFences(raw)); } catch {}
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) { try { return JSON.parse(match[0]); } catch {} }
      return null;
    }

    async function callModel(model: string) {
      return openRouter.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        temperature: 0.2,
        max_tokens: 700,
        response_format: { type: "json_object" },
      });
    }

    let parsed: any = null;
    let lastErr: any = null;
    for (const model of [PRIMARY_SCORE_MODEL, FALLBACK_SCORE_MODEL]) {
      try {
        const completion = await callModel(model);
        const raw = completion.choices?.[0]?.message?.content || "";
        parsed = parseRaw(raw);
        if (parsed) break;
        console.error(`[api/posts/score] Unparseable output from ${model}:`, raw.slice(0, 300));
      } catch (e: any) {
        lastErr = e;
        console.error(`[api/posts/score] ${model} failed:`, e?.message || e);
      }
    }

    if (!parsed) {
      console.error("[api/posts/score] All models failed", lastErr?.message);
      return NextResponse.json(safeFallback());
    }

    return NextResponse.json(normalize(parsed));
  } catch (err: any) {
    console.error("[api/posts/score]", err?.message || err);
    return NextResponse.json(safeFallback());
  }
}
