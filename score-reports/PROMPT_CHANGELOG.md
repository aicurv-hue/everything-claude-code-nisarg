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
