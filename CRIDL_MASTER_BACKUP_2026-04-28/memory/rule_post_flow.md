---
name: Post flow — never post directly, always editable preview first
description: Posts must go through editable preview before scheduling or publishing. Strict Individual/Corporate separation.
type: feedback
---

NEVER post directly to LinkedIn. Always show an editable preview first.

Posts are stored in Firestore `posts` collection with `status: "scheduled"` when scheduled.

Strict workspace separation:
- **Individual**: Storytelling, personal voice, authority building
- **Corporate**: Brand consistency, industry metrics, case studies

These two segments must never mix data or UI context.

**Why:** Users must have full control and review before anything goes to LinkedIn. Direct posting without preview is an unacceptable UX and safety risk in a professional context.

**How to apply:** Any new posting flow must route through the preview page at `src/app/dashboard/create/preview/page.tsx`. Never add a "post now" shortcut that skips preview.
