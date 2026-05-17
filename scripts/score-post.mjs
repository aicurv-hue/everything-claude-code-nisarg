// scripts/score-post.mjs
// Cridl Cortex post-quality scorer (v2 — 2026-05-17 rewrite).
// Judges LinkedIn posts on COPYWRITING_RULES (NEEL_RUNTIME.md) for authenticity.
//
// Pipeline:
//   1. ~24 deterministic heuristics (binary pass/fail, weighted, evidence-bearing)
//   2. 9-dimension LLM judge (Gemini Flash, 0–10 each, evidence-quoted)
//   3. Combine → 5 weighted categories totalling 100:
//      SPECIFICITY 25 · AI_TELLS 25 · VOICE 20 · HONESTY 15 · STRUCTURE 15
//   4. Verdict bands: 90+ SHIP · 80–89 POLISH · 65–79 WEAK · <65 FAIL
//   5. Writes markdown report + JSON sidecar to score-reports/, tagged with SHA
//
// Usage:
//   node scripts/score-post.mjs                  # batch: regen 5 topics + score
//   node scripts/score-post.mjs --file path.txt  # score a file
//   node scripts/score-post.mjs "post text..."   # score pasted text

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import OpenAI from "openai";

const PROJECT = "c:/Users/USER/Desktop/Anti Gravity/LInkedin automation";
const SCORER_VERSION = "v2-2026-05-17";

// ── Env ─────────────────────────────────────────────────────────────────────
const envFile = readFileSync(`${PROJECT}/.env.local`, "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing in .env.local");

const openRouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://test.local", "X-Title": "Cortex scorer v2" },
});
const JUDGE_MODEL = "google/gemini-2.5-flash";

// ── Fix templates: what to do when a rule fails ─────────────────────────────
const FIX_TEMPLATES = {
  no_round_percentages:      "Replace with a specific number from research, or remove the %",
  no_hashtags:               "Delete all hashtags — LinkedIn 2025–26 algo uses topic detection, hashtags read as AI/marketer signature",
  no_em_dashes:              "Replace — with comma, period, colon, or two short sentences",
  no_en_dashes:              "Replace – with hyphen or comma",
  no_smart_quotes:           "Replace curly quotes with straight \" and '",
  no_i_keep_seeing:          "Open with a specific scene ('Last Tuesday I was reviewing…') or the claim itself",
  no_x_isnt_y_its_z:         "Land contrast differently: a specific image, an admission, or a flat statement (don't redefine the noun)",
  no_its_not_x_its_y:        "Cut the 'It's not X, it's Y' formula — make one direct claim instead",
  no_cliched_opening:        "Open with a specific scene, a sharp claim, or a real number — not a stock LinkedIn intro",
  no_heres_the_reveal:       "Cut the reveal phrase ('Here's the thing', 'Spoiler:', etc.) — let the next sentence stand on its own",
  no_engagement_bait:        "Cut generic CTA. Rotate the close: specific question, flat statement, admission, offer, or no CTA",
  no_universal_truth_closer: "Replace universal lesson with one specific observation tied to the post's subject",
  no_emoji_overuse:          "Cut to ≤2 emojis — heavy emoji use reads as marketer/AI signature",
  no_corporate_verbs:        "Use plain verb: use, find, push, grow, fix, build, ship, try, break, run",
  no_exclamations:           "Drop exclamation marks — let the sentence carry its own weight",
  no_filler_transitions:     "Cut 'Furthermore/Moreover/Additionally' — start the next idea directly",
  no_labeled_imperfection:   "Weave doubt inside another sentence ('I don't fully know why this worked') instead of a standalone admission line",
  no_numbered_lessons:       "Cut the numbered list. Show what happened; let the reader extract the takeaway",
  no_tricolon_fragments:     "Break the rhythm: extend one of the short sentences or merge two",
  no_anaphora_abuse:         "Vary sentence openers — don't start 3+ sentences with the same word",
  no_question_stack_opening: "Open with a statement, not a stack of rhetorical questions",
  no_ellipsis_abuse:         "Cut the ellipses — they signal dramatic pause / AI hedging",
  no_bullet_overuse:         "Replace bullet lists with prose; LinkedIn prose outperforms bulleted templates",
  word_count_in_range:       "Target 80–220 words (LinkedIn sweet spot). <60 = too thin; >280 = labored",
  // LLM dimensions
  specific_subject:            "Add ONE specific anonymized subject with concrete attributes (size, role, stage, $, time)",
  micro_specifics:             "Add weird-specific anchors: Tuesday afternoon, $4,200, 23 minutes, the second-floor coffee machine",
  sensory_concreteness:        "Describe a filmable scene: sounds, textures, physical spaces, time of day",
  stakes_and_consequence:      "Make consequences specific to a person: 'she missed payroll by 9 days' not 'founders waste money'",
  inline_doubt:                "Weave one line of honest doubt INSIDE another sentence (NOT a standalone 'I'm still figuring out X')",
  uncomfortable_truth:         "Name one thing readers won't admit out loud — sharp and specific",
  earned_insight:              "Make the conclusion follow from the story — don't tack on a moral. Reader should infer it",
  voice_signature:             "Add an idiosyncratic verbal tic or phrasing — generic competence ≠ memorable",
  first_person_conversational: "Talk to a peer, not broadcast ('I noticed' not 'Founders should')",
};

// ── Heuristics (deterministic) ──────────────────────────────────────────────
// Each check returns: { rule, category, pass, detail, evidence, severity, weight }
//   evidence: actual text span that triggered the failure (or null)
//   weight:   points this check contributes to its category if passed
//   severity: high | medium | low (drives top-3-fix prioritisation)
function heuristics(post) {
  const checks = [];
  const paragraphs = post.trim().split(/\n\s*\n/);
  const firstPara = paragraphs[0] || "";
  const lastPara = paragraphs[paragraphs.length - 1] || "";
  const lastTwoParas = paragraphs.slice(-2).join("\n");
  const sentences = post.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  const trimmed = post.trim();

  const push = c => checks.push({ ...c, evidence: c.evidence ?? null });

  // ─── SPECIFICITY (3 pts deterministic) ──────────────────────────────────
  // 1. Round percentages (likely invented)
  const allPercents = post.match(/\b\d{1,3}%/g) || [];
  const roundFakes = allPercents.filter(s => {
    const n = parseInt(s);
    return n > 0 && n < 100 && n % 5 === 0;
  });
  push({
    rule: "no_round_percentages",
    category: "specificity",
    pass: roundFakes.length === 0,
    detail: roundFakes.length ? `Suspicious round %: ${roundFakes.join(", ")}` : "No round %",
    evidence: roundFakes[0] || null,
    severity: "high",
    weight: 3,
  });

  // ─── AI_TELLS (25 pts deterministic) ────────────────────────────────────
  // 2. Hashtags
  const hashtags = post.match(/(^|\s)#[A-Za-z][A-Za-z0-9_]+/g) || [];
  push({
    rule: "no_hashtags",
    category: "ai_tells",
    pass: hashtags.length === 0,
    detail: hashtags.length ? `${hashtags.length} hashtag(s): ${hashtags.slice(0, 3).map(h => h.trim()).join(", ")}` : "Zero hashtags",
    evidence: hashtags[0]?.trim() || null,
    severity: "high",
    weight: 4,
  });

  // 3. Em dashes (— hard ban per prompt header)
  const emDashes = (post.match(/—/g) || []).length;
  const emCtx = emDashes ? (post.match(/[^.!?\n]*—[^.!?\n]*/)?.[0]?.trim().slice(0, 120) || "—") : null;
  push({
    rule: "no_em_dashes",
    category: "ai_tells",
    pass: emDashes === 0,
    detail: emDashes ? `${emDashes} em dash(es)` : "Zero em dashes",
    evidence: emCtx,
    severity: "high",
    weight: 3,
  });

  // 4. En dashes (–)
  const enDashes = (post.match(/–/g) || []).length;
  push({
    rule: "no_en_dashes",
    category: "ai_tells",
    pass: enDashes === 0,
    detail: enDashes ? `${enDashes} en dash(es)` : "Zero en dashes",
    evidence: enDashes ? "–" : null,
    severity: "low",
    weight: 1,
  });

  // 5. Smart/curly quotes (LLM-paste tell)
  const smartQuotes = post.match(/[‘’“”]/g) || [];
  push({
    rule: "no_smart_quotes",
    category: "ai_tells",
    pass: smartQuotes.length === 0,
    detail: smartQuotes.length ? `${smartQuotes.length} curly quote(s)` : "Straight quotes only",
    evidence: smartQuotes[0] || null,
    severity: "low",
    weight: 1,
  });

  // 6. "I keep seeing" / "I've been seeing" crutch
  const crutch = post.match(/I keep (seeing|noticing|hearing)|I've been (seeing|noticing|watching|hearing)/i);
  push({
    rule: "no_i_keep_seeing",
    category: "ai_tells",
    pass: !crutch,
    detail: crutch ? `Crutch phrase: "${crutch[0]}"` : "No crutch",
    evidence: crutch?.[0] || null,
    severity: "high",
    weight: 3,
  });

  // 7. "X isn't Y. It's Z." reveal pattern (prompt rule 5)
  const isntItsRe = /\b(isn't|is not|wasn't|was not|aren't|are not|won't be|never (?:was|will be))[^.!?\n]{1,80}[.!?]\s+(?:It's|That's|It was|That was|It is|This is|They're|They are)\s+[^.!?\n]{1,100}[.!?]/g;
  const isntItsMatches = post.match(isntItsRe) || [];
  push({
    rule: "no_x_isnt_y_its_z",
    category: "ai_tells",
    pass: isntItsMatches.length === 0,
    detail: isntItsMatches.length ? `${isntItsMatches.length} reveal pattern(s)` : "No reveal pattern",
    evidence: isntItsMatches[0]?.replace(/\s+/g, " ").slice(0, 140) || null,
    severity: "high",
    weight: 3,
  });

  // 8. "It's not X, it's Y." single-line sibling
  const itsNotRe = /\b(?:It's not|It is not|It isn't|It wasn't|It was not)\s+[^,.\n]{2,60},\s+(?:it's|it is|it was)\s+[^,.\n]{2,60}[.!?]/gi;
  const itsNotMatches = post.match(itsNotRe) || [];
  push({
    rule: "no_its_not_x_its_y",
    category: "ai_tells",
    pass: itsNotMatches.length === 0,
    detail: itsNotMatches.length ? `${itsNotMatches.length} "It's not X, it's Y" line(s)` : "None",
    evidence: itsNotMatches[0]?.slice(0, 140) || null,
    severity: "high",
    weight: 2,
  });

  // 9. Cliché opening
  const clicheRe = /^(In today's|In a world|In the ever[- ]evolving|Excited to announce|I wanted to share|I'm thrilled|Most (?:people|founders|marketers|leaders|professionals|entrepreneurs)|Let's (?:talk about|be honest|face it|cut to the chase)|Here's a hard truth|Hot take|Real talk)/i;
  const cliche = trimmed.match(clicheRe);
  push({
    rule: "no_cliched_opening",
    category: "ai_tells",
    pass: !cliche,
    detail: cliche ? `Cliché opening: "${cliche[0]}..."` : "Fresh opening",
    evidence: cliche ? cliche[0] : null,
    severity: "high",
    weight: 2,
  });

  // 10. "Here's the X:" / "Spoiler:" / "Plot twist:" reveal tells (merged with old fake_pivot)
  const heresRe = /(?:^|\n|\.\s+)(Here's the (?:thing|kicker|truth|reality|catch|deal|problem|secret|insight|crazy part|wild part)|Here's what(?:'s actually| I think is actually| nobody tells you)|Spoiler:|Plot twist:|Reality check:|Pro tip:|Hot take:|Truth bomb:|Real talk:|Let me be (?:real|honest)|Let's be honest|The truth is[,:]|The kicker[,:]?)/gi;
  const heresMatches = [...post.matchAll(heresRe)].map(m => m[1]);
  push({
    rule: "no_heres_the_reveal",
    category: "ai_tells",
    pass: heresMatches.length === 0,
    detail: heresMatches.length ? `${heresMatches.length} tell(s): ${[...new Set(heresMatches)].slice(0, 3).join(" | ")}` : "None",
    evidence: heresMatches[0] || null,
    severity: "high",
    weight: 2,
  });

  // 11. Engagement-bait closer (check last paragraph)
  const baitRe = /\b(thoughts\?|what do you think\?|have you seen this\?|drop your take|drop a 🔥|let me know in the comments|comment yes|agree\?|tag someone who|share if you|repost if you)\b/i;
  const baitMatch = lastPara.match(baitRe);
  push({
    rule: "no_engagement_bait",
    category: "ai_tells",
    pass: !baitMatch,
    detail: baitMatch ? `Bait closer: "${baitMatch[0]}"` : "None",
    evidence: baitMatch?.[0] || null,
    severity: "high",
    weight: 2,
  });

  // 12. Universal-truth closer (last paragraph)
  const truthCloserRe = /\b(at the end of the day|stay (?:curious|humble|hungry|focused)|keep building|growth doesn't happen|sometimes the (?:simplest|hardest|smallest|best|biggest) (?:answer|thing|move|win|step) (?:is|wins|matters)|what matters most|the (?:real )?lesson (?:here )?is|that's the (?:lesson|takeaway|reality|truth)|and that's (?:a lesson|worth)|remember[,:] )/i;
  const truthCloserMatch = lastPara.match(truthCloserRe);
  push({
    rule: "no_universal_truth_closer",
    category: "ai_tells",
    pass: !truthCloserMatch,
    detail: truthCloserMatch ? `Universal-truth closer: "${truthCloserMatch[0]}"` : "None",
    evidence: truthCloserMatch?.[0] || null,
    severity: "medium",
    weight: 1,
  });

  // 13. Emoji overuse (≥4 emojis)
  const emojis = post.match(/\p{Extended_Pictographic}/gu) || [];
  push({
    rule: "no_emoji_overuse",
    category: "ai_tells",
    pass: emojis.length < 4,
    detail: emojis.length >= 4 ? `${emojis.length} emojis (≥4 = AI/marketer signal)` : `${emojis.length} emoji(s)`,
    evidence: emojis.length >= 4 ? emojis.slice(0, 6).join("") : null,
    severity: "low",
    weight: 1,
  });

  // ─── VOICE (9 pts deterministic) ────────────────────────────────────────
  // 14. Corporate verbs (expanded)
  const corpRe = /\b(leverag(?:e|ing|ed|es)|unlock(?:ing|ed|s)?|driv(?:e|es|en|ing)? (?:growth|results|value|impact|change|outcomes)|driving (?:growth|results|value)|scale (?:our|the|your|up)|scaling (?:our|the|your|up)|optimiz(?:e|ing|ed|es)|transform(?:ing|ed|s)?|empower(?:ing|ed|s)?|enable(?:s|d|ing) (?:our|the|teams|users|customers|growth)|streamlin(?:e|ing|ed|es)|harness(?:ing|ed|es)?|accelerat(?:e|ing|ed|es)|navigat(?:e|ing|ed|es)? (?:the|this|complex|change|uncertainty)|deep[- ]div(?:e|ing|ed)|double[- ]down|move(?:s|d)? the needle|moving the needle|level[- ]up(?:ping)?|ideat(?:e|ing|ed|es)|operationaliz(?:e|ing|ed)|strategiz(?:e|ing|ed)|synergiz(?:e|ing|ed)|circle back|deliverable[s]?|stakeholder[s]?|actionable insight[s]?|game[- ]changer|best[- ]in[- ]class|world[- ]class|cutting[- ]edge|next[- ]level|thought leadership|mission[- ]critical|value[- ]add|low[- ]hanging fruit|holistic|disruptive|robust solution|scalable solution|seamless|innovative solution)\b/gi;
  const corpMatches = post.match(corpRe) || [];
  push({
    rule: "no_corporate_verbs",
    category: "voice",
    pass: corpMatches.length === 0,
    detail: corpMatches.length ? `Corporate: ${[...new Set(corpMatches.map(m => m.toLowerCase()))].slice(0, 5).join(", ")}` : "Plain verbs only",
    evidence: corpMatches[0] || null,
    severity: "medium",
    weight: 5,
  });

  // 15. Exclamation marks
  const exclaims = (post.match(/!/g) || []).length;
  push({
    rule: "no_exclamations",
    category: "voice",
    pass: exclaims === 0,
    detail: exclaims ? `${exclaims} exclamation(s)` : "None",
    evidence: exclaims ? "!" : null,
    severity: "low",
    weight: 2,
  });

  // 16. Filler transitions
  const fillerRe = /\b(Furthermore|Moreover|Additionally|That being said|On the other hand|In conclusion|To summarize|First and foremost|It goes without saying)[,\s]/g;
  const fillerMatches = post.match(fillerRe) || [];
  push({
    rule: "no_filler_transitions",
    category: "voice",
    pass: fillerMatches.length === 0,
    detail: fillerMatches.length ? `Filler: ${[...new Set(fillerMatches.map(f => f.trim().replace(/,$/, "")))].join(", ")}` : "None",
    evidence: fillerMatches[0]?.trim().replace(/,$/, "") || null,
    severity: "low",
    weight: 2,
  });

  // ─── HONESTY (3 pts deterministic) ──────────────────────────────────────
  // 17. Labeled imperfection (prompt rule 7)
  const labeledRe = /(?:^|\n)(I'm still (?:figuring out|working through|trying to figure)|I don't have (?:it figured|all the answers))/m;
  const labeledMatch = post.match(labeledRe);
  push({
    rule: "no_labeled_imperfection",
    category: "honesty",
    pass: !labeledMatch,
    detail: labeledMatch ? `Labeled doubt: "${labeledMatch[0].trim()}..."` : "None",
    evidence: labeledMatch ? labeledMatch[1] : null,
    severity: "medium",
    weight: 3,
  });

  // ─── STRUCTURE (11 pts deterministic) ───────────────────────────────────
  // 18. Word count in LinkedIn sweet spot
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const wcOK = wordCount >= 60 && wordCount <= 280;
  push({
    rule: "word_count_in_range",
    category: "structure",
    pass: wcOK,
    detail: wcOK ? `${wordCount} word(s)` : `${wordCount} word(s) — ${wordCount < 60 ? "too thin" : "over 280 (sweet spot is 80–220)"}`,
    evidence: wcOK ? null : `${wordCount} words`,
    severity: "low",
    weight: 2,
  });

  // 19. Numbered "lessons / takeaways / things I learned" (prompt rule 10)
  const lessonsRe = /(\b\d+\s+(?:lessons|things I learned|takeaways|key insights|tips|principles|rules|reasons)\b|Here are (?:the|my) (?:lessons|takeaways|key insights|principles|rules|reasons))/i;
  const lessonMatch = lastTwoParas.match(lessonsRe);
  push({
    rule: "no_numbered_lessons",
    category: "structure",
    pass: !lessonMatch,
    detail: lessonMatch ? `Template: "${lessonMatch[0]}"` : "None",
    evidence: lessonMatch?.[0] || null,
    severity: "medium",
    weight: 2,
  });

  // 20. Tricolon of fragments (4+ consecutive ≤5-word sentences — relaxed from 3)
  let maxRun = 0, run = 0, runStart = -1, bestRunStart = -1;
  for (let i = 0; i < sentences.length; i++) {
    const wc = sentences[i].split(/\s+/).length;
    if (wc <= 5) {
      if (run === 0) runStart = i;
      run++;
      if (run > maxRun) { maxRun = run; bestRunStart = runStart; }
    } else {
      run = 0;
    }
  }
  const tricolonEv = maxRun >= 4 && bestRunStart >= 0
    ? sentences.slice(bestRunStart, bestRunStart + Math.min(maxRun, 4)).join(" / ")
    : null;
  push({
    rule: "no_tricolon_fragments",
    category: "structure",
    pass: maxRun < 4,
    detail: maxRun >= 4 ? `${maxRun} consecutive ≤5-word sentences (tricolon)` : `Max run: ${maxRun}`,
    evidence: tricolonEv,
    severity: "low",
    weight: 2,
  });

  // 21. Anaphora abuse — 3+ consecutive sentences starting with same first word (≥3 letters)
  let anaRun = 1, anaMax = 1, anaWord = "", anaWordTmp = "";
  let lastFirst = "";
  for (const s of sentences) {
    const first = (s.match(/^[A-Za-z']+/)?.[0] || "").toLowerCase();
    if (first && first === lastFirst && first.length >= 3) {
      anaRun++;
      anaWordTmp = first;
      if (anaRun > anaMax) { anaMax = anaRun; anaWord = anaWordTmp; }
    } else {
      anaRun = 1;
    }
    lastFirst = first;
  }
  push({
    rule: "no_anaphora_abuse",
    category: "structure",
    pass: anaMax < 3,
    detail: anaMax >= 3 ? `${anaMax} consecutive sentences start with "${anaWord}"` : `Max anaphora run: ${anaMax}`,
    evidence: anaMax >= 3 ? `${anaMax}× "${anaWord}..."` : null,
    severity: "medium",
    weight: 2,
  });

  // 22. Question-stack opening (≥2 questions in first paragraph)
  const qCount = (firstPara.match(/\?/g) || []).length;
  push({
    rule: "no_question_stack_opening",
    category: "structure",
    pass: qCount < 2,
    detail: qCount >= 2 ? `${qCount} questions in opening paragraph` : `Opening questions: ${qCount}`,
    evidence: qCount >= 2 ? firstPara.slice(0, 120) : null,
    severity: "low",
    weight: 1,
  });

  // 23. Ellipsis abuse (≥2 occurrences)
  const ellipsisCount = (post.match(/\.{3}/g) || []).length + (post.match(/…/g) || []).length;
  push({
    rule: "no_ellipsis_abuse",
    category: "structure",
    pass: ellipsisCount < 2,
    detail: ellipsisCount >= 2 ? `${ellipsisCount} ellipsis occurrence(s)` : `Ellipses: ${ellipsisCount}`,
    evidence: ellipsisCount >= 2 ? "..." : null,
    severity: "low",
    weight: 1,
  });

  // 24. Bullet overuse (≥6 bullet/numbered lines)
  const bulletLines = (post.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length;
  push({
    rule: "no_bullet_overuse",
    category: "structure",
    pass: bulletLines < 6,
    detail: bulletLines >= 6 ? `${bulletLines} bullet/numbered lines (prose outperforms templates)` : `Bullets: ${bulletLines}`,
    evidence: bulletLines >= 6 ? `${bulletLines} bullets` : null,
    severity: "low",
    weight: 1,
  });

  return checks;
}

// ── LLM Judge (9 subjective dimensions) ─────────────────────────────────────
async function llmJudge(post) {
  const sys = `You are a discerning critic of LinkedIn posts. You grade posts on SUBJECTIVE qualities that distinguish human writing from AI ghostwriter output. Be strict — most AI-written posts deserve 4–6 on most dimensions. Return ONLY valid JSON, no markdown fences.`;

  const user = `Score this LinkedIn post on 9 SUBJECTIVE qualities. For each, return an integer 0–10 and a 1-sentence reason that QUOTES a specific phrase from the post as evidence.

POST:
"""
${post}
"""

DIMENSIONS:

1. specific_subject — Is there ONE specific anonymized subject with concrete attributes (size, role, stage, $, time)? Plural abstractions ("founders", "marketers", "teams", "leaders") = 0–3. Named anonymized with ONE attribute ("a founder I worked with last year") = 5–6. Multiple concrete attributes ("a Series A fintech founder, 23 people, just lost her CTO") = 9–10.

2. micro_specifics — Are there granular specifics you'd only know if you were there? Real human details are odd: Tuesday afternoon, $4,200, 23 minutes, the second-floor coffee machine, the third revision. AI rounds and abstracts ("a few months ago", "a couple times", "around six figures") = 0–3. One specific detail = 5–6. Multiple weird-specific anchors = 8–10.

3. sensory_concreteness — Could you film or photograph the scene? Real settings have sounds, textures, physical spaces, time of day. "In a meeting last quarter" = 0–2. "Tuesday standup, half the team on Zoom, the rest in the conference room with the broken AC" = 8–10.

4. stakes_and_consequence — Does something matter to a specific person, with real downside? "Founders waste money" = 0–2 (generic). "She missed payroll by 9 days, the CTO quit, and the seed extension fell through" = 9–10.

5. inline_doubt — Is there woven hedging that reads as honest, NOT a labeled "I'm still figuring out X" line? 10 = woven naturally inside other sentences ("I don't fully know why this worked"); 5 = doubt present but feels checkbox; 0 = polished authority with no admission of limit.

6. uncomfortable_truth — Is there one truth most readers won't admit out loud? 10 = sharp, specific, makes the reader wince; 5 = generic ("we all do this"); 0 = none — only safe observations.

7. earned_insight — Does the conclusion grow FROM the story or is it tacked on like a moral? 10 = reader could draw the takeaway from the story alone — conclusion is a release of pressure built earlier; 5 = related but stated separately; 0 = bolted-on lesson ("And the lesson is…", "Sometimes the simplest answer wins.").

8. voice_signature — Does the writer have idiosyncratic verbal tics you'd recognize across posts? 10 = clear voice with weird-specific phrasings; 5 = competent but generic; 0 = could have been written by anyone.

9. first_person_conversational — Does "I"/"we" appear as someone talking to a peer, NOT as a broadcaster ("Founders should…" / "Organizations must…")? 10 = consistently conversational; 0 = declarative announcement.

Return ONLY this JSON shape (no markdown, no commentary):
{
  "scores": {
    "specific_subject": <int 0-10>,
    "micro_specifics": <int 0-10>,
    "sensory_concreteness": <int 0-10>,
    "stakes_and_consequence": <int 0-10>,
    "inline_doubt": <int 0-10>,
    "uncomfortable_truth": <int 0-10>,
    "earned_insight": <int 0-10>,
    "voice_signature": <int 0-10>,
    "first_person_conversational": <int 0-10>
  },
  "reasons": {
    "specific_subject": "<quote> — reason",
    "micro_specifics": "...",
    "sensory_concreteness": "...",
    "stakes_and_consequence": "...",
    "inline_doubt": "...",
    "uncomfortable_truth": "...",
    "earned_insight": "...",
    "voice_signature": "...",
    "first_person_conversational": "..."
  }
}`;

  const r = await openRouter.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    temperature: 0.2,
    max_tokens: 2500,
  });
  const txt = r.choices[0].message.content.trim();
  const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`LLM judge returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ── Combine into 5-category 100-point score ─────────────────────────────────
function combineScore(checks, llm) {
  const got = rule => (checks.find(c => c.rule === rule)?.pass ? 1 : 0);
  const llmS = k => llm.scores?.[k] ?? 0;

  const cat = {
    specificity: { max: 25, score: 0, breakdown: [] },
    ai_tells:    { max: 25, score: 0, breakdown: [] },
    voice:       { max: 20, score: 0, breakdown: [] },
    honesty:     { max: 15, score: 0, breakdown: [] },
    structure:   { max: 15, score: 0, breakdown: [] },
  };

  // SPECIFICITY (25): no_round_% (3) + specific_subject (7) + micro_specifics (5) + sensory_concreteness (5) + stakes_and_consequence (5)
  const sp1 = got("no_round_percentages") * 3;
  const sp2 = llmS("specific_subject") * 0.7;
  const sp3 = llmS("micro_specifics") * 0.5;
  const sp4 = llmS("sensory_concreteness") * 0.5;
  const sp5 = llmS("stakes_and_consequence") * 0.5;
  cat.specificity.score = sp1 + sp2 + sp3 + sp4 + sp5;
  cat.specificity.breakdown = [
    `+${sp1}/3 no round %`,
    `+${sp2.toFixed(1)}/7 LLM specific_subject (${llmS("specific_subject")}/10)`,
    `+${sp3.toFixed(1)}/5 LLM micro_specifics (${llmS("micro_specifics")}/10)`,
    `+${sp4.toFixed(1)}/5 LLM sensory_concreteness (${llmS("sensory_concreteness")}/10)`,
    `+${sp5.toFixed(1)}/5 LLM stakes_and_consequence (${llmS("stakes_and_consequence")}/10)`,
  ];

  // AI_TELLS (25): all heuristic, sum of weights
  const tellRules = [
    ["no_hashtags", 4],
    ["no_em_dashes", 3],
    ["no_en_dashes", 1],
    ["no_smart_quotes", 1],
    ["no_i_keep_seeing", 3],
    ["no_x_isnt_y_its_z", 3],
    ["no_its_not_x_its_y", 2],
    ["no_cliched_opening", 2],
    ["no_heres_the_reveal", 2],
    ["no_engagement_bait", 2],
    ["no_universal_truth_closer", 1],
    ["no_emoji_overuse", 1],
  ];
  for (const [rule, pts] of tellRules) {
    const g = got(rule) * pts;
    cat.ai_tells.score += g;
    cat.ai_tells.breakdown.push(`+${g}/${pts} ${rule}`);
  }

  // VOICE (20): corporate (5) + exclaim (2) + filler (2) + voice_signature (6) + first_person (5)
  const v1 = got("no_corporate_verbs") * 5;
  const v2 = got("no_exclamations") * 2;
  const v3 = got("no_filler_transitions") * 2;
  const v4 = llmS("voice_signature") * 0.6;
  const v5 = llmS("first_person_conversational") * 0.5;
  cat.voice.score = v1 + v2 + v3 + v4 + v5;
  cat.voice.breakdown = [
    `+${v1}/5 no corporate verbs`,
    `+${v2}/2 no exclamations`,
    `+${v3}/2 no filler transitions`,
    `+${v4.toFixed(1)}/6 LLM voice_signature (${llmS("voice_signature")}/10)`,
    `+${v5.toFixed(1)}/5 LLM first_person_conversational (${llmS("first_person_conversational")}/10)`,
  ];

  // HONESTY (15): no_labeled_imperfection (3) + inline_doubt (6) + uncomfortable_truth (6)
  const h1 = got("no_labeled_imperfection") * 3;
  const h2 = llmS("inline_doubt") * 0.6;
  const h3 = llmS("uncomfortable_truth") * 0.6;
  cat.honesty.score = h1 + h2 + h3;
  cat.honesty.breakdown = [
    `+${h1}/3 no labeled imperfection`,
    `+${h2.toFixed(1)}/6 LLM inline_doubt (${llmS("inline_doubt")}/10)`,
    `+${h3.toFixed(1)}/6 LLM uncomfortable_truth (${llmS("uncomfortable_truth")}/10)`,
  ];

  // STRUCTURE (15): word_count (2) + numbered_lessons (2) + tricolon (2) + anaphora (2) + question_stack (1) + ellipsis (1) + bullet_overuse (1) + earned_insight (4)
  const t1 = got("word_count_in_range") * 2;
  const t2 = got("no_numbered_lessons") * 2;
  const t3 = got("no_tricolon_fragments") * 2;
  const t4 = got("no_anaphora_abuse") * 2;
  const t5 = got("no_question_stack_opening") * 1;
  const t6 = got("no_ellipsis_abuse") * 1;
  const t7 = got("no_bullet_overuse") * 1;
  const t8 = llmS("earned_insight") * 0.4;
  cat.structure.score = t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8;
  cat.structure.breakdown = [
    `+${t1}/2 word count in range`,
    `+${t2}/2 no numbered lessons`,
    `+${t3}/2 no tricolon fragments`,
    `+${t4}/2 no anaphora abuse`,
    `+${t5}/1 no question-stack opening`,
    `+${t6}/1 no ellipsis abuse`,
    `+${t7}/1 no bullet overuse`,
    `+${t8.toFixed(1)}/4 LLM earned_insight (${llmS("earned_insight")}/10)`,
  ];

  const total = Object.values(cat).reduce((s, c) => s + c.score, 0);
  return { total, categories: cat };
}

// ── Verdict bands (tightened — old 85/70/55 was too lenient) ────────────────
function verdict(score) {
  if (score >= 90) return "🟢 SHIP — feels human";
  if (score >= 80) return "🟡 POLISH — 1–2 surgical fixes";
  if (score >= 65) return "🟠 WEAK — partial rewrite";
  return "🔴 FAIL — sounds AI, start over";
}

// ── Top-3 rewrite targets (per post) ────────────────────────────────────────
const SEV_ORDER = { high: 0, medium: 1, low: 2 };

function topRewriteTargets(checks, llm) {
  const items = [];

  // Heuristic failures with evidence
  for (const c of checks) {
    if (!c.pass && c.evidence) {
      items.push({
        kind: "heuristic",
        rule: c.rule,
        severity: c.severity,
        weight: c.weight,
        evidence: c.evidence,
        fix: FIX_TEMPLATES[c.rule] || "(no template)",
      });
    }
  }

  // LLM dimensions scoring < 5 — surface as soft targets
  for (const [dim, score] of Object.entries(llm.scores || {})) {
    if (score < 5) {
      items.push({
        kind: "llm",
        rule: dim,
        severity: score <= 2 ? "high" : "medium",
        weight: 5 - score,
        evidence: llm.reasons?.[dim] || "",
        fix: FIX_TEMPLATES[dim] || "(no template)",
        score,
      });
    }
  }

  items.sort((a, b) => {
    const s = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (s !== 0) return s;
    return b.weight - a.weight;
  });

  return items.slice(0, 3);
}

// ── Render markdown report ──────────────────────────────────────────────────
function renderTargets(targets) {
  if (targets.length === 0) return "_(no significant rewrite targets — post is clean)_\n";
  return targets.map((t, i) => {
    const tag = t.kind === "heuristic" ? `❌ **${t.rule}** *(${t.severity})*` : `⚠️ **LLM/${t.rule}** *(${t.score}/10)*`;
    return `${i + 1}. ${tag}\n   - Evidence: "${String(t.evidence).slice(0, 180)}"\n   - Fix: ${t.fix}`;
  }).join("\n");
}

function renderPostReport(label, post, checks, llm, score, targets) {
  let md = `## ${label}\n\n**Score: ${score.total.toFixed(1)} / 100** — ${verdict(score.total)}\n\n`;

  md += `### Category breakdown\n\n`;
  md += `| Category | Score | Max |\n|---|---|---|\n`;
  for (const [name, c] of Object.entries(score.categories)) {
    md += `| ${name} | ${c.score.toFixed(1)} | ${c.max} |\n`;
  }

  md += `\n### Top 3 rewrite targets\n\n${renderTargets(targets)}\n`;

  md += `\n### Heuristic checks (deterministic)\n\n`;
  for (const c of checks) {
    md += `- ${c.pass ? "✅" : "❌"} **${c.rule}** *(${c.severity})* — ${c.detail}\n`;
  }

  md += `\n### LLM judge (subjective, 0–10)\n\n`;
  for (const [k, v] of Object.entries(llm.scores || {})) {
    md += `- **${k}: ${v}/10** — ${llm.reasons?.[k] || "(no reason)"}\n`;
  }

  md += `\n### Score breakdown by category\n\n`;
  for (const [name, c] of Object.entries(score.categories)) {
    md += `**${name}** (${c.score.toFixed(1)}/${c.max})\n`;
    for (const b of c.breakdown) md += `  - ${b}\n`;
  }

  md += `\n### Post text\n\n\`\`\`\n${post}\n\`\`\`\n`;
  return md;
}

// ── Find prior report for delta tracking ────────────────────────────────────
function findPriorReport(dir, currentBasename) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.endsWith(".json") && f !== currentBasename + ".json")
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return { name: files[0], data: JSON.parse(readFileSync(`${dir}/${files[0]}`, "utf8")) };
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function scorePost(label, post) {
  const checks = heuristics(post);
  const llm = await llmJudge(post);
  const score = combineScore(checks, llm);
  const targets = topRewriteTargets(checks, llm);
  return { label, post, checks, llm, score, targets };
}

(async () => {
  const args = process.argv.slice(2);
  const posts = [];

  if (args[0] === "--file" && args[1]) {
    const path = args[1];
    const text = readFileSync(path, "utf8").trim();
    posts.push({ label: `File: ${path}`, text });
  } else if (args.length > 0) {
    posts.push({ label: "Pasted post", text: args.join(" ").trim() });
  } else {
    console.log("Batch mode — regenerating 5 test topics with current local prompt...\n");
    for (let i = 1; i <= 5; i++) {
      try {
        process.stdout.write(`  [${i}/5] generating... `);
        const out = execSync(`node "${PROJECT}/scripts/test-cortex.mjs" ${i}`, {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const m = out.match(/--- POST ---\n([\s\S]*?)\n--- END/);
        const labelM = out.match(/^\d+\..+$/m);
        if (m) {
          posts.push({ label: labelM ? labelM[0] : `Topic ${i}`, text: m[1].trim() });
          console.log("done");
        } else {
          console.log("FAIL (no post in output)");
        }
      } catch (e) {
        console.log(`FAIL: ${e.message.split("\n")[0]}`);
      }
    }
  }

  if (posts.length === 0) {
    console.error("\nNo posts to score.");
    process.exit(1);
  }

  console.log(`\nScoring ${posts.length} post(s) with scorer ${SCORER_VERSION}...\n`);
  const results = [];
  for (const p of posts) {
    process.stdout.write(`  ${p.label.slice(0, 60)}... `);
    try {
      const r = await scorePost(p.label, p.text);
      results.push(r);
      console.log(`${r.score.total.toFixed(1)}/100 (${verdict(r.score.total)})`);
    } catch (e) {
      console.log(`SCORE FAILED: ${e.message}`);
    }
  }

  if (results.length === 0) {
    console.error("All scoring failed.");
    process.exit(1);
  }

  // ── Build report ─────────────────────────────────────────────────────────
  let sha = "unknown";
  try { sha = execSync(`git -C "${PROJECT}" rev-parse --short HEAD`, { encoding: "utf8" }).trim(); } catch {}
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  const avg = results.reduce((s, r) => s + r.score.total, 0) / results.length;

  // Systemic failures (across batch)
  const failCounts = {};
  const failEvidence = {};
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.pass) {
        failCounts[c.rule] = (failCounts[c.rule] || 0) + 1;
        if (c.evidence && !failEvidence[c.rule]) failEvidence[c.rule] = c.evidence;
      }
    }
  }
  const topFails = Object.entries(failCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Systemic LLM weaknesses
  const llmAvgs = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.llm.scores || {})) {
      if (!llmAvgs[k]) llmAvgs[k] = [];
      llmAvgs[k].push(v);
    }
  }
  const llmMeans = Object.entries(llmAvgs).map(([k, vs]) => [k, vs.reduce((s, v) => s + v, 0) / vs.length]);
  const weakDims = llmMeans.filter(([_, m]) => m < 6).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const strongDims = llmMeans.filter(([_, m]) => m >= 7).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const cleanRules = Object.entries(
    results.reduce((acc, r) => {
      for (const c of r.checks) if (c.pass) acc[c.rule] = (acc[c.rule] || 0) + 1;
      return acc;
    }, {})
  ).filter(([_, n]) => n === results.length).map(([rule]) => rule);

  // Prior report delta
  const dir = `${PROJECT}/score-reports`;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const basename = `SCORE_${date}_${time}_${sha}`;
  const prior = findPriorReport(dir, basename);

  let report = `# Cortex Post Quality Report\n\n`;
  report += `- **Date:** ${date}\n`;
  report += `- **Prompt commit:** \`${sha}\`\n`;
  report += `- **Posts scored:** ${results.length}\n`;
  report += `- **Average score:** ${avg.toFixed(1)} / 100 — ${verdict(avg)}\n`;
  report += `- **Scorer version:** ${SCORER_VERSION}\n\n`;

  // Why these posts sound AI
  report += `## Why these posts sound AI (top systemic issues)\n\n`;
  if (topFails.length === 0 && weakDims.length === 0) {
    report += `_(no systemic issues — posts are clean)_\n`;
  } else {
    let i = 1;
    for (const [rule, count] of topFails.slice(0, 3)) {
      const ev = failEvidence[rule];
      report += `${i}. **${rule}** — failed in ${count}/${results.length} post(s)`;
      if (ev) report += ` (example: "${String(ev).slice(0, 100)}")`;
      report += `\n   → ${FIX_TEMPLATES[rule] || "(no template)"}\n`;
      i++;
    }
    for (const [dim, mean] of weakDims.slice(0, Math.max(0, 3 - topFails.slice(0, 3).length))) {
      report += `${i}. **LLM/${dim}** — batch average ${mean.toFixed(1)}/10\n`;
      report += `   → ${FIX_TEMPLATES[dim] || "(no template)"}\n`;
      i++;
    }
  }
  report += `\n`;

  // What's working
  report += `## What's working\n\n`;
  if (cleanRules.length === 0 && strongDims.length === 0) {
    report += `_(nothing systemically strong yet)_\n`;
  } else {
    for (const [dim, mean] of strongDims) {
      report += `- **LLM/${dim}** — batch average ${mean.toFixed(1)}/10\n`;
    }
    if (cleanRules.length > 0) {
      report += `- **Clean across all posts:** ${cleanRules.slice(0, 8).join(", ")}${cleanRules.length > 8 ? `, +${cleanRules.length - 8} more` : ""}\n`;
    }
  }
  report += `\n`;

  // Delta vs prior
  if (prior) {
    const dAvg = avg - (prior.data.average ?? 0);
    const sameScorer = prior.data.scorer_version === SCORER_VERSION;
    report += `## Delta vs previous run\n\n`;
    report += `Previous: \`${prior.name}\` (${prior.data.scorer_version || "v1"}) — avg ${(prior.data.average ?? 0).toFixed(1)}\n\n`;
    report += `- Average: ${(prior.data.average ?? 0).toFixed(1)} → ${avg.toFixed(1)} (${dAvg >= 0 ? "+" : ""}${dAvg.toFixed(1)})\n`;
    if (!sameScorer) report += `- ⚠️ Scorer version changed (${prior.data.scorer_version || "v1"} → ${SCORER_VERSION}) — direct comparison is not apples-to-apples\n`;
    report += `\n`;
  }

  report += `---\n\n`;
  for (const r of results) {
    report += renderPostReport(r.label, r.post, r.checks, r.llm, r.score, r.targets);
    report += `\n---\n\n`;
  }

  const mdPath = `${dir}/${basename}.md`;
  const jsonPath = `${dir}/${basename}.json`;
  writeFileSync(mdPath, report, "utf8");
  writeFileSync(jsonPath, JSON.stringify({
    date,
    sha,
    scorer_version: SCORER_VERSION,
    posts_scored: results.length,
    average: avg,
    top_fails: topFails,
    weak_llm_dims: weakDims,
    strong_llm_dims: strongDims,
    posts: results.map(r => ({
      label: r.label,
      total: r.score.total,
      categories: Object.fromEntries(
        Object.entries(r.score.categories).map(([k, v]) => [k, { score: v.score, max: v.max }])
      ),
      heuristics: r.checks.map(c => ({ rule: c.rule, pass: c.pass, evidence: c.evidence, severity: c.severity })),
      llm_scores: r.llm.scores,
      targets: r.targets,
      post_text: r.post,
    })),
  }, null, 2), "utf8");

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Average: ${avg.toFixed(1)}/100 — ${verdict(avg)}`);
  console.log(`Report:  ${mdPath}`);
  console.log(`JSON:    ${jsonPath}`);
  console.log(`${"=".repeat(60)}\n`);

  console.log(report);
})();
