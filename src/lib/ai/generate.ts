import type { ResearchResult } from "./research";
import type { ProfileSegment } from "../db/profiles";
import type { PostMemory } from "../db/memory";
import { openRouter, GENERATION_MODEL, DEFAULT_MODEL, FALLBACK_MODEL } from "./openrouter";
import { NEEL_SECTIONS } from "./neel-prompt-sections";
import { sanitizePromptInput } from "./sanitize";
import { withDateContext } from "./currentContext";

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
  sourceContext?: string;         // Extracted text from user-provided URL + image description
  previousPost?: string;          // Current post content when regenerating — Cortex iterates on this, not a blank slate
  isRegeneration?: boolean;       // True when user clicked Regenerate — triggers stronger rewrite directive + higher temperature
  regenerateInstruction?: string; // User's free-form direction for the new version (separate from customInstructions)
  intentType?: "personal" | "professional"; // Detected from topic — controls brand context application
  // ── Regeneration session memory (temporary, deleted on finalize) ──────────
  initialPost?: string;           // Anchor — the very first AI-generated post in the session
  regenerationTrail?: Array<{     // Append-only log of prior regen turns (turn 0 = anchor)
    turn_index: number;
    post_text: string;
    user_comment: string | null;
  }>;
}

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

// ─── Style DNA block builder ───────────────────────────────────────────────────

/**
 * Builds a compact style fingerprint block from the AI-extracted StyleDNA.
 * ~250 chars vs ~2500 chars for raw samples — 10x token reduction while
 * preserving all the actionable style signals Cortex needs.
 */
function buildStyleDnaBlock(dna: any): string {
  if (!dna?.hookStyle || !dna?.sentenceRhythm) return "";
  const patterns = Array.isArray(dna.signaturePatterns) && dna.signaturePatterns.length > 0
    ? dna.signaturePatterns.map((p: string) => `  - ${p}`).join("\n")
    : "";
  return [
    `══════════════════════════════════════════`,
    `VOICE DNA — EXTRACTED STYLE FINGERPRINT`,
    `══════════════════════════════════════════`,
    `Hook style:           ${dna.hookStyle}`,
    `Sentence rhythm:      ${dna.sentenceRhythm}${dna.avgSentenceWords ? ` (avg ~${dna.avgSentenceWords} words/sentence)` : ""}`,
    `Humor:                ${dna.humorPresence || "none"}`,
    `Emotional intensity:  ${dna.emotionalIntensity || "controlled"}`,
    `CTA style:            ${dna.ctaStyle || "reflective_question"}`,
    patterns ? `Signature patterns:\n${patterns}` : "",
    ``,
    `MANDATE: Every sentence you write must embody the patterns above.`,
    `The reader should not be able to distinguish your output from the author's own writing.`,
    `══════════════════════════════════════════`,
  ].filter(Boolean).join("\n");
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

  // Hook type diversity hint — tracks which hook types have been used recently
  // so Cortex can suggest variety rather than repeating the same opener style.
  const hookTypes = memories
    .filter((m: any) => typeof m.hook_type === "string" && m.hook_type)
    .slice(0, 5)
    .map((m: any) => m.hook_type as string);

  const hookDiversityHint = (() => {
    if (hookTypes.length < 3) return "";
    const allTypes = ["stat", "story", "contrarian", "question", "observation"];
    const typeCount: Record<string, number> = {};
    for (const t of hookTypes) typeCount[t] = (typeCount[t] || 0) + 1;
    const underused = allTypes.filter((t) => !typeCount[t]);
    if (underused.length > 0) {
      return `HOOK VARIETY: Last ${hookTypes.length} posts used [${hookTypes.join(", ")}] hooks. Consider a ${underused[0]} hook this time for variety and reach.`;
    }
    return `HOOK VARIETY: Good hook diversity in recent posts [${hookTypes.join(", ")}] — maintain the mix.`;
  })();

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
    hookDiversityHint ? `\n${hookDiversityHint}` : "",
    "══════════════════════════════════════════",
  );

  const block = lines.join("\n");
  return block.length > 2000 ? block.slice(0, 2000) + "\n══════════════════════════════════════════" : block;
}

// ─── Regeneration prompt block ────────────────────────────────────────────────

/**
 * Builds the REGENERATION MODE section of the system prompt.
 *
 * When a regeneration trail is available, includes:
 *   - the ANCHOR (initial post — keeps the session from drifting)
 *   - the last 2 prior turns with the user comment that produced each
 *   - a count of any earlier turns elided for prompt-size sanity
 *
 * Falls back to the single-previous-post format when no trail is present
 * (old drafts, first regen before session is created).
 */
function buildRegenerationBlock(args: {
  previousPost: string;
  regenerateInstruction?: string;
  initialPost?: string;
  regenerationTrail?: Array<{ turn_index: number; post_text: string; user_comment: string | null }>;
}): string {
  const { previousPost, regenerateInstruction, initialPost, regenerationTrail } = args;
  const directive = regenerateInstruction
    ? `USER'S DIRECTION FOR THE NEW VERSION (apply this exactly — it is the whole reason they regenerated):\n${sanitizePromptInput(regenerateInstruction, 800)}`
    : `USER'S DIRECTION: No specific instruction given — produce a meaningfully different angle, hook, and structure than the previous version.`;

  const trail = (regenerationTrail || []).filter((t) => t && typeof t.post_text === "string");
  const hasTrail = trail.length >= 1 && !!initialPost;

  if (!hasTrail) {
    return [
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
      directive,
      ``,
      `HARD RULES for this regeneration:`,
      `- The new post MUST open with a different hook than the previous version.`,
      `- The new post MUST differ in wording, sentence structure, and order of ideas.`,
      `- Keep the same topic, audience, tone, and word count.`,
      `- Apply the user's direction above. If it conflicts with brand context, the user's direction wins.`,
      `- Output ONLY the new post text. Do not reference the previous version.`,
    ].join("\n");
  }

  // Trail-aware block: anchor + last 2 turns (excluding turn 0 which is the anchor)
  const nonAnchorTurns = trail.filter((t) => t.turn_index > 0);
  const tail = nonAnchorTurns.slice(-2);
  const elided = Math.max(0, nonAnchorTurns.length - tail.length);

  const lines: string[] = [
    "",
    `══════════════════════════════════════════`,
    `REGENERATION MODE — HIGHEST PRIORITY`,
    `══════════════════════════════════════════`,
    `This is an iterative session. The user has already given you feedback on prior versions and is asking for another revision.`,
    ``,
    `ANCHOR — the initial post in this session. Preserve its core message, topic, stance, and persona voice. Do NOT drift away from it across revisions:`,
    `"""`,
    sanitizePromptInput(initialPost!, 2500),
    `"""`,
    ``,
  ];

  if (elided > 0) {
    lines.push(`[${elided} earlier revision${elided === 1 ? "" : "s"} elided for brevity — the patterns the user rejected are reflected in the more recent revisions below]`, ``);
  }

  for (const t of tail) {
    lines.push(
      `── PRIOR REVISION (turn ${t.turn_index}) ──`,
      `User asked: ${t.user_comment ? `"${sanitizePromptInput(t.user_comment, 500)}"` : "(no specific direction)"}`,
      `You produced:`,
      `"""`,
      sanitizePromptInput(t.post_text, 2000),
      `"""`,
      ``,
    );
  }

  lines.push(
    `── CURRENT REVISION TARGET ──`,
    directive,
    ``,
    `HARD RULES for this regeneration:`,
    `- Treat the ANCHOR as the source of truth for topic, stance, and persona voice. Do NOT drift.`,
    `- Apply each user direction cumulatively — earlier comments still hold unless the latest one contradicts them.`,
    `- Do NOT reuse hooks, openings, or phrasings already produced in prior revisions above.`,
    `- Keep the same topic, audience, tone, and word count.`,
    `- If the user's latest direction conflicts with brand context, the user's direction wins.`,
    `- Output ONLY the new post text. Do not reference prior revisions or this trail.`,
  );

  return lines.join("\n");
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
  const { tone, audience, length, research, segment, topic, clientProfile, customInstructions, memoryContext, writingSamples, sourceContext, previousPost, isRegeneration, regenerateInstruction, intentType, initialPost, regenerationTrail } = request;

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
        // personality + verbatimLanguage are stripped on personal intent — these
        // fields routinely contain product-flavored phrasing (e.g. a LinkedIn
        // automation founder's verbatimLanguage often includes "I never get
        // time to post", which Cortex will then weave into a personal Citadel
        // post, ruining it). On personal intent the only voice signal that
        // survives is wordsToAvoid (negative-only constraint, can't bleed in
        // as content) plus the writing samples' style_notes.
        isProfessional && clientProfile.personality    ? `- Brand Personality: ${clientProfile.personality}` : null,
        isProfessional && clientProfile.usp            ? `- Unique Selling Point: ${clientProfile.usp}` : null,
        isProfessional && clientProfile.bioOrOffering  ? `- Bio / Offering: ${clientProfile.bioOrOffering}` : null,
        isProfessional && clientProfile.customerPains  ? `- Customer Pains to address: ${clientProfile.customerPains}` : null,
        isProfessional && clientProfile.verbatimLanguage ? `- Native phrases to weave in naturally: ${clientProfile.verbatimLanguage}` : null,
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
        `2. Do NOT mention, reference, or connect to: the author's product, service, business, automation, AI tools, LinkedIn strategy, content creation, posting habits, or any industry niche. The HOOK must be about the topic — never about the author's frustration with posting, building a personal brand, or finding time to write.`,
        `3. Do NOT add statistics about AI, automation, marketing, or technology unless the user's topic explicitly contains them.`,
        `4. Do NOT end with a business CTA. End with a human question or reflection relevant to the story.`,
        `5. The brand profile below provides ONLY writing voice and style — not subject matter.`,
        `6. Ignore past posts in memory as topic inspiration — use them ONLY to match writing style.`,
        `7. If any phrase in the brand profile or writing samples references LinkedIn, posting, content creation, automation, or the author's product/offering, IGNORE that phrase for this post — even if the profile labels it a "native phrase to weave in". For personal topics those phrases are off-limits.`,
        ``,
        `Violation of any rule above makes this generation a failure.`,
        `══════════════════════════════════════════`,
        ``,
      ].join("\n")
    : "";

  // ── Angle Engine block ────────────────────────────────────────────────────
  // Injected between structure rules and brand context so Cortex has a
  // "thinking-first" foundation — a pre-selected angle + 3 hook options —
  // before it writes. Skipped gracefully if research didn't produce them.
  const hasAngle = (research.recommendedAngle && research.recommendedAngle.length > 10) ||
    (Array.isArray(research.hookCandidates) && research.hookCandidates.length > 0);
  const angleBlock = hasAngle
    ? [
        `══════════════════════════════════════════`,
        `ANGLE ENGINE — THINK BEFORE YOU WRITE`,
        `══════════════════════════════════════════`,
        research.recommendedAngle
          ? `Sharpest angle for this post (build your argument around this):\n"${research.recommendedAngle}"`
          : "",
        Array.isArray(research.hookCandidates) && research.hookCandidates.length > 0
          ? `\n3 hook candidates — pick the strongest or write a superior one in the same vein:\n${research.hookCandidates.map((h, i) => `${i + 1}. ${h}`).join("\n")}`
          : "",
        ``,
        `Do not copy a hook verbatim — use these as the strategic foundation, then sharpen.`,
        `══════════════════════════════════════════`,
      ].filter(Boolean).join("\n")
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
    angleBlock,
    "",
    `══════════════════════════════════════════`,
    `BRAND CONTEXT`,
    `══════════════════════════════════════════`,
    clientBranding,
    // Voice/style signal: prefer compact Style DNA fingerprint when available,
    // fall back to raw writing-samples block for users who haven't extracted it yet.
    // On personal intent: strip all topic/summary fields — voice signals only.
    (() => {
      const dna = clientProfile?.style_dna;
      if (dna?.hookStyle) {
        // Style DNA available — inject compact fingerprint (~250 chars)
        return `\n\n${buildStyleDnaBlock(dna)}`;
      }
      // Fall back to raw samples
      if (!writingSamples || writingSamples.length === 0) return "";
      if (isProfessional) return `\n\n${buildWritingSamplesBlock(writingSamples)}`;
      // Personal intent: style_notes only
      const styleLines = writingSamples
        .filter((s: any) => s?.style_notes)
        .map((s: any) => `- ${s.style_notes}`);
      return styleLines.length === 0
        ? ""
        : `\n\n══════════════════════════════════════════\nVOICE PATTERNS (style only — do NOT use as topic inspiration)\n══════════════════════════════════════════\n${styleLines.join("\n")}`;
    })(),
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
      ? buildRegenerationBlock({
          previousPost,
          regenerateInstruction,
          initialPost,
          regenerationTrail,
        })
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
    : `Research context (weave into the argument naturally — do NOT walk through these linearly or structure the body around them. Drop any that don't serve the post):`;

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

  // max_tokens scales with post length — long posts need more headroom to avoid
  // mid-generation truncation (380–420 words ≈ 560–620 tokens + system prompt overhead).
  const postMaxTokens = length === "long" ? 1600 : length === "short" ? 800 : 1200;

  const callWithTimeout = async (model: string, messages: any[], temperature: number, max_tokens: number, timeoutMs: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await openRouter.chat.completions.create(
        { model, messages: withDateContext(messages), temperature, max_tokens },
        { signal: controller.signal as any }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const isUsableCompletion = (c: any, minChars: number) => {
    const txt = (c?.choices?.[0]?.message?.content || "").trim();
    const finish = c?.choices?.[0]?.finish_reason;
    return finish === "stop" && txt.length >= minChars;
  };

  // Errors that should NOT trigger a retry — the same model will refuse again.
  const isRetryable = (err: any): boolean => {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("content_filter") || msg.includes("safety") || msg.includes("policy")) return false;
    if (msg.startsWith("unusable_completion:content_filter")) return false;
    return true;
  };

  // Generation call: GENERATION_MODEL (Claude Sonnet) as primary for final post quality.
  // Falls back to DEFAULT_MODEL (Gemini Flash) on timeout or transient network errors.
  // Safety refusals are NOT retried — they'll refuse again on the same content.
  const chatWithFallback = async (
    messages: any[],
    temperature: number,
    max_tokens: number,
    minChars: number = 200,
    primaryModel: string = DEFAULT_MODEL,
    fallbackModel: string = FALLBACK_MODEL,
    primaryTimeoutMs: number = 20000,
    fallbackTimeoutMs: number = 15000,
  ) => {
    try {
      const c = await callWithTimeout(primaryModel, messages, temperature, max_tokens, primaryTimeoutMs);
      if (!isUsableCompletion(c, minChars)) {
        const finish = c?.choices?.[0]?.finish_reason;
        const len = (c?.choices?.[0]?.message?.content || "").length;
        console.warn(`[Cortex] ${primaryModel} unusable (finish=${finish}, len=${len}) — retrying`);
        throw new Error(`unusable_completion:${finish}:${len}`);
      }
      return c;
    } catch (err: any) {
      if (!isRetryable(err)) {
        const reason = err?.name === "AbortError" ? "timeout" : (err?.message || "unknown");
        console.warn(`[Cortex] ${primaryModel} non-retryable failure (${reason}) — surfacing to caller`);
        throw err;
      }
      const reason = err?.name === "AbortError" ? "timeout" : (err?.status || err?.code || err?.message);
      console.warn(`[Cortex] ${primaryModel} failed (${reason}) — retrying with ${fallbackModel}`);
      const c2 = await callWithTimeout(fallbackModel, messages, temperature, max_tokens, fallbackTimeoutMs);
      return c2;
    }
  };

  const traceId = Math.random().toString(36).slice(2, 9);

  try {
    // Stage 1: Cortex writes the LinkedIn post.
    // Uses GENERATION_MODEL (Claude Sonnet) for superior hook quality, emotional
    // realism, and sentence-rhythm variation. Falls back to DEFAULT_MODEL on
    // timeout or transient errors only — safety refusals are not retried.
    const t1 = Date.now();
    const completion = await chatWithFallback(
      [
        { role: "system", content: systemInstructions },
        { role: "user",   content: userPrompt },
      ],
      isRegeneration ? 0.95 : 0.72,
      postMaxTokens,
      200,
      GENERATION_MODEL,
      DEFAULT_MODEL,
      // Sonnet primary 35s, Gemini fallback 20s. Route streams keepalive
      // pings to the client so Vercel's 25s first-byte limit never trips —
      // the only real ceiling is the OpenRouter call itself.
      35000,
      20000,
    );
    console.log(`[Cortex trace=${traceId}] stage=post model=${GENERATION_MODEL} ms=${Date.now() - t1} length=${length} tokens=${postMaxTokens}`);

    const raw = completion.choices[0].message.content || "";
    const post = sanitizePost(raw) || raw.trim();
    if (post.trim().length < 100) {
      const finish = completion.choices[0]?.finish_reason;
      throw new Error(`Post generation returned a truncated response (finish=${finish}, length=${post.length}). The model may have hit a safety filter or timeout. Try rewording the topic or regenerating.`);
    }

    // Stage 2 (image prompt) is now lazy — the client calls /api/ai/image-prompt
    // after navigating to preview, so this route's wall time is post-only.
    return { post, imagePrompt: "" };
  } catch (error: any) {
    console.error(`[Cortex trace=${traceId}] post generation failed:`, error);
    throw new Error(
      `Post generation failed: ${error.message || "Check your OpenRouter API key."}`
    );
  }
}

/**
 * Standalone image prompt regeneration — skips post generation entirely.
 * Used when the user wants a new image prompt without rewriting the post.
 */
export async function generateImagePrompt(topic: string, segment: string, post: string): Promise<string> {
  const imageSystemPrompt = section("IMAGE_PROMPT_SYSTEM");
  const imageUserPrompt = section("IMAGE_PROMPT_USER", {
    TOPIC:   topic,
    SEGMENT: segment,
    POST:    post,
  });

  const completion = await openRouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: withDateContext([
      { role: "system", content: imageSystemPrompt },
      { role: "user",   content: imageUserPrompt },
    ]),
    temperature: 0.7,
    max_tokens: 500,
  });

  return (completion.choices[0]?.message?.content || "").trim();
}

/**
 * Generate N correlated image prompts for a LinkedIn carousel post.
 *
 * Style is locked to LinkedIn-friendly infographic + illustration:
 *   blue (#0A66C2) and white primary, black/gray accents only.
 * Returns exactly `slideCount` prompts (2–5), each one slide of a coherent
 * narrative. Slide 1 = bold hook, middle = body/data, last = takeaway/CTA.
 *
 * If a `userComment` is passed alongside `existingPrompt`, the model rewrites
 * one slide's prompt to incorporate the user's feedback (e.g. "make it brighter").
 */
export async function generateCarouselPrompts(args: {
  topic: string;
  audience: string;
  tone: string;
  post: string;
  slideCount: number;
}): Promise<string[]> {
  const { topic, audience, tone, post, slideCount } = args;
  const n = Math.max(2, Math.min(5, slideCount | 0));

  const system = [
    `You design a ${n}-image LinkedIn carousel as gpt-image-2 prompts. The renderer draws TEXT inside the image — quote exact text in each prompt.`,
    "",
    "FORMAT (every image): square 1:1, modern minimal SaaS infographic, premium editorial feel (Apple / Stripe / Linear). High contrast, sans-serif typography only, plenty of whitespace, one strong focal point, no clutter, no stock photos, no AI-brain clichés, no emojis, no decorative icons.",
    "",
    `STORY ARC across ${n} images:`,
    "- Image 1 = HOOK. Big bold headline (6–10 words) that creates curiosity or states the contrarian idea. Single supporting visual metaphor. Optional one-line subhead. Designed to stop the scroll.",
    "- Middle images = SUPPORTING POINTS. Each one delivers ONE clear point from the post — a stat, a contrast, a step, a reason. Headline (4–8 words) + 1–2 supporting micro-lines + a single visual metaphor or simple diagram.",
    `- Image ${n} = TAKEAWAY / CTA. The conclusion the reader should walk away with. Short punchy line (4–8 words) + optional CTA pill text (2–4 words).`,
    "",
    "CONTINUITY (locked across all images):",
    "- ONE color system shared by every image: pick either DARK MODE (deep navy or near-black background, white text, ONE accent color) or LIGHT MODE (off-white background, near-black text, ONE accent color). Same accent on every image. State the exact colors in every prompt.",
    "- Same typography family vibe (bold sans-serif headlines, lighter sans-serif support). Same composition rhythm (headline dominant, single hero element, support text smaller).",
    "- Each image is self-contained but visually a sibling of the others.",
    "",
    "TEXT RULES (per image):",
    "- Quote the EXACT headline and supporting text in the prompt, in quotes.",
    "- Maximum per image: 1 headline + 2 short supporting lines (or 1 line + a stat). Last image may add a CTA pill.",
    "- No paragraphs. No long sentences. No emojis. No hashtags inside the image.",
    "",
    "PROMPT STRUCTURE (per image):",
    "[STYLE & MODE] modern minimal SaaS infographic, premium editorial, square 1:1, [dark|light] mode, sans-serif typography, high contrast",
    "[HEADLINE] exact text in quotes + position (top/center) + bold dominant",
    "[HERO VISUAL] one concept, 1–2 sentences",
    "[SUPPORTING TEXT] exact text in quotes + position",
    "[COLOR] background, primary text, ONE accent — exact colors named",
    "[FINISH] clean, sharp, premium, scroll-stopping, Apple/Stripe/Linear quality",
    "",
    "Each prompt: 80–160 words. Do NOT use the words 'slide', 'page', or 'carousel' inside the prompt. Do NOT mention image numbers in the prompt.",
    `Output STRICT JSON only — an array of exactly ${n} strings. No prose, no markdown fences. Example: ["prompt 1...","prompt 2..."]`,
  ].join("\n");

  const user = [
    `Topic: ${topic}`,
    `Audience: ${audience}`,
    `Tone: ${tone}`,
    `Image count: ${n}`,
    `Post body:\n${post.slice(0, 1400)}`,
    "",
    `Return a JSON array of exactly ${n} gpt-image-2 prompts. Image 1 = hook, middle = supporting points (one per image), image ${n} = takeaway/CTA. Lock ONE color mode (dark or light) and ONE accent across all ${n} prompts.`,
  ].join("\n");

  const completion = await openRouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: withDateContext([
      { role: "system", content: system },
      { role: "user",   content: user },
    ]),
    temperature: 0.75,
    max_tokens: 1100,
  });

  const raw = (completion.choices[0]?.message?.content || "").trim();

  // Try to parse the JSON. Models sometimes return {"prompts":[...]} instead of [...].
  let arr: any;
  try { arr = JSON.parse(raw); } catch {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) arr = JSON.parse(m[0]);
  }
  if (!Array.isArray(arr)) {
    if (arr && Array.isArray(arr.prompts)) arr = arr.prompts;
    else if (arr && Array.isArray(arr.slides)) arr = arr.slides;
  }
  if (!Array.isArray(arr)) throw new Error("AI did not return an array of prompts.");

  const cleaned = arr
    .map((s: any) => (typeof s === "string" ? s : s?.prompt || ""))
    .map((s: string) => s.trim())
    .filter(Boolean)
    .slice(0, n);

  if (cleaned.length < n) {
    while (cleaned.length < n) cleaned.push(cleaned[cleaned.length - 1] || "");
  }
  return cleaned;
}

/**
 * Refine a single carousel slide prompt based on user feedback.
 * Keeps the LinkedIn-friendly style locked.
 */
export async function refineCarouselPrompt(args: {
  originalPrompt: string;
  userComment: string;
  topic: string;
}): Promise<string> {
  const system =
    "You refine a single LinkedIn carousel image prompt for gpt-image-2. " +
    "Style is locked: modern minimal SaaS infographic, premium editorial (Apple/Stripe/Linear), square 1:1, sans-serif typography, high contrast, ONE accent color, plenty of whitespace, no stock photos, no AI-brain clichés, no emojis. The renderer draws text inside the image — keep exact text in quotes. " +
    "Apply the user's feedback while preserving the locked style, the chosen color mode (dark/light), the accent color, and the image's role in the story. " +
    "Output ONLY the new prompt text — no preamble, no JSON, no quotes around the whole thing.";

  const user = [
    `Topic: ${args.topic}`,
    `Original prompt:\n${args.originalPrompt}`,
    `User feedback: ${args.userComment}`,
    "",
    "Rewrite the prompt incorporating the feedback.",
  ].join("\n");

  const completion = await openRouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: withDateContext([
      { role: "system", content: system },
      { role: "user",   content: user },
    ]),
    temperature: 0.7,
    max_tokens: 280,
  });

  return (completion.choices[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
}

/**
 * Layer 2: Generate a 7-word-max hook/question for image text overlay.
 * On-demand — called when user clicks "Generate Hook" on the preview page.
 */
export async function generateImageHook(post: string, topic: string): Promise<string> {
  // Use the centralized OpenRouter client — consistent auth, error handling, and future logging
  const completion = await openRouter.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: withDateContext([
      {
        role: "system",
        content: "You write short, punchy image overlay hooks for LinkedIn posts. Output ONLY the hook text — 7 words maximum, no punctuation at the end, no quotes. Make it a bold question or provocative statement that makes the viewer stop and read the post. Do not explain. Do not use hashtags.",
      },
      {
        role: "user",
        content: `Topic: "${topic}"\n\nPost:\n${post.slice(0, 600)}\n\nWrite a 7-word-max hook for the image overlay.`,
      },
    ]),
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
