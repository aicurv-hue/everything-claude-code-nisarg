import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";
import { openRouter, DEFAULT_MODEL } from "@/lib/ai/openrouter";
import { REWRITE_IN_VOICE_PROMPT } from "@/lib/ai/neel-prompt-sections";

// Edge runtime — uses OpenRouter; mirrors /api/posts/score and /api/ai/generate.
export const runtime = "edge";

type RewriteResult = {
  rewrittenPost: string;
  score: number;
  changes: string[];
};

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const uid = await verifyTokenEdge(authHeader);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pre-flight usage gate (rewrite counts as 1 post usage, like generate/regenerate)
  const checkRes = await fetch(new URL("/api/usage/check", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader || "",
    },
    body: JSON.stringify({ action: "post" }),
  });
  if (!checkRes.ok) return checkRes;

  try {
    const { rawText, voiceProfile, writingSamples } = await req.json();
    if (!rawText || typeof rawText !== "string" || rawText.trim().length < 5) {
      return NextResponse.json({ error: "rawText required" }, { status: 400 });
    }

    // Build voice context block (caller passes — no Firestore reads in edge).
    const voiceLines: string[] = [];
    if (voiceProfile && typeof voiceProfile === "object") {
      if (voiceProfile.tone)        voiceLines.push(`- Typical tone: ${String(voiceProfile.tone).slice(0, 200)}`);
      if (voiceProfile.vocabulary)  voiceLines.push(`- Vocabulary cues: ${String(voiceProfile.vocabulary).slice(0, 300)}`);
      if (voiceProfile.avgSentence) voiceLines.push(`- Average sentence length: ${String(voiceProfile.avgSentence).slice(0, 100)}`);
      if (voiceProfile.pov)         voiceLines.push(`- Point of view: ${String(voiceProfile.pov).slice(0, 200)}`);
    }
    const voiceBlock = voiceLines.length > 0
      ? `USER VOICE PROFILE:\n${voiceLines.join("\n")}`
      : "(no explicit voice profile provided — infer from samples if any, otherwise write in a sharp, plain-spoken first-person voice)";

    const samplesArr: string[] = Array.isArray(writingSamples)
      ? writingSamples
          .map((s: any) => (typeof s === "string" ? s : (s?.content || s?.text || "")))
          .filter((s: string) => typeof s === "string" && s.trim().length > 0)
          .slice(0, 3)
          .map((s: string) => s.trim().slice(0, 800))
      : [];
    const samplesBlock = samplesArr.length > 0
      ? `\n\nUSER WRITING SAMPLES (ground-truth voice):\n${samplesArr.map((s, i) => `Sample ${i + 1}:\n${s}`).join("\n\n")}`
      : "";

    const filledVoice = `${voiceBlock}${samplesBlock}`;
    const prompt = REWRITE_IN_VOICE_PROMPT
      .replace("{voiceProfile}", filledVoice)
      .replace("{rawText}", rawText.slice(0, 6000));

    let parsed: any = null;
    try {
      const completion = await openRouter.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.6,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      });
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
      console.error("[api/posts/rewrite] OpenRouter error:", err?.message || err);
      parsed = null;
    }

    const rewrittenPost: string = (parsed && typeof parsed.rewrittenPost === "string" && parsed.rewrittenPost.trim().length > 0)
      ? parsed.rewrittenPost.replace(/\*+/g, "").trim()
      : rawText;

    const changesRaw: any[] = Array.isArray(parsed?.changes) ? parsed.changes : [];
    const changes: string[] = changesRaw
      .filter((c) => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim())
      .slice(0, 6);

    // Internal score call — propagate Authorization
    let score = 0;
    try {
      const scoreRes = await fetch(new URL("/api/posts/score", req.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || "",
        },
        body: JSON.stringify({ postText: rewrittenPost, voiceProfile, writingSamples }),
      });
      if (scoreRes.ok) {
        const scoreData = await scoreRes.json();
        if (typeof scoreData?.score === "number") score = scoreData.score;
      }
    } catch (err: any) {
      console.error("[api/posts/rewrite] Score call failed:", err?.message || err);
    }

    const result: RewriteResult = { rewrittenPost, score, changes };
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/posts/rewrite]", err?.message || err);
    // Safe fallback — do not 500
    const body = await req.clone().json().catch(() => ({}));
    return NextResponse.json({ rewrittenPost: body?.rawText || "", score: 0, changes: [] });
  }
}
