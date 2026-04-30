---
name: Project Overview — Cridl LinkedIn Automation
description: Stack, architecture, working features, and known limitations for the Cridl LinkedIn automation SaaS
type: project
originSessionId: e55a86ee-35e8-4434-881c-7e91facb0f07
---
## Project
- **Name**: LinkAuto — LinkedIn Automation SaaS Portal (branded as "Cridl")
- **Stack**: Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Firebase, OpenRouter, fal.ai
- **Root**: `c:/Users/USER/Desktop/Anti Gravity/LInkedin automation/`

## Architecture
- **Two-stage AI**: Research (Gemini 2.0 Flash, single combined call) → Generate (system prompt + branding + memory)
- **Two segments**: Individual (personal) / Corporate (company, Pro+)
- **Models**: Gemini 2.0 Flash primary; GPT-4o, Claude 3.5/Haiku 4.5 via OpenRouter; gpt-4o-mini auto-fallback on 5xx/429
- **Image generation**: fal.ai — AI Generate, Use My Face (flux-pulid), Upload, No Image
- **Edge auth**: `verifyTokenEdge.ts` — Firebase REST API (no admin SDK)
- **Cron**: cron-job.org → `/api/cron/publish-due` hourly; browser polls every 5min on Schedule page

## Working ✅
LinkedIn OAuth (CSRF, Firestore tokens), direct publish (Individual + Corporate), scheduled publishing with token refresh, AI research/generation, all 4 image modes, campaigns (drip sequences), memory system (auto-extract + relevance scoring), 6-tab profile settings, post history, bulk CSV (≤500), content calendar, memory bank, admin panel, onboarding gate.

## Limitations ❌
- **Engagement metrics unavailable** — LinkedIn moved likes/comments to Partner API only (April 2025). Analytics shows timing only.
- **E2E tests** — not written.

## Known Blockers
- LinkedIn Partner API approval needed for engagement data + guaranteed `w_organization_social` at scale.
- Vercel 60s timeout on AI routes — mitigated by Edge Runtime + single combined research call.
