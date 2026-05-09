// scripts/score-post.mjs
// Hybrid post quality scorer for Cridl Cortex output.
// Scores against the 16 COPYWRITING_RULES from NEEL_RUNTIME.md.
//
// Usage:
//   node scripts/score-post.mjs                  # batch mode: regen 5 topics + score each
//   node scripts/score-post.mjs --file path.txt  # file mode
//   node scripts/score-post.mjs "post text..."   # paste mode (single arg)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import OpenAI from "openai";

// ── Env loading ─────────────────────────────────────────────────────────────
const PROJECT = "c:/Users/USER/Desktop/Anti Gravity/LInkedin automation";
const envFile = readFileSync(`${PROJECT}/.env.local`, "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing in .env.local");

const openRouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: { "HTTP-Referer": "https://test.local", "X-Title": "Cortex scorer" },
});
const JUDGE_MODEL = "google/gemini-2.5-flash";

// ── Heuristic checks (deterministic) ────────────────────────────────────────
function heuristics(post) {
  const checks = [];
  const para = post.trim().split(/\n\s*\n/);
  const lastPara = para[para.length - 1] || "";
  const lastTwoParas = para.slice(-2).join("\n");

  // 1. Round percentages (likely fabricated)
  const allPercents = post.match(/\b\d{1,3}%/g) || [];
  const roundFakes = allPercents.filter(s => {
    const n = parseInt(s);
    return n > 0 && n < 100 && n % 5 === 0;
  });
  checks.push({
    rule: "no_round_percentages",
    category: "specificity",
    pass: roundFakes.length === 0,
    detail: roundFakes.length ? `Suspicious round %: ${roundFakes.join(", ")}` : "No round percentages",
    severity: "high",
  });

  // 2. Hashtags (must be zero)
  const hashtags = post.match(/(^|\s)#[A-Za-z][A-Za-z0-9_]+/g) || [];
  checks.push({
    rule: "no_hashtags",
    category: "ai_tells",
    pass: hashtags.length === 0,
    detail: hashtags.length ? `${hashtags.length} hashtag(s): ${hashtags.map(h => h.trim()).join(", ")}` : "Zero hashtags",
    severity: "high",
  });

  // 3. "I keep seeing" crutch
  const crutch = post.match(/I keep (seeing|noticing|hearing)|I've been (seeing|noticing|watching)/i);
  checks.push({
    rule: "no_i_keep_seeing",
    category: "ai_tells",
    pass: !crutch,
    detail: crutch ? `Crutch phrase: "${crutch[0]}"` : "No 'I keep seeing' crutch",
    severity: "high",
  });

  // 4. "X isn't Y. It's Z." reveal pattern (banned anywhere)
  // Matches: "<negation phrase>. <It's/That's/It was> <positive phrase>"
  const isntItsRe = /\b(isn't|is not|wasn't|was not|aren't|are not|won't be|never (?:was|will be))[^.!?\n]{1,60}[.!?]\s+(It's|That's|It was|That was|It is|This is)\s+[^.!?\n]{1,80}[.!?]/g;
  const isntItsMatches = post.match(isntItsRe) || [];
  checks.push({
    rule: "no_x_isnt_y_its_z",
    category: "ai_tells",
    pass: isntItsMatches.length === 0,
    detail: isntItsMatches.length
      ? `${isntItsMatches.length} "X isn't Y. It's Z." pattern(s). First: "${isntItsMatches[0].slice(0, 100)}${isntItsMatches[0].length > 100 ? "..." : ""}"`
      : "Pattern absent",
    severity: "high",
  });

  // 5. Em dashes (zero — hard ban)
  const emDashes = (post.match(/—/g) || []).length;
  checks.push({
    rule: "zero_em_dashes",
    category: "structure",
    pass: emDashes === 0,
    detail: emDashes ? `${emDashes} em dash(es) (must be 0)` : "Zero em dashes",
    severity: "high",
  });

  // 6. No exclamation marks
  const exclaims = (post.match(/!/g) || []).length;
  checks.push({
    rule: "no_exclamations",
    category: "voice",
    pass: exclaims === 0,
    detail: exclaims ? `${exclaims} exclamation mark(s)` : "No exclamations",
    severity: "low",
  });

  // 7. Banned corporate verbs
  const corpRe = /\b(leverage|leveraging|leveraged|leverages|unlock(?:ing|ed|s)?|drive growth|driving growth|scale (?:our|the|your)|scaling (?:our|the|your)|optimize|optimizing|optimized|optimizes|transform(?:ing|ed|s)?|empower(?:ing|ed|s)?|enable(?:s|d|ing) (?:our|the|teams|users|customers)|streamline(?:s|d|ing)?|harness(?:ing|ed|es)?|accelerate(?:s|d|ing)?)\b/gi;
  const corpMatches = post.match(corpRe) || [];
  checks.push({
    rule: "no_corporate_verbs",
    category: "voice",
    pass: corpMatches.length === 0,
    detail: corpMatches.length ? `Corporate verbs: ${[...new Set(corpMatches.map(m => m.toLowerCase()))].join(", ")}` : "Plain verbs only",
    severity: "medium",
  });

  // 8. Cliché openings
  const cliche = post.match(/^(In today's|In a world|In the ever-evolving|Excited to announce|I wanted to share|I'm thrilled)/i);
  checks.push({
    rule: "no_cliched_opening",
    category: "ai_tells",
    pass: !cliche,
    detail: cliche ? `Cliché opening: "${cliche[0]}..."` : "Fresh opening",
    severity: "high",
  });

  // 9. Engagement-bait closer (only check last paragraph)
  const baitRe = /\b(thoughts\?|what do you think\?|have you seen this\?|drop your take|comment yes|let me know in the comments|drop a 🔥)\b/i;
  const baitMatch = lastPara.match(baitRe);
  checks.push({
    rule: "no_engagement_bait",
    category: "ai_tells",
    pass: !baitMatch,
    detail: baitMatch ? `Engagement bait closer: "${baitMatch[0]}"` : "No engagement bait",
    severity: "high",
  });

  // 10. Filler transitions
  const fillerRe = /\b(Furthermore|Moreover|Additionally|That being said|On the other hand)[,\s]/g;
  const fillerMatches = post.match(fillerRe) || [];
  checks.push({
    rule: "no_filler_transitions",
    category: "voice",
    pass: fillerMatches.length === 0,
    detail: fillerMatches.length ? `Filler transitions: ${[...new Set(fillerMatches.map(f => f.trim().replace(/,$/, "")))].join(", ")}` : "No filler transitions",
    severity: "low",
  });

  // 11. Numbered lessons / takeaways at end
  const lessonsRe = /(\b\d+\s+(lessons|things I learned|takeaways|key insights)\b|Here are the (lessons|takeaways|key insights))/i;
  const lessonMatch = lastTwoParas.match(lessonsRe);
  checks.push({
    rule: "no_numbered_lessons",
    category: "structure",
    pass: !lessonMatch,
    detail: lessonMatch ? `Numbered-lessons template: "${lessonMatch[0]}"` : "No template lesson numbering",
    severity: "medium",
  });

  // 12. Labeled IMPERFECTION ("I'm still figuring out X" as standalone line)
  const labeledRe = /^(I'm still (figuring out|working through|trying to)|I don't have (it figured|all the answers))/m;
  const labeledMatch = post.match(labeledRe);
  checks.push({
    rule: "no_labeled_imperfection",
    category: "honesty",
    pass: !labeledMatch,
    detail: labeledMatch ? `Labeled doubt: "${labeledMatch[0]}..."` : "No checkbox imperfection",
    severity: "medium",
  });

  // 13. Fake-pivot tells
  const pivotRe = /(Here's what's actually happening|Here's what I think is actually|Here's the thing[,:])/i;
  const pivotMatch = post.match(pivotRe);
  checks.push({
    rule: "no_fake_pivot",
    category: "ai_tells",
    pass: !pivotMatch,
    detail: pivotMatch ? `Fake-pivot tell: "${pivotMatch[0]}"` : "No fake pivots",
    severity: "low",
  });

  // 14. Word count reasonable (60–500 — outside this likely length-spec violation)
  const wordCount = post.trim().split(/\s+/).filter(Boolean).length;
  checks.push({
    rule: "word_count_in_range",
    category: "structure",
    pass: wordCount >= 60 && wordCount <= 500,
    detail: `${wordCount} word(s)`,
    severity: "low",
  });

  // 15. Tricolons of fragments (3 short fragments in a row)
  // Detect: 3 consecutive sentences each <= 5 words
  const sentences = post.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  let maxRun = 0, run = 0;
  for (const s of sentences) {
    const wc = s.split(/\s+/).length;
    if (wc <= 5) { run++; maxRun = Math.max(maxRun, run); } else { run = 0; }
  }
  checks.push({
    rule: "no_tricolon_fragments",
    category: "structure",
    pass: maxRun < 3,
    detail: maxRun >= 3 ? `${maxRun} consecutive ≤5-word sentences (tricolon)` : `Max consecutive fragments: ${maxRun}`,
    severity: "low",
  });

  return checks;
}

// ── LLM judge (subjective) ──────────────────────────────────────────────────
async function llmJudge(post) {
  const sys = `You are a discerning critic of LinkedIn posts. You grade on subjective qualities that distinguish human writing from AI ghostwriter output. Return ONLY valid JSON, no markdown.`;
  const user = `Score this LinkedIn post on 6 SUBJECTIVE qualities. For each, return a 0-10 integer score and a 1-sentence reason that quotes a specific phrase from the post.

POST:
"""
${post}
"""

Score these 6 dimensions (0 = absent/bad, 10 = excellent):

1. specific_subject — Is there a SPECIFIC anonymized subject with concrete attributes (size, role, $, time)? Plural abstractions ("founders", "marketers", "teams") = 0–3. Named anonymized with one attribute ("a founder I worked with") = 5–6. Multiple concrete attributes ("a Series A fintech founder, 23 people, just lost her CTO") = 9–10.

2. inline_doubt — Is there woven hedging that reads as honest, NOT a labeled "I'm still figuring out X" line? 10 = woven naturally inside other sentences; 5 = doubt present but slightly stamped; 0 = polished authority with no admission of limit.

3. uncomfortable_truth — Is there one truth most readers won't admit out loud? 10 = sharp, specific, makes the reader wince a little; 5 = generic ("we all do this"); 0 = none — only safe observations.

4. asymmetric_structure — Are paragraphs varied in length, avoiding identical 2-sentence rhythm and tricolons of fragments? 10 = clearly varied; 5 = some variation; 0 = uniform/template.

5. first_person_conversational — Does "I"/"we" appear as someone talking to a peer, NOT as a broadcaster ("Founders should..." / "Organizations must...")? 10 = consistently conversational; 0 = declarative/announcement-style.

6. plain_verbs — Are verbs plain (use, find, push, build, ship, try, break) NOT corporate (leverage, drive, unlock, optimize, transform, empower)? 10 = all plain; 0 = corporate verb soup.

Return ONLY this JSON shape (no markdown, no commentary):
{
  "scores": {
    "specific_subject": <int 0-10>,
    "inline_doubt": <int 0-10>,
    "uncomfortable_truth": <int 0-10>,
    "asymmetric_structure": <int 0-10>,
    "first_person_conversational": <int 0-10>,
    "plain_verbs": <int 0-10>
  },
  "reasons": {
    "specific_subject": "<quote phrase> — 1-sentence reason",
    "inline_doubt": "...",
    "uncomfortable_truth": "...",
    "asymmetric_structure": "...",
    "first_person_conversational": "...",
    "plain_verbs": "..."
  }
}`;

  const r = await openRouter.chat.completions.create({
    model: JUDGE_MODEL,
    messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    temperature: 0.2,
    max_tokens: 1500,
  });
  const txt = r.choices[0].message.content.trim();
  const cleaned = txt.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // fallback: try to extract first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error(`LLM judge returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

// ── Combine into 5-category 100-point score ─────────────────────────────────
function combineScore(checks, llm) {
  const get = rule => checks.find(c => c.rule === rule)?.pass ? 1 : 0;
  const llmS = k => llm.scores[k] ?? 0;

  const cat = {
    specificity: { max: 20, score: 0, breakdown: [] },
    voice:       { max: 20, score: 0, breakdown: [] },
    structure:   { max: 20, score: 0, breakdown: [] },
    honesty:     { max: 20, score: 0, breakdown: [] },
    ai_tells:    { max: 20, score: 0, breakdown: [] },
  };

  // SPECIFICITY (20): no_round_% (5) + LLM specific_subject (15)
  const s1 = get("no_round_percentages") * 5;
  const s2 = llmS("specific_subject") * 1.5;
  cat.specificity.score = s1 + s2;
  cat.specificity.breakdown = [`+${s1}/5 no round percentages`, `+${s2.toFixed(1)}/15 LLM specific_subject`];

  // VOICE (20): corp_verbs (5) + exclamations (3) + filler (2) + LLM plain_verbs (5) + first_person (5)
  const v1 = get("no_corporate_verbs") * 5;
  const v2 = get("no_exclamations") * 3;
  const v3 = get("no_filler_transitions") * 2;
  const v4 = llmS("plain_verbs") * 0.5;
  const v5 = llmS("first_person_conversational") * 0.5;
  cat.voice.score = v1 + v2 + v3 + v4 + v5;
  cat.voice.breakdown = [
    `+${v1}/5 no corporate verbs`,
    `+${v2}/3 no exclamations`,
    `+${v3}/2 no filler transitions`,
    `+${v4.toFixed(1)}/5 LLM plain_verbs`,
    `+${v5.toFixed(1)}/5 LLM first_person_conversational`,
  ];

  // STRUCTURE (20): word count (3) + em dashes 0 (3) + numbered lessons (2) + tricolons (2) + LLM asymmetric (10)
  const t1 = get("word_count_in_range") * 3;
  const t2 = get("zero_em_dashes") * 3;
  const t3 = get("no_numbered_lessons") * 2;
  const t4 = get("no_tricolon_fragments") * 2;
  const t5 = llmS("asymmetric_structure") * 1;
  cat.structure.score = t1 + t2 + t3 + t4 + t5;
  cat.structure.breakdown = [
    `+${t1}/3 word count in range`,
    `+${t2}/3 zero em dashes`,
    `+${t3}/2 no numbered lessons`,
    `+${t4}/2 no tricolon fragments`,
    `+${t5.toFixed(1)}/10 LLM asymmetric_structure`,
  ];

  // HONESTY (20): no_labeled_imperfection (5) + LLM inline_doubt (7.5) + uncomfortable_truth (7.5)
  const h1 = get("no_labeled_imperfection") * 5;
  const h2 = llmS("inline_doubt") * 0.75;
  const h3 = llmS("uncomfortable_truth") * 0.75;
  cat.honesty.score = h1 + h2 + h3;
  cat.honesty.breakdown = [
    `+${h1}/5 no labeled imperfection`,
    `+${h2.toFixed(1)}/7.5 LLM inline_doubt`,
    `+${h3.toFixed(1)}/7.5 LLM uncomfortable_truth`,
  ];

  // AI TELLS (20): hashtags (4) + I keep seeing (4) + X isn't Y. It's Z. (4) + cliché opening (3) + bait closer (3) + fake pivot (2)
  const tellChecks = [
    ["no_hashtags", 4],
    ["no_i_keep_seeing", 4],
    ["no_x_isnt_y_its_z", 4],
    ["no_cliched_opening", 3],
    ["no_engagement_bait", 3],
    ["no_fake_pivot", 2],
  ];
  for (const [rule, pts] of tellChecks) {
    const got = get(rule) * pts;
    cat.ai_tells.score += got;
    cat.ai_tells.breakdown.push(`+${got}/${pts} ${rule}`);
  }

  const total = Object.values(cat).reduce((s, c) => s + c.score, 0);
  return { total, categories: cat };
}

// ── Render markdown report ──────────────────────────────────────────────────
function verdict(score) {
  if (score >= 85) return "🟢 PUBLISH-READY";
  if (score >= 70) return "🟡 NEEDS POLISH";
  if (score >= 55) return "🟠 WEAK — REWRITE";
  return "🔴 FAIL — START OVER";
}

function renderPostReport(label, post, checks, llm, score) {
  let md = `## ${label}\n\n**Score: ${score.total.toFixed(1)} / 100** — ${verdict(score.total)}\n\n`;

  md += `### Category breakdown\n\n`;
  md += `| Category | Score | Max |\n|---|---|---|\n`;
  for (const [name, c] of Object.entries(score.categories)) {
    md += `| ${name} | ${c.score.toFixed(1)} | ${c.max} |\n`;
  }

  md += `\n### Heuristic checks (deterministic)\n\n`;
  for (const c of checks) {
    md += `- ${c.pass ? "✅" : "❌"} **${c.rule}** *(${c.severity})* — ${c.detail}\n`;
  }

  md += `\n### LLM judge (subjective, 0–10 each)\n\n`;
  for (const [k, v] of Object.entries(llm.scores)) {
    md += `- **${k}: ${v}/10** — ${llm.reasons?.[k] || "(no reason)"}\n`;
  }

  md += `\n### Top fixes for prompt iteration\n\n`;
  const fails = checks.filter(c => !c.pass).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  });
  if (fails.length === 0 && Object.values(llm.scores).every(v => v >= 7)) {
    md += `- (no significant failures)\n`;
  } else {
    fails.slice(0, 5).forEach(f => md += `- ❌ **${f.rule}** *(${f.severity})* — ${f.detail}\n`);
    Object.entries(llm.scores)
      .filter(([_, v]) => v < 7)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .forEach(([k, v]) => md += `- ⚠️ **LLM/${k}** (${v}/10) — ${llm.reasons?.[k] || ""}\n`);
  }

  md += `\n### Post text\n\n\`\`\`\n${post}\n\`\`\`\n`;
  return md;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function scorePost(label, post) {
  const checks = heuristics(post);
  const llm = await llmJudge(post);
  const score = combineScore(checks, llm);
  return { label, post, checks, llm, score };
}

(async () => {
  const args = process.argv.slice(2);
  let posts = [];

  if (args[0] === "--file" && args[1]) {
    const path = args[1];
    const text = readFileSync(path, "utf8").trim();
    posts.push({ label: `File: ${path}`, text });
  } else if (args.length > 0) {
    posts.push({ label: "Pasted post", text: args.join(" ").trim() });
  } else {
    // Batch mode: regen 5 topics fresh using current local prompt
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

  console.log(`\nScoring ${posts.length} post(s)...\n`);
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

  // ── Build full markdown report ──────────────────────────────────────────
  let sha = "unknown";
  try {
    sha = execSync(`git -C "${PROJECT}" rev-parse --short HEAD`, { encoding: "utf8" }).trim();
  } catch {}
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  const avg = results.reduce((s, r) => s + r.score.total, 0) / results.length;

  // Top failure modes across all posts
  const allFails = {};
  for (const r of results) {
    for (const c of r.checks) {
      if (!c.pass) allFails[c.rule] = (allFails[c.rule] || 0) + 1;
    }
  }
  const topFails = Object.entries(allFails).sort((a, b) => b[1] - a[1]).slice(0, 5);

  let report = `# Cortex Post Quality Report\n\n`;
  report += `- **Date:** ${date}\n`;
  report += `- **Prompt commit:** \`${sha}\`\n`;
  report += `- **Posts scored:** ${results.length}\n`;
  report += `- **Average score:** ${avg.toFixed(1)} / 100 — ${verdict(avg)}\n`;
  if (topFails.length > 0) {
    report += `- **Top failure modes:**\n`;
    for (const [rule, count] of topFails) {
      report += `  - ${rule}: failed in ${count}/${results.length} post(s)\n`;
    }
  }
  report += `\n---\n\n`;

  for (const r of results) {
    report += renderPostReport(r.label, r.post, r.checks, r.llm, r.score);
    report += `\n---\n\n`;
  }

  const dir = `${PROJECT}/score-reports`;
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = `${dir}/SCORE_${date}_${time}_${sha}.md`;
  writeFileSync(filename, report, "utf8");

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Average: ${avg.toFixed(1)}/100 — ${verdict(avg)}`);
  console.log(`Report: ${filename}`);
  console.log(`${"=".repeat(60)}\n`);

  // Print to stdout for the slash command to pick up
  console.log(report);
})();
