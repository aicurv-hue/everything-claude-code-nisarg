// Standalone Cortex generation test — bypasses Firebase/auth/quota.
// Uses the exact NEEL_SECTIONS the deployed pipeline uses.
// Run: node c:/tmp/test-cortex.mjs

import { readFileSync } from "fs";
import OpenAI from "openai";

// ── Load .env.local manually ────────────────────────────────────────────────
const envFile = readFileSync("c:/Users/USER/Desktop/Anti Gravity/LInkedin automation/.env.local", "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");

// ── Pull NEEL_SECTIONS via tsx-compiled import ─────────────────────────────
// Easier: re-extract the constants we need by importing the .ts via tsx
// Actually — just paste the relevant ones inline since this is a one-off test.
// Read the file at runtime so we always test the LATEST prompt.
const sectionsFile = readFileSync(
  "c:/Users/USER/Desktop/Anti Gravity/LInkedin automation/src/lib/ai/neel-prompt-sections.ts",
  "utf8"
);
function pullSection(name) {
  const re = new RegExp(`${name}: \`([\\s\\S]*?)\`,\\n`, "m");
  const m = sectionsFile.match(re);
  if (!m) throw new Error(`Section ${name} not found`);
  return m[1];
}
const NEEL = {
  IDENTITY: pullSection("IDENTITY"),
  INTENT_DETECTION: pullSection("INTENT_DETECTION"),
  OUTPUT_RULES: pullSection("OUTPUT_RULES"),
  HOOK_PROFESSIONAL: pullSection("HOOK_PROFESSIONAL"),
  HOOK_STORYTELLING: pullSection("HOOK_STORYTELLING"),
  HOOK_EDUCATIONAL: pullSection("HOOK_EDUCATIONAL"),
  HOOK_CONTRARIAN: pullSection("HOOK_CONTRARIAN"),
  SEGMENT_INDIVIDUAL: pullSection("SEGMENT_INDIVIDUAL"),
  SEGMENT_CORPORATE: pullSection("SEGMENT_CORPORATE"),
  STRUCTURE: pullSection("STRUCTURE"),
  COPYWRITING_RULES: pullSection("COPYWRITING_RULES"),
  FORMATTING: pullSection("FORMATTING"),
};

// ── OpenRouter client ──────────────────────────────────────────────────────
const openRouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://test.local", "X-Title": "Cortex test" },
});
const GENERATION_MODEL = "anthropic/claude-sonnet-4-6";
const RESEARCH_MODEL = "google/gemini-2.5-flash";

// ── Research step (simplified — produces same shape as performResearch) ────
async function research(topic, tone, audience) {
  const sys = `You are a research analyst preparing data for a LinkedIn post writer. Return ONLY valid JSON, no markdown, no commentary.`;
  const user = `Topic: "${topic}"
Tone: ${tone}
Audience: ${audience}

Return a JSON object with this exact shape:
{
  "summary": "2-3 sentence summary of the topic landscape",
  "insights": [
    { "title": "short label", "content": "1-2 sentence insight with a SPECIFIC number or named example if you have one" },
    { "title": "...", "content": "..." },
    { "title": "...", "content": "..." }
  ],
  "recommendedAngle": "the single sharpest thesis the post should build around (1 sentence)",
  "hookCandidates": [
    "stat-based hook (1 sentence)",
    "story/scene hook (1 sentence)",
    "contrarian hook (1 sentence)"
  ]
}

Rules: only include numbers/percentages if they reflect real research. Do not invent statistics.`;

  const r = await openRouter.chat.completions.create({
    model: RESEARCH_MODEL,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    temperature: 0.4,
    max_tokens: 1200,
  });
  const txt = r.choices[0].message.content.trim();
  const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

// ── Generation step (mirrors generate.ts assembly logic) ───────────────────
const LENGTH_SPEC = {
  short:  { words: "exactly 95–105 words (target 100)",  paragraphs: "3–5 short paragraphs" },
  medium: { words: "exactly 190–210 words (target 200)", paragraphs: "6–8 short paragraphs" },
  long:   { words: "exactly 380–420 words (target 400)", paragraphs: "10–14 short paragraphs" },
};

async function generate({ topic, tone, audience, length, segment, research }) {
  const ls = LENGTH_SPEC[length];
  const hookKey = `HOOK_${tone.toUpperCase()}`;
  const segmentKey = segment === "individual" ? "SEGMENT_INDIVIDUAL" : "SEGMENT_CORPORATE";
  const isOpinionTone = tone === "contrarian" || tone === "storytelling";

  const angleBlock = `══════════════════════════════════════════
ANGLE ENGINE — THINK BEFORE YOU WRITE
══════════════════════════════════════════
Sharpest angle for this post (build your argument around this):
"${research.recommendedAngle}"

3 hook candidates — pick the strongest or write a superior one in the same vein:
${research.hookCandidates.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Do not copy a hook verbatim — use these as the strategic foundation, then sharpen.
══════════════════════════════════════════`;

  const sys = [
    NEEL.IDENTITY, "",
    NEEL.INTENT_DETECTION, "",
    NEEL.OUTPUT_RULES, "",
    `══════════════════════════════════════════
POST PARAMETERS
══════════════════════════════════════════
Tone:            ${tone}
Audience:        ${audience}
Word count:      ${ls.words}
Paragraphs:      ${ls.paragraphs}
Hook formula:    ${NEEL[hookKey]}`, "",
    NEEL[segmentKey], "",
    NEEL.STRUCTURE.replaceAll("{{PARAGRAPHS}}", ls.paragraphs), "",
    NEEL.COPYWRITING_RULES, "",
    NEEL.FORMATTING, "",
    angleBlock, "",
    `══════════════════════════════════════════
BRAND CONTEXT
══════════════════════════════════════════
No brand profile — write in a clear, credible professional voice.`,
  ].join("\n").trim();

  const insightLines = isOpinionTone
    ? `${research.insights[0].title}: ${research.insights[0].content}`
    : research.insights.map((i, n) => `${n+1}. ${i.title}: ${i.content}`).join("\n");
  const insightLabel = isOpinionTone
    ? `One supporting data point (use sparingly — max once in the post, mid-body only. The opinion carries the post, not this stat):`
    : `Research context (weave into the argument naturally — do NOT walk through these linearly or structure the body around them. Drop any that don't serve the post):`;

  const user = `Generate the LinkedIn post now.

Topic:    ${topic}
Tone:     ${tone}
Audience: ${audience}
Length:   ${ls.words}
Segment:  ${segment}

Research summary:
${research.summary}

${insightLabel}
${insightLines}

HARD CONSTRAINT — word count: The post MUST be ${ls.words}. Count your words before finishing. If outside the range, rewrite tighter or expand until you hit the target. This is non-negotiable — the user explicitly selected this length.

Start directly with the hook line. Output nothing else.`;

  const maxTokens = length === "long" ? 1600 : length === "short" ? 800 : 1200;
  const r = await openRouter.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    temperature: 0.85,
    max_tokens: maxTokens,
  });
  return r.choices[0].message.content.trim();
}

// ── Topic queue ────────────────────────────────────────────────────────────
const TOPICS = [
  {
    label: "1. Founder Hiring (Contrarian)",
    topic: "Why hiring 'A-players' early is killing your startup. Most founders chase senior talent before they have product clarity, then wonder why those hires leave in 6 months. Share what actually works in the 0→1 stage.",
    tone: "contrarian", audience: "Founders & CEOs", length: "medium", segment: "individual",
  },
  {
    label: "2. B2B Sales Cycles (Insight, Long)",
    topic: "The real reason B2B sales cycles are getting longer in 2026. Buyers now run silent evaluations across 4–6 vendors before ever taking a call. What this means for outbound, content, and demos.",
    tone: "educational", audience: "Marketers & Growth", length: "long", segment: "individual",
  },
  {
    label: "3. Failed Launch (Personal Story)",
    topic: "We launched a product feature last quarter that flopped. Spent 3 months building it, got 12 users, killed it in week 4. What we learned about validating demand before writing code.",
    tone: "storytelling", audience: "Founders & CEOs", length: "medium", segment: "individual",
  },
  {
    label: "4. AI in Hiring (Industry Insight)",
    topic: "Recruiters are quietly using AI to screen 80% of resumes — but the candidates getting through aren't the most qualified, they're the ones who write for the algorithm. What this is doing to job markets.",
    tone: "professional", audience: "General Professional", length: "medium", segment: "individual",
  },
  {
    label: "5. Cridl Cortex (Promo)",
    topic: "Most LinkedIn 'AI ghostwriters' produce posts that sound like LinkedIn ghostwriters. Here's what we did differently with Cridl Cortex — angle engine, style DNA, hook diversity — so posts actually sound like the person writing them.",
    tone: "educational", audience: "Marketers & Growth", length: "medium", segment: "individual",
  },
];

(async () => {
  const onlyIdx = process.argv[2] ? parseInt(process.argv[2], 10) - 1 : null;
  const queue = onlyIdx !== null ? [TOPICS[onlyIdx]] : TOPICS;
  for (const t of queue) {
    console.log(`\n${"=".repeat(80)}\n${t.label}\n${"=".repeat(80)}`);
    console.log(`Tone: ${t.tone} | Audience: ${t.audience} | Length: ${t.length}\n`);
    try {
      const r = await research(t.topic, t.tone, t.audience);
      console.log(`[research done — ${r.insights.length} insights, angle: "${r.recommendedAngle.slice(0,80)}..."]`);
      const post = await generate({ ...t, research: r });
      console.log(`\n--- POST ---\n${post}\n--- END (${post.split(/\s+/).length} words) ---`);
    } catch (e) {
      console.error(`FAIL: ${e.message}`);
    }
  }
})();
