# LinkAuto — LinkedIn Automation SaaS

## Vision
A premium LinkedIn automation portal for **Individual Personal Branding** and **Corporate Company Management**, powered by a two-stage AI research/generation pipeline.

## Stack & Architecture
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Node.js + Edge Runtime), Vercel deployment
- **Database/Auth**: Firebase Firestore + Firebase Auth (LinkedIn OAuth2, per-user token storage)
- **AI**: OpenRouter (Gemini 2.0 Flash, GPT-4o, Claude 3.5)
- **Scheduling**: cron-job.org → `/api/cron/publish-due` every minute

---

## Git & Deployment

### Remotes
| Remote | Repo | Purpose |
|--------|------|---------|
| `linkedin` | `aicurv-hue/linkedin-automation` | **Primary** — Vercel watches this |
| `origin`   | `aicurv-hue/everything-claude-code-nisarg` | Mirror |

### Active Branch
Always work on `linkedin-main`. Never push manually — always use:
```bash
bash push-all.sh
```
This pushes to `linkedin/main` (triggers Vercel deploy), `linkedin/linkedin-main`, and `origin/linkedin-main`.

---

## LinkedIn Automation Rules

### Input Stream
- **Individual**: Storytelling, personal voice, authority building.
- **Corporate**: Brand consistency, industry metrics, case studies.
- **Research Phase**: Two-stage AI pipeline — research synthesis → post generation.

### Output Stream
- **Editing**: Never post directly. Always show editable preview first.
- **Scheduling**: Posts stored in Firestore `posts` collection with `status: "scheduled"`.
- **Segments**: Strict separation between Individual and Corporate workspaces.

### Token Storage (CRITICAL — never change)
- LinkedIn tokens → Firestore `tokens/{firebaseUID}` (keyed by Firebase UID)
- Every API route MUST use Firebase ID token (`Authorization: Bearer <token>`) to identify user
- Never use browser cookies for LinkedIn auth — multi-user SaaS, cookies are shared per browser

---

## File Structure
- `src/app/` — Next.js App Router pages & API routes
- `src/components/` — UI components (Tailwind, glassmorphism dark theme)
- `src/lib/` — Core logic (Firebase, LinkedIn API, AI pipeline)
- `src/lib/ai/neel-prompt-sections.ts` — Inlined prompt sections (Edge Runtime compatible)
- `Master_Neel_Prompt.md` — Human-editable source of truth for all AI prompt text
- `NEEL.md` — Pipeline documentation
- `push-all.sh` — Always use this for deployment

---

## Edge Runtime Routes (no Vercel timeout)
Any route calling OpenRouter or LinkedIn OAuth must use `export const runtime = "edge"`:
- `src/app/api/ai/research/route.ts`
- `src/app/api/ai/generate/route.ts`
- `src/app/api/ai/image-prompt/route.ts`
- `src/app/api/auth/linkedin/callback/route.ts`

---

## Admin
- Admin dashboard: `/admin`
- Admin access controlled by `ADMIN_EMAILS` env var in Vercel
- Current admins: `nisarg2526@gmail.com`, `aicurv@gmail.com`
- Beta access controlled by `BETA_APPROVED_EMAILS` env var

---

## Scripts
- `scripts/add-beta-user.mjs` — Add/remove beta users
- `scripts/seed-beta-access.mjs` — Seed initial beta list
- `scripts/test-scheduling.mjs` — Test scheduling logic
