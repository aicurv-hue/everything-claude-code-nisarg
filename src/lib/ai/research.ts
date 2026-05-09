"use server";

import { db, isMock } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { openRouter, DEFAULT_MODEL } from "./openrouter";
import type { ProfileSegment } from "../db/profiles";
import { detectIntent, type IntentType } from "./intent";
import { withDateContext } from "./currentContext";

export type { IntentType };

export interface ResearchInsight {
  title: string;
  content: string;
  source?: string;
}

export interface ResearchResult {
  topic: string;
  insights: ResearchInsight[];
  summary: string;
  references: string[];
  intentType: IntentType;
  // Angle Engine output — generated after research, feeds generate.ts
  hookCandidates?: string[];    // 3 hook options (stat / story / contrarian)
  recommendedAngle?: string;    // single sharpest thesis for the post
  recommendedHookType?: string; // type label of the winning hook
}

export interface ResearchOptions {
  segment?: string;
  model?: string;
  tone?: string;
  audience?: string;
  length?: string;
  clientProfile?: ProfileSegment;
}

/**
 * Helper: extract JSON from raw AI response text, tolerating markdown fences.
 */
function extractJSON(text: string): any {
  // Strip ```json fences if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = fenced ? fenced[1] : text;
  try {
    return JSON.parse(cleaned.trim());
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
}

/**
 * Stage 1 & 2: Targeted deep research for a LinkedIn post.
 *
 * Skills applied:
 *   - ECC: market-research (structured insights, source attribution, decision-oriented)
 *   - ECC: deep-research (sub-question decomposition, synthesis)
 *
 * All post metadata (tone, audience, length, segment) are passed in so the research
 * produces insights specifically useful for the post being generated — not generic summaries.
 */
export async function performResearch(
  topic: string,
  options: ResearchOptions = {}
): Promise<ResearchResult> {
  const {
    segment = "individual",
    model = DEFAULT_MODEL,
    tone = "professional",
    audience = "general",
    length = "medium",
    clientProfile,
  } = options;

  console.log(`[research] topic="${topic}" segment=${segment} tone=${tone} audience=${audience} length=${length} model=${model}`);

  const intentType = detectIntent(topic);
  console.log(`[research] intentType=${intentType}`);

  // Only include profile fields that are actually filled in — empty fields add noise.
  // For personal topics: strip brand/product fields so research doesn't inject industry content.
  const profileLines = clientProfile ? [
    intentType === "professional" && clientProfile.icp            && `- ICP / Target Audience: ${clientProfile.icp}`,
    intentType === "professional" && (clientProfile.niche || clientProfile.roleOrIndustry) && `- Niche / Industry: ${clientProfile.niche || clientProfile.roleOrIndustry}`,
    intentType === "professional" && clientProfile.bioOrOffering  && `- Offering / Bio: ${clientProfile.bioOrOffering}`,
    intentType === "professional" && clientProfile.jtbd           && `- Jobs-to-be-Done: ${clientProfile.jtbd}`,
    intentType === "professional" && clientProfile.customerPains  && `- Customer Pains: ${clientProfile.customerPains}`,
  ].filter(Boolean) : [];

  const clientContext = profileLines.length > 0
    ? `Client context:\n${profileLines.join("\n")}`
    : "";

  const researchInstruction = intentType === "personal"
    ? `Rules:
- This is a personal story or reflection post. Research the TOPIC ITSELF — factual context, cultural/historical background, relevant human truths, expert perspectives on the subject matter.
- Do NOT inject business metrics, automation statistics, or industry data unless the topic explicitly mentions them.
- Every insight must deepen or contextualize the topic as a human experience.`
    : `Rules:
- Surface specific, data-backed insights (numbers, named companies, named trends) — no generic claims.
- Prefer 2024–2026 data.
- Every insight must be immediately useful for writing a LinkedIn post for ${audience}.`;

  // ── Single combined research call — merges sub-questions + synthesis into 1 ─
  // Two sequential AI calls exceeded Vercel's 60s limit; one call fixes it.
  const researcherRole = intentType === "personal"
    ? `You are a research journalist and cultural analyst.`
    : `You are an expert LinkedIn content researcher and market analyst.`;

  const combinedPrompt = `${researcherRole}

Produce a research report to power a single LinkedIn post with these parameters:
- Topic: "${topic}"
- Tone: ${tone}${intentType === "professional" ? `\n- Target audience: ${audience}` : ""}
- Post length: ${length}
- Segment: ${segment === "individual" ? "personal brand, first-person" : "corporate brand, company voice"}
${clientContext}

${researchInstruction}

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "summary": "2–3 sentence executive summary of the single strongest finding and its implication for ${audience}",
  "insights": [
    { "title": "Short insight title", "content": "1–2 sentence specific finding with stat or example", "source": "Publication or year" },
    { "title": "...", "content": "...", "source": "..." },
    { "title": "...", "content": "...", "source": "..." }
  ],
  "references": ["source1", "source2"]
}`;

  let synthesis: any;
  try {
    let text = "";
    let lastErr: any = null;
    for (const model of ["google/gemini-2.5-flash", "google/gemini-2.5-flash"]) {
      try {
        const res = await openRouter.chat.completions.create({
          model,
          messages: withDateContext([{ role: "user", content: combinedPrompt }]),
          temperature: 0.3,
          max_tokens: 1500,
        });
        text = res.choices[0].message.content || "";
        const candidate = extractJSON(text);
        if (candidate?.summary) { synthesis = candidate; break; }
        console.warn(`[research] ${model} returned malformed JSON — trying next`);
      } catch (e) {
        lastErr = e;
        console.warn(`[research] ${model} threw:`, (e as any)?.message || e);
      }
    }
    if (!synthesis?.summary) throw new Error(lastErr?.message || "Malformed research JSON from all models");
  } catch (e) {
    console.error("[research] Research call failed:", e);
    synthesis = {
      summary: `Research on "${topic}" could not be completed. The post will be generated from the topic alone.`,
      insights: [
        { title: "Topic Overview", content: `Key aspects of ${topic} relevant to ${audience}.`, source: "Generated" },
      ],
      references: [],
    };
  }

  // ── Angle Engine — generate hook candidates + recommended angle ─────────────
  // Runs after research; separate call so a failure here never blocks research.
  // Gives generate.ts a "thinking-first" foundation instead of blank-slate writing.
  let hookCandidates: string[] = [];
  let recommendedAngle = "";
  let recommendedHookType = "observation";
  try {
    const insightLine = synthesis.insights?.[0]
      ? `${synthesis.insights[0].title}: ${synthesis.insights[0].content}`
      : synthesis.summary;
    const anglePrompt = `You are a LinkedIn post strategist. Given research, generate 3 distinct hook options and identify the sharpest angle.

Topic: "${topic}"
Audience: ${options.audience || "general"}
Tone: ${options.tone || "professional"}
Research summary: ${synthesis.summary}
Top insight: ${insightLine}

Return ONLY JSON, no preamble:
{
  "hookCandidates": [
    "STAT hook: [open with the sharpest number/fact, max 2 lines]",
    "STORY hook: [open with a vivid scene or first-person moment, max 2 lines]",
    "CONTRARIAN hook: [challenge a common belief about this topic, max 2 lines]"
  ],
  "recommendedAngle": "[1-2 sentences: the single sharpest thesis this post should argue]",
  "recommendedHookType": "stat"
}
Replace the final recommendedHookType value with whichever of stat|story|contrarian|question|observation best fits the recommended hook.`;
    const angleRes = await Promise.race([
      openRouter.chat.completions.create({
        model,
        messages: withDateContext([{ role: "user", content: anglePrompt }]),
        temperature: 0.65,
        max_tokens: 350,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("angle timeout")), 5000)),
    ]);
    const angleRaw = (angleRes.choices[0]?.message?.content || "").trim();
    const angleData = extractJSON(angleRaw);
    if (Array.isArray(angleData?.hookCandidates) && angleData.hookCandidates.length >= 1) {
      hookCandidates = angleData.hookCandidates.slice(0, 3);
      recommendedAngle = typeof angleData.recommendedAngle === "string" ? angleData.recommendedAngle.trim() : "";
      recommendedHookType = typeof angleData.recommendedHookType === "string" ? angleData.recommendedHookType : "observation";
    }
  } catch (angleErr) {
    console.warn("[research] angle engine failed (non-fatal):", (angleErr as any)?.message || angleErr);
  }

  const result: ResearchResult = {
    topic,
    summary: synthesis.summary,
    insights: synthesis.insights,
    references: synthesis.references ?? [],
    intentType,
    hookCandidates,
    recommendedAngle,
    recommendedHookType,
  };

  // Persist research to Firestore (skip in mock mode)
  if (!isMock && db) {
    try {
      await addDoc(collection(db, "research_history"), {
        topic, segment, tone, audience, length, result,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn("[research] Firestore persist failed:", e);
    }
  }

  return result;
}
