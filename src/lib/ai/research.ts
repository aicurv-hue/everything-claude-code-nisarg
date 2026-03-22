"use server";

import { db, isMock } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { openRouter, DEFAULT_MODEL } from "./openrouter";
import type { ProfileSegment } from "../db/profiles";

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

  // Only include profile fields that are actually filled in — empty fields add noise
  const profileLines = clientProfile ? [
    clientProfile.icp            && `- ICP / Target Audience: ${clientProfile.icp}`,
    (clientProfile.niche || clientProfile.roleOrIndustry) && `- Niche / Industry: ${clientProfile.niche || clientProfile.roleOrIndustry}`,
    clientProfile.bioOrOffering  && `- Offering / Bio: ${clientProfile.bioOrOffering}`,
    clientProfile.jtbd           && `- Jobs-to-be-Done: ${clientProfile.jtbd}`,
    clientProfile.customerPains  && `- Customer Pains: ${clientProfile.customerPains}`,
  ].filter(Boolean) : [];

  const clientContext = profileLines.length > 0
    ? `Client context:\n${profileLines.join("\n")}`
    : "";

  // ── Stage 1: Generate targeted sub-questions ──────────────────────────────
  const subQuestionsPrompt = `You are a LinkedIn content researcher.

The goal is to gather research that will be turned into a single LinkedIn post with:
- Tone: ${tone}
- Target audience: ${audience}
- Post length: ${length}
- Segment: ${segment} (${segment === "individual" ? "personal brand, first-person" : "corporate brand, company voice"})
${clientContext}

Topic: "${topic}"

Generate 4–5 tight, researchable sub-questions that will surface the most compelling, specific, data-backed points for this exact audience and tone.
Focus on: statistics, trends, surprising insights, pain points, and outcomes that a ${audience} audience on LinkedIn would find valuable.

Return ONLY a JSON array of strings. Example: ["question 1", "question 2"]`;

  let subQuestions = [
    `What are the latest trends in ${topic}?`,
    `What pain points does ${topic} solve for ${audience}?`,
    `What data or statistics support the importance of ${topic}?`,
  ];

  try {
    const res = await openRouter.chat.completions.create({
      model,
      messages: [{ role: "user", content: subQuestionsPrompt }],
      temperature: 0.4,
    });
    const text = res.choices[0].message.content || "";
    const parsed = extractJSON(text);
    if (Array.isArray(parsed) && parsed.length > 0) subQuestions = parsed;
  } catch (e) {
    console.warn("[research] Sub-question generation failed, using defaults.", e);
  }

  // ── Stage 2: Synthesise research into structured insights ─────────────────
  const synthesisPrompt = `You are an expert market researcher using the ECC market-research skill.

Topic: "${topic}"
Post tone: ${tone}
Post audience: ${audience}
Post length target: ${length}
Sub-questions investigated:
${subQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
${clientContext}

Produce a research report that will power a LinkedIn post for the above audience and tone.

Rules (market-research skill standards):
- Every claim must include a source or be flagged as an estimate.
- Prefer 2024–2026 data. Flag older data.
- Translate findings into value a ${audience} audience will care about.
- Insights must be specific (numbers, named companies, named trends) — not generic.
- Summary must be written so the content writer can extract a single strong idea from it.

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "summary": "2–3 sentence executive summary of the key finding and its implication for ${audience}",
  "insights": [
    { "title": "Short insight title", "content": "1–2 sentence specific finding with stat or example", "source": "Publication / URL" },
    { "title": "...", "content": "...", "source": "..." },
    { "title": "...", "content": "...", "source": "..." }
  ],
  "references": ["url1", "url2"]
}`;

  let synthesis: any;
  try {
    const res = await openRouter.chat.completions.create({
      model,
      messages: [{ role: "user", content: synthesisPrompt }],
      temperature: 0.3,
    });
    const text = res.choices[0].message.content || "";
    synthesis = extractJSON(text);
    if (!synthesis?.summary) throw new Error("Malformed synthesis JSON");
  } catch (e) {
    console.error("[research] Synthesis failed:", e);
    synthesis = {
      summary: `Research on "${topic}" could not be completed. The post will be generated from the topic alone.`,
      insights: [
        { title: "Topic Overview", content: `Key aspects of ${topic} relevant to ${audience}.`, source: "Generated" },
      ],
      references: [],
    };
  }

  const result: ResearchResult = {
    topic,
    summary: synthesis.summary,
    insights: synthesis.insights,
    references: synthesis.references ?? [],
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
