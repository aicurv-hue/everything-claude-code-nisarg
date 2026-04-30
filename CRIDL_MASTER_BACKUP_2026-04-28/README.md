# CRIDL Master Backup — 2026-04-28

One-time snapshot of all context, memory, rules, and architectural docs for the
Cridl LinkedIn Automation SaaS. Created so context can be restored if memory or
project files are ever lost.

This folder is a COPY. Originals are untouched. Claude will ignore this folder.

## What's CRIDL?
LinkedIn automation SaaS that generates, schedules, and publishes LinkedIn posts
via an AI ghostwriter persona called "Cortex" (legacy name: Neel).

- **Stack:** Next.js 15 · TypeScript · Tailwind v4 · Firebase · OpenRouter
  (Gemini 2.0 Flash) · fal.ai · Razorpay · Vercel · cron-job.org
- **Branch:** `linkedin-main`
- **Deploy:** `bash push-all.sh`
- **Dual workspaces:** Individual (personal profile) + Corporate (company page, Pro+)

## Folder Layout

### `memory/` — Auto-memory snapshot
Persistent memory Claude uses across sessions. Index file is `MEMORY.md`.
- `project_overview.md` — stack, architecture, working features
- `HOW_IT_WORKS.md` — end-to-end flow for every major feature
- `file_index.md` — map of important source files
- `rebrand_neel_cortex.md` — Cortex naming rule
- `audit_website_vs_codebase.md` — positioning gaps
- `rule_*.md` — critical rules (deployment, tokens, edge runtime, post flow)
- `feedback_*.md` — user preferences & corrections
- `skills-agents.md` — agents/skills available

### `root_docs/` — Project root docs
- `NEEL_RUNTIME.md` — Cortex AI prompt (source of truth)
- `NEEL_DOCS.md` — pipeline, SOPs, history
- `Master_Neel_Prompt.md` — full prompt reference
- `CHANGES.md` — change log
- `DOCS_SUMMARY.md` — docs map
- `PRICING.md` — plan pricing details

### `docs/` — Product/dev docs
- `CRIDL_PRODUCT_BRIEF.md` — product context
- `DOCUMENTATION.md` + `DOCUMENTATION_INDEX.md` — full docs
- `DEVELOPER_QUICK_REFERENCE.md` — dev reference
- `Feature list.md` — feature catalog
- `IDEA_BANK_ARCHITECTURE.md` — idea bank system
- `THEME_SYSTEM.md` — UI theme
- `VERCEL_DEPLOY.md` — deploy notes
- `CHANGELOG_2026_04.md` — April 2026 changes
- `README.md`, `FILE_INDEX.txt` — repo guides

### `claude_config/`
- `CLAUDE.md` — project instructions (output style, hard rules, plan limits, key files/routes)

## Plan Limits Quick Reference
| Plan     | Posts | AI Img | Face | Campaigns | Corporate |
|----------|-------|--------|------|-----------|-----------|
| Free     | 5     | 2      | 0    | No        | No        |
| Starter  | 30    | 10     | 5    | No        | No        |
| Pro      | 100   | 50     | 20   | Yes       | Yes       |
| Business | 9999  | 9999   | 9999 | Yes       | Yes       |

## Hard Rules (don't violate)
1. LinkedIn tokens → Firestore `tokens/{firebaseUID}`. Bearer auth. Never cookies.
2. OpenRouter / fal.ai / OAuth routes → `runtime = "edge"` + `verifyTokenEdge.ts`.
3. No direct post — always editable preview, save with `status: "scheduled"`.
4. Cortex prompt edits → `NEEL_RUNTIME.md` only. Never hardcode prompt in TS.
5. No asterisks in AI output (LinkedIn renders literal).
6. Next.js 15: `params: Promise<{id: string}>` + `await params`.
7. Firestore: single `where(user_id)` + JS filter — never composite-index queries.
8. No "Neel" in new user-facing text. Persona = "Cridl Cortex".

## Restore Instructions
If memory/context is ever lost:
1. Copy `memory/*.md` → `C:\Users\USER\.claude\projects\c--Users-USER-Desktop-Anti-Gravity-LInkedin-automation\memory\`
2. Copy `claude_config/CLAUDE.md` → `<project>/.claude/CLAUDE.md`
3. Copy `root_docs/*` and `docs/*` back to their original locations if missing.

Snapshot date: 2026-04-28
Branch at snapshot: linkedin-main
HEAD commit: f65eb7f (docs: log 2026-04-27 regen fix, x-screenshot removal, research timeout)
