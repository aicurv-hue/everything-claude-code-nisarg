# Cridl — LinkedIn Automation SaaS

Project: LinkedIn automation SaaS (Cridl)
Goal: Generate, schedule, publish LinkedIn posts via AI ghostwriter (Cortex)
Stack: Next.js 15 · TS · Tailwind v4 · Firebase · OpenRouter (Gemini 2.0 Flash) · fal.ai · Razorpay · Vercel · cron-job.org
Branch: `linkedin-main`
Deploy: `bash push-all.sh` only

## Output style
Code + 1-line "what changed". No commentary, no padding.

## Pipeline
Strategist → Builder → deploy. Builder FAIL = loop back.

## After every change
1. Commit with clear message
2. `bash push-all.sh`
3. Confirm Vercel deployment Ready

## Hard rules
- LinkedIn tokens → Firestore `tokens/{firebaseUID}`. Bearer auth on every API call. Never cookies.
- OpenRouter / fal.ai / OAuth routes → `export const runtime = "edge"`. Use `verifyTokenEdge.ts`.
- No direct post. Editable preview always. Posts saved with `status: "scheduled"`.
- Cortex prompt → edit `NEEL_RUNTIME.md` only. Never hardcode prompt in TS.
- Update `NEEL_DOCS.md` when pipeline changes.
- No asterisks in AI output (LinkedIn renders literal).
- Next.js 15: `params: Promise<{id: string}>` + `await params`.
- Firestore: single `where(user_id)` + JS filter. Never composite-index queries.
- No "Neel" in new user-facing text. Persona = "Cridl Cortex". Filenames `NEEL_*` legacy-kept.

## Plan limits (`src/lib/checkSubscription.ts`)
| Plan | Posts | AI Img | Face | Campaigns | Corporate |
|---|---|---|---|---|---|
| Free | 5 | 2 | 0 | No | No |
| Starter | 30 | 10 | 5 | No | No |
| Pro | 100 | 50 | 20 | Yes | Yes |
| Business | 9999 (UI: "Unlimited") | 9999 | 9999 | Yes | Yes |

Generation + regeneration both = 1 usage. Gates: `canUseCampaigns()`, `canUseCorporate()`.

## Key files
- `src/lib/checkSubscription.ts` — limits, gates
- `src/lib/usageTracking.ts` — usage tracking
- `src/lib/utils/verifyTokenEdge.ts` — Edge Firebase auth
- `NEEL_RUNTIME.md` — Cortex prompt source of truth
- `NEEL_DOCS.md` — pipeline, SOPs, history
- `docs/CRIDL_PRODUCT_BRIEF.md` — product context
- `CHANGES.md` — date + 1-line change log

## Key routes
| Route | Runtime | Notes |
|---|---|---|
| `/api/ai/research`, `/api/ai/generate` | edge | 2-stage |
| `/api/image/generate`, `/api/image/face-generate` | edge | fal.ai |
| `/api/campaigns`, `/api/campaigns/[id]/generate` | node | Pro+ |
| `/api/posts` | node | Corporate = Pro+ |
| `/api/cron/publish-due` | node | Hourly, skips plan_blocked |
| `/api/auth/linkedin/callback` | edge | OAuth |

## Dual workspace
- Individual: personal profile, first-person, all plans
- Corporate: company page (Org ID), company voice, Pro+
- Data fully segment-scoped (posts, campaigns, memory, settings)

## Don't touch
- Engagement metrics — needs LinkedIn Partner API (not approved)
- iOS app — Android APK + PWA only
