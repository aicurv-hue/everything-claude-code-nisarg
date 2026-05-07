# Changes

2026-05-07 — feat(images): switch image generation to gpt-image-2 (medium, 1024×1024). New SaaS-infographic prompt for single + carousel (text rendered inside image). Removed image-style picker (settings tab + per-segment field). Face-gen still uses prior fal model.
2026-05-07 — fix(images): single-image prompt actually switched to SaaS-infographic. The 2026-05-07 entry above only updated the carousel prompt — IMAGE_PROMPT_SYSTEM still emitted "cinematic photography" prompts, so single-image generation kept producing moody silhouette photos. Replaced with infographic spec: bold quoted headline, 2–4 flat-icon blocks, accent callout, CTA pill, dark/light mode lock, banned cinematic/photoreal keywords.
2026-05-07 — refactor(images): extracted submit+poll loop to `src/lib/ai/clientImage.ts` (was duplicated in 4 places). Added `refundUsage` + `/api/usage/refund` so the image-poll route auto-refunds quota when fal.ai returns FAILED — users no longer charged for jobs that never produced an image.

2026-04-26 — Merged 5 agents into 2 (Builder, Strategist).
2026-04-26 — Renamed `Master_Neel_Prompt.md` → `NEEL_RUNTIME.md`, `NEEL.md` → `NEEL_DOCS.md`. Updated all refs.
2026-04-26 — Tightened `CLAUDE.md` to operational memory.
2026-04-26 — Added `CHANGES.md`.
2026-04-26 — Compressed Cortex prompt 44% (26,763 → 14,830 bytes). Deduped overlapping rules across OUTPUT/COPYWRITING/AI_SLOP/FORMATTING. No rule loss. `NEEL_RUNTIME.md` + `neel-prompt-sections.ts` synced.
2026-04-26 — Added Read deny rules for `NEEL_DOCS.md` + `CHANGES.md` (human-only files).

2026-04-28: feat(quality): Post Quality Score (gauge + suggestions + apply-hook).

2026-05-07: fix(create): Idea Bank topic no longer overwritten by stale localStorage draft on Generate.
2026-05-07: fix(pwa): disable aggressive precaching, NetworkFirst for navigations, cleanupOutdatedCaches + skipWaiting — fixes stale UI for returning users.

2026-04-30: fix(dashboard): show LinkedIn/profile photo in Personal + Company banner & System Status (fallback chain, onError hide).
2026-04-30: feat(ai): add `moonshotai/kimi-k2.6` to AI model picker.
2026-04-30: fix(dashboard/stats): auto-refresh LinkedIn picture URL from /userinfo every 24h (licdn signed URLs expire); persist back to Firestore — fixes blank avatar on dashboard.
2026-04-30: fix(score): use Kimi K2.6 for quality scoring; Apply hook shows "Applied ✓".

2026-05-01: feat(regen): temporary regeneration memory — Firestore `regeneration_sessions/{sessionId}` holds initial post (anchor) + each regen turn (text + user comment). Prompt now includes anchor + last 2 turns + elided count to prevent drift across iterations. Capped at 10 turns. Auto-cleaned on save/schedule/publish.
2026-04-30: fix(score): revert scorer to Gemini 2.0 Flash (Kimi returned unparseable JSON); add gpt-4o-mini fallback; harden parsing; system+user message split for stricter JSON; recompute score from breakdown if model returns 0.
2026-04-29: fix(tokens/save): allow through when INTERNAL_API_SECRET unset — was 500'ing silently and breaking new-user LinkedIn connect (UI showed connected but Firestore tokens never saved).
2026-04-29: feat(rewrite): Rewrite In My Voice (modal + side-by-side + score) on /create + /preview; gated as 1 usage.

2026-05-01: feat(ai): Kimi K2.6 is now primary across every text-LLM call site for both Individual and Corporate — post generation (`generate.ts`), Cortex post writer + image prompt + image hook, research (route + lib), post quality scoring, Rewrite In My Voice (via `DEFAULT_MODEL`), profile extraction (via `DEFAULT_MODEL`), Idea Bank, Voice DNA, Profile "Edit with AI" enhance, Best-Time scheduler, Campaigns (research + sequential post gen + image prompt), and `profile/init` default `primaryModel`. Gemini 2.0 Flash is the automatic fallback on HTTP error / unparseable JSON / empty output (Kimi previously failed JSON parsing on scoring — every site that requires JSON now retries Gemini). Vision-only routes (`extract-context` image analysis, `validate-face`) stay on Gemini/gpt-4o-mini since Kimi K2.6 is text-only.

2026-05-01: refactor(ai): single-model consolidation — `google/gemini-2.5-flash` is now the sole LLM across all of Cridl. Removed Kimi K2.6 + Gemini 2.0 Flash + gpt-4o-mini from every text call site (15 files: `openrouter.ts`, `generate.ts`, research route + lib, scoring, idea-generate, voice-dna, profile-enhance, best-time, campaigns generate, memory-extract, profile/init, create page, settings page, gemini.ts) and from vision routes (`extract-context`, `validate-face`). Reason: Kimi caused `FUNCTION_INVOCATION_TIMEOUT` on edge (verbose JSON tripping max_tokens, no SDK timeout default) and unparseable JSON on scoring. Each call now wrapped in AbortController (12s primary + 10s retry on same model) so a stalled call can never exceed the edge function budget. Settings model picker reduced to a single option.
