import type { ResearchResult } from "./research";
import type { ProfileSegment } from "../db/profiles";
import type { PostMemory } from "../db/memory";
import { openRouter, DEFAULT_MODEL, FALLBACK_MODEL } from "./openrouter";
import { NEEL_SECTIONS } from "./neel-prompt-sections";
import { sanitizePromptInput } from "./sanitize";

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
  memoryContext?: PostMemory[];   // Top-N relevant auto-saved past posts — injected by create page
  writingSamples?: PostMemory[];  // User-uploaded writing samples — style/voice ground truth
  imageStyle?: string;            // Layer 1: art style key (photo|illustration|abstract|3d|lineart|bw_photo)
  sourceContext?: string;         // Extracted text from user-provided URL + image description
  previousPost?: string;          // Current post content when regenerating — Cortex iterates on this, not a blank slate
  isRegeneration?: boolean;       // True when user clicked Regenerate — triggers stronger rewrite directive + higher temperature
  regenerateInstruction?: string; // User's free-form direction for the new version (separate from customInstructions)
  intentType?: "personal" | "professional"; // Detected from topic — controls brand context application
}

// ─── Image style prefix map (Layer 1 — Brand Consistency) ─────────────────────
// Each style prefix is prepended to every AI-generated image prompt.
// This locks the visual language across all posts for a given user/segment.
const IMAGE_STYLE_PREFIXES: Record<string, string> = {
  photo:        "Cinematic editorial photography, ultra-realistic, natural lighting, shallow depth of field —",
  illustration: "Soft editorial illustration, warm linework, hand-crafted texture, muted ink palette —",
  abstract:     "Abstract conceptual art, geometric shapes, emotion-driven composition, premium editorial —",
  "3d":         "Photorealistic 3D render, volumetric lighting, depth, cinematic quality, editorial style —",
  lineart:      "Minimal black ink line art on white, clean strokes, no fill, sketch style —",
  bw_photo:     "Cinematic black and white photography, high contrast, film grain, editorial style, desaturated —",
};

// Maps length label to explicit word-count range and paragraph guidance
const LENGTH_SPEC: Record<string, { words: string; paragraphs: string }> = {
  short:  { words: "exactly 95–105 words (target 100)",  paragraphs: "3–5 short paragraphs" },
  medium: { words: "exactly 190–210 words (target 200)", paragraphs: "6–8 short paragraphs" },
  long:   { words: "exactly 380–420 words (target 400)", paragraphs: "10–14 short paragraphs" },
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

// ─── Writing samples block builder ────────────────────────────────────────────

/**
 * Builds a writing-samples block from user-uploaded posts.
 *
 * These are real posts the author wrote BEFORE using this tool.
 * Cortex treats these as ground truth for voice/style calibration — not as
 * content history. The goal: make Cortex sound indistinguishable from the author.
 *
 * Token budget: hard-capped at ~2500 chars. Style notes are the highest-signal
 * field — always included. Summaries included for angle awareness.
 */
function buildWritingSamplesBlock(samples: PostMemory[]): string {
  if (!samples || samples.length === 0) return "";

  const lines: string[] = [
    "══════════════════════════════════════════",
    "WRITING SAMPLES — VOICE & STYLE GROUND TRUTH",
    "══════════════════════════════════════════",
    `The author uploaded ${samples.length} real LinkedIn post${samples.length > 1 ? "s" : ""} they wrote before using this tool.`,
    "These are YOUR STYLE BIBLE. Study every pattern across all samples:",
    "",
    "• HOW they open posts (stat? story? question? bold statement?)",
    "• Sentence length rhythm (short punchy? long flowing? mixed?)",
    "• Vocabulary register (technical? plain? conversational? formal?)",
    "• How they use white space and paragraph breaks",
    "• How they close (question? call to action? direct statement?)",
    "• Their punctuation habits (em dashes? ellipsis? none?)",
    "",
  ];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    lines.push(`── Sample ${i + 1} of ${samples.length} ──`);
    lines.push(`What it covered: ${s.summary}`);
    if (s.style_notes) lines.push(`Voice pattern: ${s.style_notes}`);
    lines.push(`Key terms: ${s.keywords.join(", ")}`);
    lines.push("");
  }

  lines.push(
    "══ VOICE CALIBRATION MANDATE ══",
    "Your output MUST sound like it came from the SAME PERSON who wrote these samples.",
    "Not similar — the SAME. If the reader compared your post side-by-side with the samples,",
    "they should not be able to tell which one Cortex wrote.",
    "Any deviation from the established voice patterns above is a failure.",
    "══════════════════════════════════════════",
  );

  const block = lines.join("\n");
  return block.length > 2500 ? block.slice(0, 2500) + "\n══════════════════════════════════════════" : block;
}

// ─── Memory block builder ──────────────────────────────────────────────────────

/**
 * Builds a compact memory context block for Cortex's system prompt.
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
 * All prompt content is loaded from NEEL_RUNTIME.md (synced into neel-prompt-sections.ts).
 * Skills applied:
 *   - ECC: content-engine (platform-native LinkedIn format, hooks, one-idea rule)
 *   - marketing-skills-all: social-content (LinkedIn-specific structure, CTA, tone mapping)
 */
export async function generatePost(request: PostRequest): Promise<GenerateResult> {
  const { tone, audience, length, research, segment, topic, model, clientProfile, customInstructions, systemPrompt, memoryContext, writingSamples, imageStyle, sourceContext, previousPost, isRegeneration, regenerateInstruction, intentType } = request;

  const lengthSpec = LENGTH_SPEC[length] || LENGTH_SPEC.medium;
  const isProfessional = (intentType ?? "professional") === "professional";

  // ── Brand context block ────────────────────────────────────────────────────
  // For personal topics: only pass voice/style fields (name, role, personality, word rules).
  // Brand/product fields (niche, ICP, pillars, offering, pains) are stripped so Cortex
  // doesn't inject the user's service into a post about a movie or personal reflection.
  const clientBranding = clientProfile
    ? [
        isProfessional
          ? "BRAND CONTEXT — treat every item below as a non-negotiable constraint:"
          : "VOICE & STYLE REFERENCE — use these to match the author's writing voice and style. Do NOT override the topic's personal nature with brand messaging or product promotion:",
        clientProfile.name           ? `- Author: ${clientProfile.name}` : null,
        clientProfile.roleOrIndustry ? `- Industry / Role: ${clientProfile.roleOrIndustry}` : null,
        isProfessional && clientProfile.companyStage   ? `- Company Stage: ${clientProfile.companyStage}` : null,
        isProfessional && clientProfile.niche          ? `- Niche & Authority angle: ${clientProfile.niche}` : null,
        isProfessional && clientProfile.icp            ? `- Ideal Customer Profile (ICP): ${clientProfile.icp}` : null,
        isProfessional && clientProfile.jtbd           ? `- Jobs-to-be-Done for customer: ${clientProfile.jtbd}` : null,
        isProfessional && clientProfile.pillars        ? `- Content Pillars: ${clientProfile.pillars}` : null,
        clientProfile.personality    ? `- Brand Personality: ${clientProfile.personality}` : null,
        isProfessional && clientProfile.usp            ? `- Unique Selling Point: ${clientProfile.usp}` : null,
        isProfessional && clientProfile.bioOrOffering  ? `- Bio / Offering: ${clientProfile.bioOrOffering}` : null,
        isProfessional && clientProfile.customerPains  ? `- Customer Pains to address: ${clientProfile.customerPains}` : null,
        clientProfile.verbatimLanguage ? `- Native phrases to weave in naturally: ${clientProfile.verbatimLanguage}` : null,
        clientProfile.wordsToAvoid   ? `- Words / phrases to NEVER use: ${clientProfile.wordsToAvoid}` : null,
        !isProfessional
          ? `\n⛔ INTENT OVERRIDE: This topic is a personal story or reflection. Write about the topic directly and authentically. Do NOT inject the author's product, service, or business niche. Do NOT add automation, AI, or industry statistics unless the topic explicitly mentions them. The post should stand alone as a human story — not a promotional piece.`
          : null,
      ].filter(Boolean).join("\n")
    : "No brand profile — write in a clear, credible professional voice.";

  // ── Assemble system prompt from NEEL_RUNTIME.md sections ────────────
  const hookKey = `HOOK_${tone.toUpperCase()}` as const;
  const segmentKey = segment === "individual" ? "SEGMENT_INDIVIDUAL" : "SEGMENT_CORPORATE";

  // For personal topics: inject a hard override at the very top — before any other instruction.
  // This ensures it is the first thing Cortex reads and cannot be overridden by memory or brand context.
  const personalTopOverride = !isProfessional
    ? [
        `══════════════════════════════════════════`,
        `⛔ CRITICAL OVERRIDE — READ THIS FIRST`,
        `══════════════════════════════════════════`,
        `The user's topic is a PERSONAL STORY or REFLECTION (not a product or service post).`,
        ``,
        `ABSOLUTE RULES for this generation:`,
        `1. Write ONLY about the topic the user described. Stay on that topic from hook to CTA.`,
        `2. Do NOT mention, reference, or connect to: the author's product, service, business, automation, AI tools, LinkedIn strategy, content creation, or any industry niche.`,
        `3. Do NOT add statistics about AI, automation, marketing, or technology unless the user's topic explicitly contains them.`,
        `4. Do NOT end with a business CTA. End with a human question or reflection relevant to the story.`,
        `5. The brand profile below provides ONLY writing voice and style — not subject matter.`,
        `6. Ignore past posts in memory as topic inspiration — use them ONLY to match writing style.`,
        ``,
        `Violation of any rule above makes this generation a failure.`,
        `══════════════════════════════════════════`,
        ``,
      ].join("\n")
    : "";

  const systemInstructions = [
    personalTopOverride,
    section("IDENTITY"),
    "",
    section("INTENT_DETECTION"),
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
    writingSamples && writingSamples.length > 0
      ? `\n\n${buildWritingSamplesBlock(writingSamples)}`
      : "",
    memoryContext && memoryContext.length > 0
      ? !isProfessional
        // Personal topics: only pass style_notes from memory — topic/summary stripped to prevent brand contamination
        ? `\n\n══════════════════════════════════════════\nWRITING STYLE REFERENCE (from past posts — use for voice/style ONLY, not topic inspiration)\n══════════════════════════════════════════\n${memoryContext.filter((m: any) => m.style_notes).map((m: any) => `- ${m.style_notes}`).join("\n")}`
        : `\n\n${buildMemoryBlock(memoryContext)}`
      : "",
    customInstructions
      ? [
          "",
          `CUSTOM INSTRUCTIONS — highest priority, overrides everything above`,
          sanitizePromptInput(customInstructions, 500),
        ].join("\n")
      : "",
    isRegeneration && previousPost
      ? [
          "",
          `══════════════════════════════════════════`,
          `REGENERATION MODE — HIGHEST PRIORITY`,
          `══════════════════════════════════════════`,
          `The user already received the post below and asked for a NEW version. Your job is to produce a clearly different post on the same topic.`,
          ``,
          `PREVIOUS VERSION (do NOT repeat its hook, structure, or phrasing):`,
          `"""`,
          sanitizePromptInput(previousPost, 3000),
          `"""`,
          ``,
          regenerateInstruction
            ? `USER'S DIRECTION FOR THE NEW VERSION (apply this exactly — it is the whole reason they regenerated):\n${sanitizePromptInput(regenerateInstruction, 800)}`
            : `USER'S DIRECTION: No specific instruction given — produce a meaningfully different angle, hook, and structure than the previous version.`,
          ``,
          `HARD RULES for this regeneration:`,
          `- The new post MUST open with a different hook than the previous version.`,
          `- The new post MUST differ in wording, sentence structure, and order of ideas.`,
          `- Keep the same topic, audience, tone, and word count.`,
          `- Apply the user's direction above. If it conflicts with brand context, the user's direction wins.`,
          `- Output ONLY the new post text. Do not reference the previous version.`,
        ].join("\n")
      : previousPost
        ? [
            "",
            `CURRENT POST — user is iterating on this. Refine it per the direction above. Do NOT restart from scratch.`,
            sanitizePromptInput(previousPost, 3000),
          ].join("\n")
        : "",
  ].join("\n").trim();

  // ── User prompt ────────────────────────────────────────────────────────────
  // For Contrarian and Storytelling tones: the post is driven by opinion/narrative,
  // not by data. Pass only 1 insight (the most relevant) and instruct Cortex to use it
  // sparingly — not as the structural backbone of the post.
  const isOpinionTone = tone === "contrarian" || tone === "storytelling";
  const insightLines = isOpinionTone
    ? `${research.insights[0]?.title}: ${research.insights[0]?.content}`
    : research.insights.map((ins, i) => `${i + 1}. ${ins.title}: ${ins.content}`).join("\n");
  const insightLabel = isOpinionTone
    ? `One supporting data point (use sparingly — max once in the post, mid-body only. The opinion carries the post, not this stat):`
    : `Key insights to draw from:`;

  const sourceBlock = sourceContext
    ? `\nSource material (URL / image provided by user — use this as the primary factual foundation):\n"""\n${sanitizePromptInput(sourceContext, 2000)}\n"""\n`
    : "";

  const userPrompt = `Generate the LinkedIn post now.

Topic:    ${topic}
Tone:     ${tone}
Audience: ${audience}
Length:   ${lengthSpec.words}
Segment:  ${segment}
${sourceBlock}
Research summary:
${research.summary}

${insightLabel}
${insightLines}

HARD CONSTRAINT — word count: The post MUST be ${lengthSpec.words}. Count your words before finishing. If outside the range, rewrite tighter or expand until you hit the target. This is non-negotiable — the user explicitly selected this length.

Start directly with the hook line. Output nothing else.`;

  // Helper: try primary model, fall back to GPT-4o-mini on 5xx errors
  const chatWithFallback = async (messages: any[], temperature: number) => {
    // Migrate old model IDs saved in user profiles before the -001 fix
    const raw = model || DEFAULT_MODEL;
    const MODEL_ALIASES: Record<string, string> = {
      "google/gemini-2.0-flash": "google/gemini-2.0-flash-001",
      "google/gemini-2.5-flash": "google/gemini-2.5-flash-preview-05-20",
      "anthropic/claude-haiku-4-5": "anthropic/claude-haiku-4-5",
    };
    const primary = MODEL_ALIASES[raw] ?? raw;
    try {
      const res = await openRouter.chat.completions.create({ model: primary, messages, temperature, max_tokens: 1200 });
      return res;
    } catch (err: any) {
      const status = err?.status || err?.code;
      if (status === 500 || status === 502 || status === 503 || status === 429) {
        console.warn(`[Cortex] ${primary} returned ${status} — retrying with ${FALLBACK_MODEL}`);
        return await openRouter.chat.completions.create({ model: FALLBACK_MODEL, messages, temperature, max_tokens: 1200 });
      }
      throw err;
    }
  };

  try {
    // Stage 1: Cortex writes the LinkedIn post
    const completion = await chatWithFallback(
      [
        { role: "system", content: systemInstructions },
        { role: "user",   content: userPrompt },
      ],
      isRegeneration ? 0.95 : 0.72  // bump variance for regenerations to push a meaningfully different output
    );

    const raw = completion.choices[0].message.content || "";
    const post = sanitizePost(raw) || raw.trim();

    // Stage 2: Generate image prompt — always generate so user can switch modes on preview page
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

    const rawImagePrompt = (imagePromptCompletion.choices[0].message.content || "").trim();
    const stylePrefix = imageStyle ? (IMAGE_STYLE_PREFIXES[imageStyle] ?? "") : "";
    const imagePrompt = stylePrefix ? `${stylePrefix} ${rawImagePrompt}` : rawImagePrompt;

    return { post, imagePrompt };
  } catch (error: any) {
    console.error("OpenRouter post generation failed:", error);
    throw new Error(
      `Post generation failed: ${error.message || "Check your OpenRouter API key."}`
    );
  }
}

/**
 * Standalone image prompt regeneration — skips post generation entirely.
 * Used when the user wants a new image prompt without rewriting the post.
 */
export async function generateImagePrompt(topic: string, segment: string, post: string, imageStyle?: string): Promise<string> {
  const imageSystemPrompt = section("IMAGE_PROMPT_SYSTEM");
  const imageUserPrompt = section("IMAGE_PROMPT_USER", {
    TOPIC:   topic,
    SEGMENT: segment,
    POST:    post,
  });

  // Use the centralized OpenRouter client — consistent auth, error handling, and future logging
  const completion = await openRouter.chat.completions.create({
    model: "google/gemini-2.0-flash-001",
    messages: [
      { role: "system", content: imageSystemPrompt },
      { role: "user",   content: imageUserPrompt },
    ],
    temperature: 0.7,
    max_tokens: 200,
  });

  const rawPrompt = (completion.choices[0]?.message?.content || "").trim();
  const stylePrefix = imageStyle ? (IMAGE_STYLE_PREFIXES[imageStyle] ?? "") : "";
  return stylePrefix ? `${stylePrefix} ${rawPrompt}` : rawPrompt;
}

/**
 * Layer 2: Generate a 7-word-max hook/question for image text overlay.
 * On-demand — called when user clicks "Generate Hook" on the preview page.
 */
export async function generateImageHook(post: string, topic: string): Promise<string> {
  // Use the centralized OpenRouter client — consistent auth, error handling, and future logging
  const completion = await openRouter.chat.completions.create({
    model: "google/gemini-2.0-flash-001",
    messages: [
      {
        role: "system",
        content: "You write short, punchy image overlay hooks for LinkedIn posts. Output ONLY the hook text — 7 words maximum, no punctuation at the end, no quotes. Make it a bold question or provocative statement that makes the viewer stop and read the post. Do not explain. Do not use hashtags.",
      },
      {
        role: "user",
        content: `Topic: "${topic}"\n\nPost:\n${post.slice(0, 600)}\n\nWrite a 7-word-max hook for the image overlay.`,
      },
    ],
    temperature: 0.85,
    max_tokens: 30,
  });

  return (completion.choices[0]?.message?.content || "")
    .trim()
    .replace(/\*\*/g, "")        // strip markdown bold
    .replace(/\*/g, "")          // strip markdown italic
    .replace(/^["']|["']$/g, "") // strip surrounding quotes
    .trim();
}
