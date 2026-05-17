# PROMPT_CHANGELOG — Cortex prompt-iteration log

> **READ THIS BEFORE EDITING `NEEL_RUNTIME.md` OR `src/lib/ai/neel-prompt-sections.ts`.**
>
> Every rule in the prompt was added to fix a specific failure observed in real output. If you remove or soften a rule without checking why it was added, the failure mode comes back. Each entry below names the failure, the fix, and **why you should not revert it**.
>
> Workflow:
> 1. Run `/score-post` → see failure modes in `score-reports/SCORE_<date>_<sha>.md`
> 2. Read this file end-to-end before editing the prompt
> 3. Edit the prompt
> 4. Run `/score-post` again to confirm score improves
> 5. **Append a new entry to this file** with: what changed, why, what NOT to revert
> 6. Commit + `bash push-all.sh`
>
> **Append-only.** Never delete or rewrite past entries — they are the institutional memory. If a rule turns out to be wrong, add a new entry explaining the reversal and why; don't silently delete the old one.

---

## Entry template (copy this when adding a new entry)

```
## YYYY-MM-DD — <commit-sha> — <one-line title>

**Score before → after:** <e.g. 78.9 → 85.3>
**Triggered by:** <rule that failed in N/M posts, or "user feedback: ...">

**What changed:**
- `<file path>` — <one-line summary of edit>
- `<file path>` — <one-line summary of edit>

**Why:** <2-4 sentences. Name the failure mode, name the root cause.>

**Do NOT revert because:** <The specific anti-pattern this prevents. State it concretely so a future AI editor can judge whether their proposed change would re-introduce it.>

**Known tradeoffs / open questions:** <e.g. "may make promo posts sound too clipped" or "none observed yet">
```

---

## 2026-05-09 — `09b7c7b` — Zero em-dash ban + date-context injection + X-isn't-Y ban promoted

**Score before → after:** 85.3 → (next run will measure)
**Triggered by:** (1) user feedback — "em dashes (—) are an AI fingerprint, my keyboard hyphen is shorter so any em dash betrays AI"; (2) `no_x_isnt_y_its_z` failed in 2/5 posts despite already being banned (rule 5, buried in 16-rule list); (3) user-reported bug — generated post said "the major shift in 2024 in AI" because model defaulted to its training-cutoff year with no date passed in.

**What changed:**
- `NEEL_RUNTIME.md` OUTPUT_RULES — added `ZERO EM DASHES` line at the top of the non-negotiable section, with explicit fallbacks (commas/periods/colons/parens) and "count before output" instruction
- `NEEL_RUNTIME.md` AVOID list — tightened bullet from "Em dashes (—). Max 2 per post." to "ZERO per post. Hard ban."
- `src/lib/ai/neel-prompt-sections.ts` — mirrored both changes (this is the runtime source of truth; `NEEL_RUNTIME.md` is the human-readable copy)
- `scripts/score-post.mjs` — heuristic renamed `max_two_em_dashes` → `zero_em_dashes`; threshold `<=2` → `===0`; severity `low` → `high` so violations actually move the score
- `src/lib/ai/currentContext.ts` (new) — `getCurrentDateContext()` returns a CURRENT CONTEXT block with weekday, full date, UTC time, and year, plus instruction to anchor temporal claims to it
- `withDateContext(messages)` helper — prepends date block as a system message (or merges into existing system message). Wired into all 13 LLM call sites: `generate.ts` (writer × 5), `research.ts` (research + angle engine), `voice-dna.ts`, `rewriteInVoice.ts`, `memory-extract.ts`, `idea-generate.ts`, `posts/score`, `onboarding/extract-profile`, `ai/research/route.ts` (edge × 2), `campaigns/[id]/generate`, `ai/best-time`, `ai/profile-enhance`, `profiles/style-dna`

**Why:**
- *Em dash:* the prior "max 2" rule was too soft. Score reports showed 3/4 posts violating it on the previous baseline. Em dashes are the single most reliable AI tell — keeping any allowance lets the model pattern-fill them. Hard zero with explicit alternatives forces real sentence restructuring.
- *Date injection:* a model doesn't know the wall-clock date unless told. Default behavior is to anchor "current/now/recent" to its training cutoff, which produced posts referring to "the shift in 2024" when shipped in 2026. Injecting a CURRENT CONTEXT system message at every call site fixes this at the message-construction layer rather than relying on the prompt to ask.

**Do NOT revert because:**
- *Em dash:* if you soften "ZERO" back to "max 2" or "minimize," the model treats it as soft guidance and emits 3–5 per post. The character is a strong attractor in trained behavior — only hard zero holds.
- *Date injection:* removing `withDateContext()` from any call site brings back the "2024" bug for that agent. Even if the prompt mentions a year, the model trusts its own internal sense of "current" over inline year mentions unless the date is in a system message phrased as authoritative context.
- *X-isn't-Y reveal:* if you remove or merge rule 5 back into a generic "avoid clichés" line, this pattern reappears immediately because it's an extremely strong attractor in LinkedIn-trained models.

**Known tradeoffs:**
- Date context adds ~80 tokens per call (~$0.0001 per generation at Gemini Flash rates) — negligible.
- Em-dash ban means the model uses more periods, occasionally producing slightly choppier rhythm. Accept this — choppy human is better than smooth AI.

---

## 2026-05-09 — `a75a2f3` — Human-feel pass: 16-rule COPYWRITING_RULES rewrite, em-dash cap, expanded AVOID

**Score before → after:** unmeasured baseline → 85.3 (with `/score-post` introduced same day)
**Triggered by:** Audit of 5 fresh test outputs that all read as AI-slop despite the prior thinking-first architecture (Angle Engine + Style DNA + Hook Diversity, commit `a495968`). Root causes found: (1) fabricated stats in every post (40%, 60–70%, 75%, 68%, 42% — all invented); (2) "I keep seeing" became universal opener crutch; (3) tacked-on standalone IMPERFECTION line ("I'm still figuring out X"); (4) "X isn't Y. It's Z." reveal closer in every post; (5) trailing hashtags; (6) identical skeleton across all 5 posts; (7) plural abstractions ("founders," "marketers," "teams") instead of specific anonymized subjects.

**What changed:**
- `NEEL_RUNTIME.md` COPYWRITING_RULES — rewrote the rule list into 16 numbered rules covering specificity, stat integrity, banned phrases, inline doubt, rotated CTAs, plain verbs, fragment limits, asymmetric structure, one uncomfortable truth per post
- `NEEL_RUNTIME.md` AVOID — expanded with em-dashes (max 2), corporate verbs, filler transitions, round percentages, tricolons of fragments, fake-pivot tells, numbered lessons
- `NEEL_RUNTIME.md` STRUCTURE — CTA section rewritten to mandate rotation across 5 closer types
- `NEEL_RUNTIME.md` SEGMENT_INDIVIDUAL — removed "I keep seeing..." as the safe-anchor fallback; replaced with "specific recent moment" requirement
- `src/lib/ai/neel-prompt-sections.ts` — mirrored to runtime source of truth

**Why:**
Posts had passed previous internal review but failed the human-feel test in every dimension that matters for LinkedIn dwell time. The 16-rule structure replaces a vague "be human" instruction with deterministic, observable rules that map directly to scorer heuristics.

**Do NOT revert because:**
- *Stat integrity ban:* without it, the model invents plausible-looking percentages every time. Even a soft "be careful with stats" gets ignored. Hard ban with "ZERO numbers if research has none" is the only thing that holds.
- *"I keep seeing" ban:* this phrase is a learned crutch from LinkedIn training data. Removing it from the safe-anchor fallback list was the only way to stop it appearing in every post.
- *Plural abstraction ban (founders/marketers/teams):* the single biggest specificity failure mode. The "ONE anonymized subject with ≥1 concrete attribute" rule is what prevents posts from sounding like generic LinkedIn thought-leadership.
- *Default-question CTA ban:* "What do you think?" / "Thoughts?" was appearing as the close on every post. Mandating rotation across 5 types is the fix.
- *Tricolon-of-fragments:* "Less diversity. Slower innovation. Weaker teams." reads as AI even when the content is fine. The cap is necessary.

**Known tradeoffs:**
- 16 rules is a long list — model attention can drift on later rules. This is why the next iteration (`09b7c7b`) promoted the most-violated rule (em dash) up to OUTPUT_RULES. Future iterations should consider promoting other repeatedly-failing rules to that high-priority section.
- Mandating one anonymized specific subject per post can feel forced when the user's topic is genuinely abstract. Acceptable tradeoff — better forced specificity than safe abstraction.

---

## 2026-05-17 — `67059eb` — Deterministic AI-tell post-pass + voice-rewrite Stage 1.5 restored

**Score before → after:** TBD (will measure after deploy)
**Triggered by:** User reported a back-office-automation post that violated 4 hard-banned rules already in the prompt: 4 em dashes, banned "X isn't Y. It's Z." pattern, plural abstractions ("manufacturers", "plant operators"), and a fabricated round percentage ("30-40%"). Existing rule layer did not enforce — model knew the rules and ignored them.

**What changed:**
- `src/lib/ai/generate.ts` — `sanitizePost()` gains a deterministic AI-tell pass after the existing preamble-strip: em-dash (—) and en-dash (–) → comma, unicode ellipsis → ASCII three dots, curly quotes → straight, markdown asterisks stripped, trailing hashtag blocks removed, comma whitespace tightened, 3+ blank lines collapsed.
- `src/lib/ai/generate.ts` — voice-rewrite Stage 1.5 restored (removed 2026-05-09 for latency). Runs after the main draft when `clientProfile` or `writingSamples` are present, 12s timeout, silently falls back to the draft. The rewrite output runs through `sanitizePost()` again because the rewrite model can re-introduce em-dashes.
- `NEEL_RUNTIME.md` + `src/lib/ai/neel-prompt-sections.ts` — `REWRITE_IN_VOICE_PROMPT` strengthened: explicit ZERO em dash rule, X-isn't-Y ban, plural-abstraction warning, expanded jargon list (added unlock/transform/empower/streamline), no trailing hashtags, no fabricated stats, first-person mandate.

**Why:**
Two complementary failure modes were compounding. (1) The prompt had all the right rules but the model violated them anyway — em dashes in particular slip through every single time despite a hard ZERO ban in OUTPUT_RULES. A deterministic post-pass kills this at the layer below model attention, with zero token cost. (2) The 2026-05-07 voice-rewrite Stage 1.5 was doing more of the heavy lifting than the latency-removal entry on 2026-05-09 acknowledged. The "superseded by voice signals already in the main prompt" claim was wrong in practice — the main prompt's voice signals exist but they share attention with 14 other concerns. A dedicated rewrite pass with a single job restores voice and strips slop far more reliably than rules in the main prompt ever do. The original removal rationale (10s of added wall time) was also obsolete by then: the 2026-05-11 streaming-keepalive fix had already lifted the Vercel 25s gateway limit, so adding 10s back is invisible to the user.

**Do NOT revert because:**
- *Em-dash deterministic strip:* the model has been instructed not to use em dashes since 2026-05-09. It still produces them in roughly half of outputs. Prompt-level rules are necessary but insufficient. The deterministic pass is the only thing that guarantees zero em dashes in shipped posts.
- *Voice-rewrite Stage 1.5:* removed once on a latency argument that no longer applies. If a future editor wants to remove it for latency again, check whether the keepalive ping at `/api/ai/generate/route.ts` is still in place — if it is, latency is not a user-visible concern.
- *Strengthened REWRITE_IN_VOICE_PROMPT:* the prior version of this prompt did not ban em dashes or plural abstractions, so the rewrite pass would actively reintroduce them. Without these bans, Stage 1.5 fights against the deterministic pass and Stage 1.

**Known tradeoffs / open questions:**
- Em-dash → comma substitution can produce slightly awkward sentences where the em-dash was being used legitimately for a parenthetical aside. The deterministic pass picks comma over period because comma is the safer default; a future iteration could be smarter (e.g. period when both sides are full clauses).
- Voice-rewrite adds ~6–10s. Invisible to the user thanks to streaming keepalive, but counts against the model token budget twice. Acceptable: post quality is the product.
- Stage 1.5 only runs when voice signal exists. Users with no profile + no samples get the raw draft (still post-passed). Acceptable: those users have no voice fingerprint anyway.

---

## 2026-05-17 — `851c674` — Sensory concreteness, inline doubt escalation, anaphora cap

**Score before → after:** 74.7 → TBD (will measure after next /score-post)
**Triggered by:** `SCORE_2026-05-17_155900_851c674.json` — batch-wide LLM-judge failures across all 3 posts: `sensory_concreteness` avg 2.0/10 (2, 3, 1), `inline_doubt` avg 3.0/10 (3, 6, 0), `specific_subject` avg 3.67/10. Heuristic `no_anaphora_abuse` failed 1/3 on the Cridl Cortex promo post (`Same hook structure. Same closer. Same filler transitions.`) — three sentences in a row starting with "Same".

**What changed:**
- `NEEL_RUNTIME.md` COPYWRITING_RULES rule 7 — appended a "scan before output" check requiring at least one woven hedge in the body, with examples and a one-line rationale that authority-only posts read as AI
- `NEEL_RUNTIME.md` COPYWRITING_RULES rule 12 — renamed "FRAGMENTS WORK" to "FRAGMENTS AND REPEATED OPENERS"; added an anaphora cap (no 3+ consecutive sentences starting with the same word) with the exact failing pattern as a ❌ example
- `NEEL_RUNTIME.md` COPYWRITING_RULES — added new rule 17 SENSORY/SCENE CONCRETENESS requiring at least one filmable moment (sound, time of day, what was on screen, who said what) in the body, with ✅/❌ examples and a scan-before-output check
- `src/lib/ai/neel-prompt-sections.ts` COPYWRITING_RULES — mirrored all three edits verbatim

**Why:**
The model is currently scoring 8/10 on `uncomfortable_truth` and `first_person_conversational` but 2/10 on `sensory_concreteness` — it knows *what* it thinks but defaults to abstraction when describing the moment. The evidence spans across all three posts confirm this: "a crowded inbox", "everyone in our planning calls nodded along enthusiastically", "every post gets flattened into the same rhythm" — all describe *that* something is happening without ever filming it. No existing rule explicitly required scene-level concreteness, only subject-level (rule 1). Rule 17 fills the gap.

Inline doubt (rule 7) was already present but consistently scoring 3.0 across the batch, with the Cridl Cortex post hitting 0/10. The rule existed but had no enforcement check — the model would read it as guidance and ignore it. Adding the same "scan before output" pattern that already works for em-dashes (per `09b7c7b`) gives the rule a concrete trigger condition the model can act on at draft-time.

The anaphora cap on rule 12 is a free win: the scorer's deterministic heuristic catches the pattern, but the prompt never explicitly forbade it (rule 12 only banned tricolons of fragments, not anaphora at sentence-start). One line addition closes the gap.

**Do NOT revert because:**
- *Sensory concreteness (rule 17):* without it, the model satisfies rule 1 (specific subject) but never paints a scene — posts read as "expert observing an industry" rather than "person who was in the room." Re-removing collapses sensory_concreteness back to 1-2/10 immediately because the model has no other instruction pulling it toward filmable detail.
- *Rule 7 scan-check:* the previous version of rule 7 had the examples and the ban-on-labeled-doubt clause but no trigger condition. Without an explicit "scan before output: weave one in if zero hedges" check, the model treats inline doubt as optional decoration and skips it on posts where it would be most needed (promo and authoritative-claim posts). The 0/10 on the Cridl Cortex promo is the proof — that post has the strongest claims and the highest authority tone, which is exactly when inline doubt matters most.
- *Rule 12 anaphora cap:* a stylistic AI tell that the scorer catches but the prompt previously didn't name. If removed, the model returns to "Same X. Same Y. Same Z." trios because that rhythm is heavily reinforced in LinkedIn training data.

**Known tradeoffs / open questions:**
- Rule 17 may push short promo posts (~150 words) toward feeling slower if the model over-applies the "filmable scene" requirement. Mitigation: the rule explicitly exempts hook and CTA, and asks for ONE filmable moment in the body, not all moments. Watch the next /score-post for `voice_signature` or `word_count_in_range` regressions.
- Rule 7's scan-check may push some posts toward over-hedging (defensive writing that reads as weak). Watch `uncomfortable_truth` and `voice_signature` scores — if either drops by 2+ points next run, soften the rule to "at least one hedge" rather than implying multiple.
- `specific_subject` (batch avg 3.67) was NOT addressed this iteration — rule 1 already covers it explicitly, so the failure is either (a) attention-budget exhaustion or (b) the rule needs promotion to OUTPUT_RULES. Defer to next iteration; if the next /score-post still shows 3.67 with this round's edits in place, promote rule 1 to OUTPUT_RULES.
- `no_x_isnt_y_its_z` (1/3, high severity) NOT addressed — already in OUTPUT_RULES with a scan check. If it recurs at 2+/3 next run, the next escalation is a deterministic post-pass in `src/lib/ai/generate.ts` `sanitizePost()`, paralleling the em-dash treatment from `67059eb`.

---
