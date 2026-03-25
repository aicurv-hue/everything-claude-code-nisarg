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

  // ── Single combined research call — merges sub-questions + synthesis into 1 ─
  // Two sequential AI calls exceeded Vercel's 60s limit; one call fixes it.
  const combinedPrompt = `You are an expert LinkedIn content researcher and market analyst.

Produce a research report to power a single LinkedIn post with these parameters:
- Topic: "${topic}"
- Tone: ${tone}
- Target audience: ${audience}
- Post length: ${length}
- Segment: ${segment === "individual" ? "personal brand, first-person" : "corporate brand, company voice"}
${clientContext}

Rules:
- Surface specific, data-backed insights (numbers, named companies, named trends) — no generic claims.
- Prefer 2024–2026 data.
- Every insight must be immediately useful for writing a LinkedIn post for ${audience}.

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
    const res = await openRouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: combinedPrompt }],
      temperature: 0.3,
      max_tokens: 1200,
    });
    const text = res.choices[0].message.content || "";
    synthesis = extractJSON(text);
    if (!synthesis?.summary) throw new Error("Malformed research JSON");
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
