# Cridl Documentation — April 2026

Welcome! This is the master documentation hub for Cridl — LinkedIn Automation SaaS.

---

## 🆕 Latest Updates (April 19, 2026)

**Major fixes and features completed:**

1. **Idea Bank Root Cause Fix** — Firestore composite index issue resolved
   - Ideas now save, fetch, and generate correctly
   - [Read: IDEA_BANK_ARCHITECTURE.md](IDEA_BANK_ARCHITECTURE.md)

2. **Dark/Light Theme Implementation** — Users can toggle themes with persistence
   - React Context-based theming with CSS variables
   - Toggle button in Profile settings
   - [Read: THEME_SYSTEM.md](THEME_SYSTEM.md)

3. **UI/UX Improvements** — Logout icon, tab visibility, color accessibility
   - [Read: CHANGELOG_2026_04.md](CHANGELOG_2026_04.md)

4. **Developer Quick Reference** — Fast lookup for patterns and common issues
   - [Read: DEVELOPER_QUICK_REFERENCE.md](DEVELOPER_QUICK_REFERENCE.md)

---

## Documentation Map

### For Product & Strategy
- **[Cridl Product Brief](CRIDL_PRODUCT_BRIEF.md)** — Product identity, features, personas, pricing
- **[Feature List](Feature%20list.md)** — Competitive research, feature intelligence, what's built vs. planned
- **[Changelog — April 2026](CHANGELOG_2026_04.md)** — All fixes, features, and deployment notes from April

### For Developers

#### Getting Started
- **[Developer Quick Reference](DEVELOPER_QUICK_REFERENCE.md)** ⭐ **Start here** — Quick lookup for fixes, patterns, common issues, testing

#### Architecture Deep Dives
- **[Idea Bank Architecture](IDEA_BANK_ARCHITECTURE.md)** — Data model, API endpoints, Firestore fix, UI layer
- **[Theme System](THEME_SYSTEM.md)** — Dark/light theme implementation, CSS variables, context API, usage patterns
- **[Full System Architecture](.claude/docs/architecture.md)** — Overall stack, infrastructure, pipeline
- **[Database Schema](.claude/docs/database_schema.md)** — Firestore collections, localStorage keys
- **[API Documentation](.claude/docs/api_docs.md)** — All API routes and request/response payloads

#### Deployment & Operations
- **[Deployment](.claude/docs/deployment.md)** — Vercel, Android APK, env vars, cron setup
- **[Vercel Deploy Guide](VERCEL_DEPLOY.md)** — Step-by-step Vercel setup
- **[Testing](.claude/docs/testing.md)** — Test strategy and coverage

#### Firebase & Security
- **[Firebase Schema](.claude/docs/firebase_schema.md)** — Security rules, data structure

---

## Quick Code Lookups

### Common Patterns

#### Using Theme in Components
```tsx
import { useTheme } from "@/lib/context/theme";

export function MyComponent() {
  const { theme, toggleTheme } = useTheme();
  return <div>Current: {theme}</div>;
}
```

#### CSS Variables (Always Use These)
```tsx
// ✅ Good
<div className="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)]">

// ❌ Bad
<div className="bg-gray-100 text-white border border-gray-200">
```

#### Firestore Queries (CLAUDE.md Rule)
```ts
// ✅ Correct: Single where + in-memory filter
const snap = await col()
  .where("user_id", "==", userId)
  .limit(100)
  .get();
const filtered = snap.docs
  .map(d => d.data())
  .filter(doc => doc.segment === segment)
  .sort((a, b) => b.created_at - a.created_at);

// ❌ Wrong: Composite index required
const snap = await col()
  .where("user_id", "==", userId)
  .where("segment", "==", segment)
  .orderBy("created_at", "desc")
  .get();
```

---

## File Structure

### `/docs/` (This Folder)
- Public documentation files
- Changelog, guides, product specs
- Architecture and API docs

### `/.claude/docs/` (Hidden)
- Detailed technical docs (architecture, database schema, API)
- Requirements and user stories
- Strategy and product notes

### Key Source Files

| File | Purpose |
|------|---------|
| `NEEL_RUNTIME.md` | AI prompt text (single source of truth) |
| `NEEL_DOCS.md` | AI pipeline documentation |
| `src/app/dashboard/ideas/page.tsx` | Idea Bank UI |
| `src/lib/db/ideas.ts` | Idea Bank database layer |
| `src/lib/context/theme.tsx` | Theme state management |
| `src/app/globals.css` | CSS variables (theming) |
| `push-all.sh` | Deployment script (always use this) |

---

## Common Tasks

### I need to...

**...understand what changed in April**
→ Read [CHANGELOG_2026_04.md](CHANGELOG_2026_04.md)

**...work on the Idea Bank**
→ Read [IDEA_BANK_ARCHITECTURE.md](IDEA_BANK_ARCHITECTURE.md) + [DEVELOPER_QUICK_REFERENCE.md](DEVELOPER_QUICK_REFERENCE.md#idea-bank)

**...add/fix theme colors**
→ Read [THEME_SYSTEM.md](THEME_SYSTEM.md)

**...understand the Firestore fix**
→ Read [IDEA_BANK_ARCHITECTURE.md](IDEA_BANK_ARCHITECTURE.md#the-bug-firestore-composite-index-issue)

**...debug a theme issue**
→ Read [DEVELOPER_QUICK_REFERENCE.md](DEVELOPER_QUICK_REFERENCE.md#common-issues--solutions)

**...deploy changes**
→ Read [DEVELOPER_QUICK_REFERENCE.md](DEVELOPER_QUICK_REFERENCE.md#deployment-checklist) (always use `bash push-all.sh`)

**...understand the product**
→ Read [CRIDL_PRODUCT_BRIEF.md](CRIDL_PRODUCT_BRIEF.md)

---

## Key Principles

### From CLAUDE.md (Must Follow)

1. **Deployment**: Always use `bash push-all.sh` — never manual `git push`
2. **Tokens**: LinkedIn tokens → Firestore `tokens/{firebaseUID}`, Bearer auth, never cookies
3. **Edge Runtime**: Routes using OpenRouter/fal.ai/OAuth must export `runtime = "edge"`
4. **Post Flow**: Always editable preview first, never auto-post
5. **Firestore**: Single `where(user_id)` + in-memory filter. Never two `where` clauses on different fields.
6. **Colors**: All new UI must use CSS variables `var(--*)`, not hardcoded colors
7. **Theme**: All text/backgrounds must be readable in both dark and light themes

### From Recent Work

1. **Error Handling**: Always show user-facing error messages on API failure
2. **Loading States**: Show loading/disabled states during async operations
3. **Logging**: Use console.error with descriptive prefixes `[feature]`
4. **Testing**: Always build locally (`npx next build --webpack`) before deploying

---

## Deployment Status

- **Branch**: `linkedin-main`
- **Last Deploy**: April 19, 2026
- **Status**: ✅ Vercel production ready
- **Build**: Passes with no errors

---

## Need Help?

| Question | Answer |
|----------|--------|
| What happened in April? | → [CHANGELOG_2026_04.md](CHANGELOG_2026_04.md) |
| How do I theme a component? | → [THEME_SYSTEM.md](THEME_SYSTEM.md#usage) |
| Why aren't my ideas saving? | → [IDEA_BANK_ARCHITECTURE.md](IDEA_BANK_ARCHITECTURE.md#testing-checklist) |
| What's the Firestore fix? | → [IDEA_BANK_ARCHITECTURE.md](IDEA_BANK_ARCHITECTURE.md#the-bug-firestore-composite-index-issue) |
| How do I deploy? | → [DEVELOPER_QUICK_REFERENCE.md](DEVELOPER_QUICK_REFERENCE.md#deployment-checklist) |
| What API endpoints exist? | → [.claude/docs/api_docs.md](.claude/docs/api_docs.md) |
| What's the database schema? | → [.claude/docs/database_schema.md](.claude/docs/database_schema.md) |

---

## Contributing

When you make changes:

1. **Update relevant doc** — If you fix a feature, update its architecture doc
2. **Commit clearly** — Use descriptive commit messages
3. **Deploy via script** — Always `bash push-all.sh`
4. **Verify live** — Check Vercel status shows "Ready" (green)
5. **Test features** — Manually verify the feature works

---

_Last updated: 2026-04-19_  
_All docs are current and reflect the codebase state._
