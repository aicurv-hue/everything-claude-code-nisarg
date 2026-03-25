import type { ResearchResult } from "./research";
import type { ProfileSegment } from "../db/profiles";
import type { PostMemory } from "../db/memory";
import { openRouter, DEFAULT_MODEL, FALLBACK_MODEL } from "./openrouter";
import { NEEL_SECTIONS } from "./neel-prompt-sections";

export interface GenerateResult {
  post: string;
  imagePrompt: string;
}

export interface PostRequest {
  topic: string;
  tone: string;
  audience: string;
  length: string;
  segment: string;
  research: ResearchResult;
  model?: string;
  systemPrompt?: string;
  clientProfile?: ProfileSegment;
  customInstructions?: string;    // Free-form dos/don'ts from the UI prompt panel
  memoryContext?: PostMemory[];   // Top-N relevant past posts — injected by create page
}

// Maps length label to explicit word-count range and paragraph guidance
const LENGTH_SPEC: Record<string, { words: string; paragraphs: string }> = {
  short:  { words: "80–120 words",  paragraphs: "3–4 short paragraphs" },
  medium: { words: "180–250 words", paragraphs: "5–7 short paragraphs" },
  long:   { words: "350–450 words", paragraphs: "8–12 short paragraphs" },
};

// ─── Prompt section accessor ───────────────────────────────────────────────────

/** Returns a section from neel-prompt-sections.ts, with optional placeholder substitution. */
function section(name: string, replacements?: Record<string, string>): string {
  let text = NEEL_SECTIONS[name] ?? `[MISSING SECTION: ${name}]`;
  if (replacements) {
    for (const [key, val] of Object.entries(replacements)) {
      text = text.replaceAll(`{{${key}}}`, val);
    }
  }
  return text;
}

// ─── Memory block builder ──────────────────────────────────────────────────────

/**
 * Builds a compact memory context block for Neel's system prompt.
 *
 * Token budget: hard-capped at ~500 tokens regardless of how many entries.
 * Captures TWO things: what was COVERED (to avoid exact repetition) and
 * HOW the person WRITES (style fingerprint, to maintain consistent voice).
 */
function buildMemoryBlock(memories: PostMemory[]): string {
  if (!memories || memories.length === 0) return "";

  const lines: string[] = [
    "══════════════════════════════════════════",
    "CONTENT HISTORY — READ BEFORE WRITING",
    "══════════════════════════════════════════",
    "Study these past posts to understand the author's voice and what has already been covered:",
    "",
  ];

  for (const m of memories) {
    const ageDays = m.created_at?.seconds
      ? Math.round((Date.now() / 1000 - m.created_at.seconds) / 86400)
      : null;
    const ageLabel = ageDays !== null
      ? ageDays === 0 ? "today" : ageDays === 1 ? "yesterday" : `${ageDays}d ago`
      : "recently";

    lines.push(`[${ageLabel} · ${m.tone} · ${m.audience}]`);
    lines.push(`Topic: ${m.topic}`);
    lines.push(`What was covered: ${m.summary}`);
    if (m.style_notes) lines.push(`Writing style: ${m.style_notes}`);
    lines.push(`Keywords used: ${m.keywords.join(", ")}`);
    lines.push("");
  }

  lines.push(
    "CONTINUITY RULES — READ ALL BEFORE DECIDING:",
    "",
    "VOICE & STYLE (highest priority — always apply):",
    "• Mirror the author's natural writing style captured in 'Writing style' notes above.",
    "• If the author uses short punchy sentences — match that. If conversational — match that.",
    "• The post must sound like it came from the same person who wrote the posts above.",
    "• Do NOT invent a different personality, humor style, or vocabulary.",
    "",
    "TOPIC CONTINUITY (apply based on overlap):",
    "• If this topic is the SAME or closely related to a past post:",
    "  — Ask yourself: should I deepen this thread (give Part 2), or add a new dimension?",
    "  — DO NOT always jump to a completely different angle. Sometimes the next post should",
    "    build directly on the last one — deepening the argument, adding a case study,",
    "    or giving the 'what to do next' after the insight already shared.",
    "  — Avoid restating the EXACT same argument or conclusion with different words.",
    "• If the topic is DIFFERENT from past posts:",
    "  — Write fresh. Reference the author's established positioning if relevant.",
    "",
    "WHAT TO NEVER DO:",
    "• Never invent a story arc, experience, or angle that contradicts the past posts.",
    "• Never pivot so sharply that the post sounds like a different author.",
    "══════════════════════════════════════════",
  );

  const block = lines.join("\n");
  return block.length > 2000 ? block.slice(0, 2000) + "\n══════════════════════════════════════════" : block;
}

// ─── Output sanitiser ──────────────────────────────────────────────────────────

/**
 * Strips any AI preamble or explanation that leaked into the post output.
 * Removes lines like "Here's your post:", "Sure!", "---", markdown headers, etc.
 */
function sanitizePost(raw: string): string {
  const lines = raw.split("\n");
  const preamblePattern =
    /^(here('s| is)|sure[,!]?|of course|below is|i('ve| have) (written|created|drafted)|certainly|linkedin post[:\s]|draft[:\s]|---+|#{1,3}\s)/i;

  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (preamblePattern.test(lines[i].trim())) {
      start = i + 1;
    } else if (lines[i].trim() !== "") {
      break;
    }
  }

  let end = lines.length;
  for (let i = lines.length - 1; i >= start; i--) {
    const t = lines[i].trim();
    if (/^(---+|note:|explanation:|why this|this post uses|i used|the hook|feel free|let me know)/i.test(t)) {
      end = i;
    } else if (t !== "") {
      break;
    }
  }

  return lines.slice(start, end).join("\n").trim();
}

// ─── Main generation function ──────────────────────────────────────────────────

/**
 * Stage 3: Generate a single, publish-ready LinkedIn post.
 *
 * All prompt content is loaded from Master_Neel_Prompt.md.
 * Skills applied:
 *   - ECC: content-engine (platform-native LinkedIn format, hooks, one-idea rule)
 *   - marketing-skills-all: social-content (LinkedIn-specific structure, CTA, tone mapping)
 */
export async function generatePost(request: PostRequest): Promise<GenerateResult> {
  const { tone, audience, length, research, segment, topic, model, clientProfile, customInstructions, systemPrompt, memoryContext } = request;

  const lengthSpec = LENGTH_SPEC[length] || LENGTH_SPEC.medium;

  // ── Brand context block ────────────────────────────────────────────────────
  const clientBranding = clientProfile
    ? [
        "BRAND CONTEXT — treat every item below as a non-negotiable constraint:",
        clientProfile.name           ? `- Author: ${clientProfile.name}` : null,
        clientProfile.roleOrIndustry ? `- Industry / Role: ${clientProfile.roleOrIndustry}` : null,
        clientProfile.companyStage   ? `- Company Stage: ${clientProfile.companyStage}` : null,
        clientProfile.niche          ? `- Niche & Authority angle: ${clientProfile.niche}` : null,
        clientProfile.icp            ? `- Ideal Customer Profile (ICP): ${clientProfile.icp}` : null,
        clientProfile.jtbd           ? `- Jobs-to-be-Done for customer: ${clientProfile.jtbd}` : null,
        clientProfile.pillars        ? `- Content Pillars: ${clientProfile.pillars}` : null,
        clientProfile.personality    ? `- Brand Personality: ${clientProfile.personality}` : null,
        clientProfile.usp            ? `- Unique Selling Point: ${clientProfile.usp}` : null,
        clientProfile.bioOrOffering  ? `- Bio / Offering: ${clientProfile.bioOrOffering}` : null,
        clientProfile.customerPains  ? `- Customer Pains to address: ${clientProfile.customerPains}` : null,
        clientProfile.verbatimLanguage ? `- Native phrases to weave in naturally: ${clientProfile.verbatimLanguage}` : null,
        clientProfile.wordsToAvoid   ? `- Words / phrases to NEVER use: ${clientProfile.wordsToAvoid}` : null,
      ].filter(Boolean).join("\n")
    : "No brand profile — write in a clear, credible professional voice.";

  // ── Assemble system prompt from Master_Neel_Prompt.md sections ────────────
  const hookKey = `HOOK_${tone.toUpperCase()}` as const;
  const segmentKey = segment === "individual" ? "SEGMENT_INDIVIDUAL" : "SEGMENT_CORPORATE";

  const systemInstructions = [
    section("IDENTITY"),
    "",
    section("OUTPUT_RULES"),
    "",
    `══════════════════════════════════════════`,
    `POST PARAMETERS`,
    `══════════════════════════════════════════`,
    `Tone:            ${tone}`,
    `Audience:        ${audience}`,
    `Word count:      ${lengthSpec.words}`,
    `Paragraphs:      ${lengthSpec.paragraphs}`,
    `Hook formula:    ${section(hookKey)}`,
    "",
    section(segmentKey),
    "",
    section("STRUCTURE", { PARAGRAPHS: lengthSpec.paragraphs }),
    "",
    section("COPYWRITING_RULES"),
    "",
    section("FORMATTING"),
    "",
    `══════════════════════════════════════════`,
    `BRAND CONTEXT`,
    `══════════════════════════════════════════`,
    clientBranding,
    systemPrompt
      ? [
          "",
          `══════════════════════════════════════════`,
          `PROFILE SYSTEM PROMPT — additional voice guidance`,
          `══════════════════════════════════════════`,
          systemPrompt,
        ].join("\n")
      : "",
    memoryContext && memoryContext.length > 0
      ? `\n\n${buildMemoryBlock(memoryContext)}`
      : "",
    customInstructions
      ? [
          "",
          `══════════════════════════════════════════`,
          `CUSTOM INSTRUCTIONS — highest priority, overrides everything above`,
          `══════════════════════════════════════════`,
          customInstructions,
        ].join("\n")
      : "",
  ].join("\n").trim();

  // ── User prompt ────────────────────────────────────────────────────────────
  const insightLines = research.insights
    .map((ins, i) => `${i + 1}. ${ins.title}: ${ins.content}`)
    .join("\n");

  const userPrompt = `Generate the LinkedIn post now.

Topic:    ${topic}
Tone:     ${tone}
Audience: ${audience}
Length:   ${lengthSpec.words}
Segment:  ${segment}

Research summary:
${research.summary}

Key insights to draw from:
${insightLines}

Start directly with the hook line. Output nothing else.`;

  // Helper: try primary model, fall back to GPT-4o-mini on 5xx errors
  const chatWithFallback = async (messages: any[], temperature: number) => {
    const primary = model || DEFAULT_MODEL;
    try {
      const res = await openRouter.chat.completions.create({ model: primary, messages, temperature });
      return res;
    } catch (err: any) {
      const status = err?.status || err?.code;
      if (status === 500 || status === 502 || status === 503 || status === 429) {
        console.warn(`[Neel] ${primary} returned ${status} — retrying with ${FALLBACK_MODEL}`);
        return await openRouter.chat.completions.create({ model: FALLBACK_MODEL, messages, temperature });
      }
      throw err;
    }
  };

  try {
    // Stage 1: Neel writes the LinkedIn post
    const completion = await chatWithFallback(
      [
        { role: "system", content: systemInstructions },
        { role: "user",   content: userPrompt },
      ],
      0.72  // slightly higher for more natural, human-sounding prose
    );

    const raw = completion.choices[0].message.content || "";
    const post = sanitizePost(raw) || raw.trim();

    // Stage 2: Neel generates the image prompt for fal.ai
    const imageSystemPrompt = section("IMAGE_PROMPT_SYSTEM");
    const imageUserPrompt = section("IMAGE_PROMPT_USER", {
      TOPIC:   topic,
      SEGMENT: segment,
      POST:    post,
    });

    const imagePromptCompletion = await chatWithFallback(
      [
        { role: "system", content: imageSystemPrompt },
        { role: "user",   content: imageUserPrompt },
      ],
      0.7
    );

    const imagePrompt = (imagePromptCompletion.choices[0].message.content || "").trim();

    return { post, imagePrompt };
  } catch (error: any) {
    console.error("OpenRouter post generation failed:", error);
    throw new Error(
      `Post generation failed: ${error.message || "Check your OpenRouter API key."}`
    );
  }
}
