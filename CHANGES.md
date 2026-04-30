# Changes

2026-04-26 — Merged 5 agents into 2 (Builder, Strategist).
2026-04-26 — Renamed `Master_Neel_Prompt.md` → `NEEL_RUNTIME.md`, `NEEL.md` → `NEEL_DOCS.md`. Updated all refs.
2026-04-26 — Tightened `CLAUDE.md` to operational memory.
2026-04-26 — Added `CHANGES.md`.
2026-04-26 — Compressed Cortex prompt 44% (26,763 → 14,830 bytes). Deduped overlapping rules across OUTPUT/COPYWRITING/AI_SLOP/FORMATTING. No rule loss. `NEEL_RUNTIME.md` + `neel-prompt-sections.ts` synced.
2026-04-26 — Added Read deny rules for `NEEL_DOCS.md` + `CHANGES.md` (human-only files).

2026-04-28: feat(quality): Post Quality Score (gauge + suggestions + apply-hook).

2026-04-30: fix(dashboard): show LinkedIn/profile photo in Personal + Company banner & System Status (fallback chain, onError hide).
2026-04-30: feat(ai): add `moonshotai/kimi-k2.6` to AI model picker.
2026-04-30: fix(score): use Kimi K2.6 for quality scoring; Apply hook shows "Applied ✓".
2026-04-30: fix(score): revert scorer to Gemini 2.0 Flash (Kimi returned unparseable JSON); add gpt-4o-mini fallback; harden parsing; system+user message split for stricter JSON; recompute score from breakdown if model returns 0.
2026-04-29: fix(tokens/save): allow through when INTERNAL_API_SECRET unset — was 500'ing silently and breaking new-user LinkedIn connect (UI showed connected but Firestore tokens never saved).
2026-04-29: feat(rewrite): Rewrite In My Voice (modal + side-by-side + score) on /create + /preview; gated as 1 usage.
