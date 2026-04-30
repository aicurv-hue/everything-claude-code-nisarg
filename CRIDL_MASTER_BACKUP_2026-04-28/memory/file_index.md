---
name: Key File Index
description: Map of important source files and their roles in the Cridl codebase
type: reference
originSessionId: e55a86ee-35e8-4434-881c-7e91facb0f07
---
## Cortex Prompt & Pipeline (legacy "NEEL" filenames)
- `Master_Neel_Prompt.md` — single source of truth for Cortex prompt text (edit to change AI behaviour)
- `NEEL.md` — pipeline documentation (update when generate.ts/research.ts/memory/profiles/settings change)

## Dashboard Pages
- `src/app/dashboard/layout.tsx` — sidebar nav, Individual/Corporate switcher
- `src/app/dashboard/create/page.tsx` — create post (topic, tone, audience, length)
- `src/app/dashboard/create/preview/page.tsx` — editable preview, image picker, schedule
- `src/app/dashboard/drafts/page.tsx` — drafts grid
- `src/app/dashboard/history/page.tsx` — history table + detail modal
- `src/app/dashboard/schedule/page.tsx` — calendar + stats
- `src/app/dashboard/schedule/bulk/page.tsx` — CSV upload
- `src/app/dashboard/campaigns/{page,new,[id]}/page.tsx` — campaign list/wizard/detail
- `src/app/dashboard/memory/page.tsx` — Cortex memory bank (view + delete)
- `src/app/dashboard/settings/page.tsx` — 6-tab profile settings

## AI / DB Libs
- `src/lib/ai/openrouter.ts` — OpenRouter client
- `src/lib/ai/research.ts` — single-call research (Gemini 2.0 Flash, server action)
- `src/lib/ai/generate.ts` — assembles prompt, calls Cortex, fallback gpt-4o-mini
- `src/lib/ai/memory-extract.ts` — extracts summary/keywords/style_notes (fire-and-forget)
- `src/lib/db/{profiles,posts,memory}.ts` — CRUD layers
- `src/lib/utils/verifyTokenEdge.ts` — Firebase token verify (Edge, REST)

## API Routes
- `src/app/api/campaigns/[id]/{generate,activate}/route.ts` — campaign generation + scheduling
- `src/app/api/image/{generate,face-generate}/route.ts` — fal.ai (edge, Bearer)
- `src/app/api/cron/publish-due/route.ts` — hourly publish cron
- `src/app/api/analytics/route.ts` — post analytics (timing only; engagement blocked by Partner API)

## Campaign Components
- `src/components/campaigns/CampaignPostDrawer.tsx` — per-post image drawer (4 modes)
- `src/components/campaigns/CampaignPostReview.tsx` — step-2 editor with auto-save
- `src/components/campaigns/CampaignTimeline.tsx` — clickable post cards
