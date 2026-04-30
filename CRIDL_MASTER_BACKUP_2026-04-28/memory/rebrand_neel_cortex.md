---
name: Neel → Cridl Cortex Rebrand (April 2026)
description: Complete rebrand of AI ghostwriter persona from "Neel" to "Cridl Cortex" — what changed, what didn't, and guidelines for future dev
type: project
---

## What Changed

**April 2026**: Renamed AI ghostwriter persona from "Neel" to "Cridl Cortex" across the entire platform to align marketing positioning with codebase.

### User-Facing Changes (100% Complete)
- ✅ All UI labels, help text, tooltips: "Neel" → "Cortex"
- ✅ Landing page: avatar label "Neel · AI Ghostwriter" → "Cridl Cortex · AI Engine"
- ✅ Dashboard: "AI Engine (Neel)" → "Cridl Cortex"
- ✅ Settings page: All hints/descriptions mentioning Neel updated to Cortex
- ✅ Memory page: "Neel's memory bank" → "Cortex's memory bank"
- ✅ Preview page: "Neel wrote this" → "Cortex wrote this"
- ✅ API responses: Image titles, system prompts, notifications
- ✅ File downloads: "neel-linkedin-image.png" → "cridl-linkedin-image.png"
- ✅ CSV upload help text: All references updated
- ✅ Campaign builder: All help text updated
- ✅ Error messages & system prompts in API routes

### Prompt Content Changes (100% Complete)
- ✅ **Master_Neel_Prompt.md**: Identity changed from "You are Neel — LinkedIn's sharpest ghostwriter" to "You are Cridl Cortex — the intelligence engine behind every post on this platform."
- ✅ All prompt text updated to reflect Cortex identity
- ✅ **neel-prompt-sections.ts**: IDENTITY section rewritten
- ✅ **generate.ts**: All comments referencing Neel changed to Cortex

### Documentation Changes (100% Complete)
- ✅ **NEEL.md**: Title + all references updated to mention Cortex
- ✅ **CRIDL_PRODUCT_BRIEF.md**: All "Neel" → "Cortex"
- ✅ **CLAUDE.md**: Prompt/pipeline references updated

### Pricing Alignment (100% Complete)
- ✅ **Free**: 5 posts, 2 images (was 10 posts, 5 images)
- ✅ **Starter**: 30 posts, 10 images (was 45 posts)
- ✅ **Pro**: 100 posts, 50 images, 20 face images
- ✅ **Business**: Unlimited
- ✅ Updated in: `checkSubscription.ts`, `PricingCards.tsx`, `UpgradePlans.tsx`, `billing/page.tsx`, `SubscriptionStatus.tsx`, `CLAUDE.md`

---

## What Did NOT Change (Intentional)

### File Names & Import Paths (Kept for Pragmatism)
❌ `Master_Neel_Prompt.md` — **Not renamed**
- Reason: Would require updating all import paths, environment variables, deployment configs
- Impact: Low — file contents are Cortex, filename is historical artifact
- Future action: Rename if you're doing a major refactor; not critical

❌ `NEEL.md` — **Not renamed**
- Reason: Same as above; still the pipeline documentation
- Impact: Low — confusing but functional
- Future action: Consider renaming to `CORTEX.md` if touching documentation structure

❌ `neel-prompt-sections.ts` — **Not renamed**
- Reason: Renaming would break all imports across 5+ files
- Impact: Low — internal code file, no user visibility
- Future action: Not urgent; rename if refactoring around this file

❌ `NEEL_SECTIONS` constant in `neel-prompt-sections.ts` — **Not renamed**
- Reason: Used throughout `generate.ts` + imports
- Impact: Low — internal constant, no user-facing impact
- Future action: Not urgent; rename if refactoring prompt system

### Internal Code Comments (Partial)
Some internal comments in imports/require statements still reference "NEEL_SECTIONS" etc. These are fine — they're internal identifiers, not user-facing.

---

## For Future Developers: Guidelines

### When Adding Features
- ✅ Use "Cortex" in all **new UI text, labels, help text, tooltips, error messages**
- ✅ Use "Cortex" in **all new comments/documentation**
- ✅ Only reference "Neel" when explaining this rebrand or pointing to historical code

### When Fixing Bugs
- ✅ If you're already in `Master_Neel_Prompt.md`, `NEEL.md`, etc., feel free to rename them if it fits your change
- ✅ If you're touching `generate.ts` or `neel-prompt-sections.ts`, consider renaming to `cortex-prompt-sections.ts` + `CORTEX_SECTIONS`
- ✅ If it's a small fix unrelated to the prompt system, leave the filenames alone

### When Renaming Files
The pragmatic path forward is:
1. If you're already refactoring the AI prompt system → rename `Master_Neel_Prompt.md` → `Master_Cortex_Prompt.md`
2. Update imports in `generate.ts`
3. Rename `neel-prompt-sections.ts` → `cortex-prompt-sections.ts` + rename constant to `CORTEX_SECTIONS`
4. Rename `NEEL.md` → `CORTEX.md`
5. Update all references in `.claude/CLAUDE.md` and memory files
6. Test locally, commit, deploy

But **don't do this rename just for cleanliness** — only if you're already touching that code for another reason.

---

## Testing the Rebrand

- ✅ Build passes: `npx next build --webpack`
- ✅ No user-facing "Neel" references remain (verified via grep)
- ✅ All pricing displays match website (5/2, 30/10, 100/50, unlimited)
- ✅ Deployed successfully to Vercel (April 2026)

**To verify in production**:
1. Load cridl.com landing page → avatar label should say "Cridl Cortex · AI Engine"
2. Create a test post → all tooltips should reference "Cortex"
3. Check settings → all hints should mention "Cortex"
4. Check memory page → should say "Cortex's memory bank"

---

## Why This Rebrand Happened

**Context**: Website (cridl.com) was marketing Cridl Cortex as the core identity, but the codebase still used "Neel" in most user-facing places. This created:
- Inconsistent messaging (website says "Cortex", app says "Neel")
- Confused brand positioning (is it Neel or Cortex?)
- Misalignment between marketing and product

**Solution**: Renamed all user-facing references to "Cridl Cortex" while keeping internal code identifiers unchanged (for shipping velocity).

---

## Commit History

- **2026-04-18**: `rebrand: Neel → Cridl Cortex + align pricing to website`
  - 29 files changed, 511 insertions, 170 deletions
  - Covers: UI, prompts, docs, pricing, API routes, comments
  - Deploy: Vercel production

