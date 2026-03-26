# LinkedIn Automation SaaS — Project Framework (ECC)

This project leverages the **Everything Claude Code (ECC)** framework for high-performance AI agent orchestration and SaaS delivery.

## 🚀 Vision

A premium LinkedIn automation portal for **Individual Personal Branding** and **Corporate Company Management**, powered by a two-stage AI research/generation pipeline.

## 🛠️ Stack & Architecture

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes (Edge Runtime for AI & OAuth), Vercel Cron
- **Database/Auth**: Firebase Firestore + Firebase Auth (LinkedIn OAuth2, token storage, post history)
- **AI Infrastructure**: OpenRouter (Gemini 2.0 Flash, GPT-4o, Claude 3.5), ECC Framework

---

## 🌿 Git & Deployment Strategy

### Remotes
| Remote | Repo | Purpose |
|--------|------|---------|
| `linkedin` | `aicurv-hue/linkedin-automation` | **Primary** — Vercel watches this |
| `origin`   | `aicurv-hue/everything-claude-code-nisarg` | ECC framework mirror — DO NOT touch `main` |

### Branch Rules
| Branch | Tracks | Purpose |
|--------|--------|---------|
| `linkedin-main` | `linkedin/main` | **Active development — always work here** |
| `deploy-main`   | `linkedin/main` | Kept in sync — same content as linkedin-main |

### Vercel Deploy Branch
Vercel is connected to **`linkedin/main`** (`aicurv-hue/linkedin-automation`, `main` branch).
Every push to `linkedin/main` triggers an automatic production deploy.

### How to Push After Every Commit
Always run `push-all.sh` — NEVER push manually to individual branches:
```bash
bash push-all.sh
```
This pushes `linkedin-main` to:
- `linkedin/main` → triggers Vercel production deploy
- `linkedin/linkedin-main` → GitHub branch backup
- `origin/linkedin-main` → ECC repo mirror

---

## 🤖 ECC Agent Orchestration (Anti Gravity Rules)

Whenever performing a task, ALWAYS cross-reference the relevant ECC agent and skill.

### Core Agents to Use
- **planner**: For all implementation planning (Stage 0).
- **architect**: For system design and Firebase/Firestore decisions.
- **tdd-guide**: For all new feature development (80%+ coverage required).
- **code-reviewer**: Mandatory check after any significant modification.

### Core Skills to Leverage
- **content-engine**: Base for all LinkedIn post types and platform-native styles.
- **market-research**: Primary logic for the "AI Research" phase of the input stream.
- **article-writing**: For long-form corporate thought leadership posts.
- **api-design**: For all Firebase/LinkedIn interaction patterns.

---

## 📋 LinkedIn Automation Rules

### Input Stream (Individual & Corporate)
- **Individual**: Focus on storytelling, personal voice, and authority building.
- **Corporate**: Focus on brand consistency, industry metrics, and case studies.
- **Research Phase**: AI must perform "deep research" (using `market-research` skill) before generating a post.

### Output Stream
- **Editing**: Never post directly. Always show a final editable preview.
- **Scheduling**: Post stored in Firestore `posts` collection with `status: "scheduled"`.
- **Segments**: Maintain strict separation between Individual and Corporate workspaces.

### Token Storage
LinkedIn tokens are saved to Firestore **`tokens`** collection (keyed by Firebase UID).
The cron worker reads from `tokens` — never change this collection name.

---

## 📁 File Structure Conventions

- `src/app/`: Next.js App Router (pages & API routes)
- `src/components/`: UI components (Tailwind + Premium CSS)
- `src/lib/`: Core logic (Firebase client, LinkedIn API, AI pipeline)
- `src/lib/ai/neel-prompt-sections.ts`: Inlined prompt sections (Edge Runtime compatible)
- `Master_Neel_Prompt.md`: Human-editable source of truth for all Neel prompt text
- `repos/everything-claude-code-nisarg/`: ECC framework (pristine, DO NOT modify)
- `repos/marketing-skills-all/`: Marketing skills repo (pristine, DO NOT modify)
- `push-all.sh`: Push script — always use this instead of manual git push

---

## ⚡ Edge Runtime Routes (No Vercel Timeout)
These routes run on Edge Runtime — no 10s limit on Vercel Hobby:
- `src/app/api/ai/research/route.ts` — AI research pipeline
- `src/app/api/ai/generate/route.ts` — Post generation
- `src/app/api/ai/image-prompt/route.ts` — Standalone image prompt regen
- `src/app/api/auth/linkedin/callback/route.ts` — OAuth callback
- `src/app/api/dashboard/stats/route.ts` — Dashboard stats

**Rule:** Any route that calls OpenRouter or LinkedIn OAuth MUST use `export const runtime = "edge"`.

---

## 🧪 Verification & QA

- Run `/test-coverage` to ensure 80%+ unit/integration coverage.
- Use `/e2e` for the LinkedIn OAuth and posting flows.
- Use `/security-scan` (AgentShield) before any production-ready merge.
