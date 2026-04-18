/**
 * POST /api/ai/profile-enhance
 *
 * Enhances a single settings profile field using Gemini Flash.
 * Takes the field name, current value, and other filled profile fields as context.
 * Returns an improved version optimised for Cortex's AI pipeline.
 *
 * Edge Runtime — no timeout limit.
 */
export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";

// Per-field enhancement instructions — each one tells the AI exactly what to produce
const FIELD_PROMPTS: Record<string, string> = {
  icp: `Rewrite this Ideal Customer Profile (ICP) to be hyper-specific and actionable for LinkedIn content targeting.
Include: exact industry, company size range, job title/role, their #1 specific pain point, and the outcome they want.
Format: 2-3 concise sentences. Use numbers/specifics wherever possible.
Return ONLY the rewritten ICP text. No intro, no labels, no quotes around the output.`,

  companyStage: `Rewrite this audience/company stage description to be specific and useful for content targeting.
Include growth stage, approximate team size or revenue range, and 1-2 defining characteristics.
Keep it under 15 words.
Return ONLY the rewritten stage. No intro, no punctuation at end.`,

  jtbd: `Rewrite this Jobs-to-be-Done statement using this exact formula:
"[Customer type] want to [specific measurable action] so they can [specific outcome — include a number or metric if possible]."
Make it concrete. Avoid vague words like "improve" or "optimize".
Return ONLY the single rewritten JTBD sentence. No intro, no quotes.`,

  pillars: `Rewrite these content pillars as 3-5 specific, distinct topic clusters that build topical LinkedIn authority.
Each pillar should be 2-4 words and specific to the user's niche — not generic marketing buzzwords.
Separate with commas. No numbering.
Return ONLY the comma-separated pillar list. No intro, no explanation.`,

  personality: `Rewrite this brand personality/tone as a vivid, specific descriptor a copywriter can follow.
Use this format: "[Primary quality] + [secondary quality] — never [what to avoid]"
Example: "Direct and data-led with dry wit — never corporate-speak or motivational poster clichés"
Return ONLY the rewritten personality descriptor. No intro.`,

  usp: `Rewrite this Unique Selling Proposition as a bold, falsifiable differentiator.
Use this format: "The only [specific category] that [concrete differentiator with proof] — [guarantee or evidence]."
Avoid vague words like "best", "leading", "trusted". Make the differentiator something a competitor could not honestly copy.
Return ONLY the rewritten USP. No intro, no bullet points.`,

  customerPains: `Rewrite these customer pains to be emotionally specific and visceral — not just practical problems.
Include BOTH the surface-level frustration AND the deeper emotional tension behind it.
Use second or third person: "They worry that...", "They feel stuck when...", "They're scared..."
2-3 sentences max. Be specific — use numbers, real scenarios, real language.
Return ONLY the rewritten pains. No intro.`,

  verbatimLanguage: `Expand these customer phrases into a richer list of 6-8 verbatim expressions.
These MUST sound exactly like how a real customer says it on a sales call or in a message — raw, unpolished, real.
NOT polished marketing language. Think: "our bills are out of control", "nobody told us this was even possible", "I just guessed"
Format: comma-separated phrases, each in double quotes.
Return ONLY the comma-separated quoted phrases. No intro, no explanation.`,
};

export async function POST(req: NextRequest) {
  try {
    const { field, value, context, profileType } = await req.json();

    if (!field || !value?.trim()) {
      return NextResponse.json({ error: "field and value required" }, { status: 400 });
    }

    const fieldPrompt = FIELD_PROMPTS[field];
    if (!fieldPrompt) {
      return NextResponse.json({ error: "Unknown field" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI not configured" }, { status: 503 });
    }

    // Build context block from other filled profile fields
    const ctx: Record<string, string> = context || {};
    const contextLines: string[] = [];
    if (ctx.name)             contextLines.push(`Name / Company: ${ctx.name}`);
    if (ctx.roleOrIndustry)   contextLines.push(`Role / Industry: ${ctx.roleOrIndustry}`);
    if (ctx.niche)            contextLines.push(`Niche / Offering: ${ctx.niche}`);
    if (ctx.bioOrOffering)    contextLines.push(`Bio / Overview: ${ctx.bioOrOffering.slice(0, 300)}`);
    if (ctx.icp      && field !== "icp")      contextLines.push(`ICP: ${ctx.icp}`);
    if (ctx.jtbd     && field !== "jtbd")     contextLines.push(`JTBD: ${ctx.jtbd}`);
    if (ctx.pillars  && field !== "pillars")  contextLines.push(`Content Pillars: ${ctx.pillars}`);
    if (ctx.usp      && field !== "usp")      contextLines.push(`USP: ${ctx.usp}`);

    const contextBlock = contextLines.length > 0
      ? `\n\nPROFILE CONTEXT — use this to make the output specific and relevant to this person:\n${contextLines.join("\n")}`
      : "";

    const systemPrompt = `You are an expert LinkedIn content strategist helping a ${profileType === "corporate" ? "company" : "professional"} set up their AI writing profile. Your job is to take rough, vague profile inputs and transform them into sharp, specific descriptions that will make an AI content generator (called Cortex) produce far better LinkedIn posts.

Every output must be concrete, specific, and immediately useful. No fluff. No marketing clichés. No generic advice.${contextBlock}`;

    const userPrompt = `Enhance this profile field.

Field: ${field}
Current input: "${value}"

Enhancement instructions:
${fieldPrompt}`;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://linkedin-automation-chi.vercel.app",
        "X-Title": "Cridl Profile Enhancer",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
        max_tokens: 350,
        temperature: 0.72,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[profile-enhance] OpenRouter error:", err);
      return NextResponse.json({ error: "AI call failed" }, { status: 500 });
    }

    const data = await res.json();
    const enhanced = data.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ enhanced });
  } catch (err: any) {
    console.error("[profile-enhance] Error:", err);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
