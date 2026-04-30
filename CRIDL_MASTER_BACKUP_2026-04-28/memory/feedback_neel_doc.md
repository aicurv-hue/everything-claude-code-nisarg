---
name: Always update NEEL.md when changing Neel's pipeline
description: Whenever any change is made to Neel's inputs, prompt, research, memory, or generation pipeline, NEEL.md must be updated in the same session before finishing.
type: feedback
---

Always keep `NEEL.md` (at project root) up to date whenever any of these files are modified:

- `src/lib/ai/generate.ts` — prompt changes, new input fields, new layers
- `src/lib/ai/research.ts` — research pipeline changes, new profile fields used
- `src/lib/ai/memory-extract.ts` — memory extraction changes
- `src/lib/db/memory.ts` — memory schema or scoring changes
- `src/lib/db/profiles.ts` — new profile fields added
- `src/app/dashboard/settings/page.tsx` — new settings fields exposed to user
- `src/app/dashboard/create/page.tsx` — new inputs added to create form

**Why:** NEEL.md is the single source of truth for what feeds into post generation. Missing or stale documentation leads to missed inputs which directly reduces post quality. The user explicitly requested this be maintained.

**How to apply:** At the end of any session where Neel's pipeline is changed, update the relevant section(s) in NEEL.md — the input table, the prompt architecture order, the file map, or the missing fields table as appropriate. Do this before marking the task complete.
