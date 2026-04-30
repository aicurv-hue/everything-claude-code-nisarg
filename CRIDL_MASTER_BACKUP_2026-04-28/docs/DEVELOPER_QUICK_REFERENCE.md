# Developer Quick Reference — April 2026 Updates

_Quick lookup for recent fixes and implementations_

---

## Quick Links to Changes

### Critical Fixes
1. **Idea Bank Root Cause (Firestore Query)** — [IDEA_BANK_ARCHITECTURE.md](docs/IDEA_BANK_ARCHITECTURE.md#the-bug-firestore-composite-index-issue)
   - **File**: `src/lib/db/ideas.ts`
   - **Issue**: Multi-field query required non-existent composite index
   - **Fix**: Single `where("user_id")` + in-memory filter/sort
   - **Impact**: All idea operations now work (save, fetch, AI generate)

2. **Dark/Light Theme Implementation** — [THEME_SYSTEM.md](docs/THEME_SYSTEM.md)
   - **Files**: `src/lib/context/theme.tsx` (NEW), `src/app/globals.css`, `src/app/layout.tsx`, `src/app/dashboard/settings/page.tsx`
   - **Key**: React Context + CSS `data-theme` attribute + localStorage persistence
   - **Usage**: `const { theme, toggleTheme } = useTheme()`

### UI/UX Improvements
3. **Logout Icon** — `src/app/dashboard/layout.tsx`
   - Changed from `MoreHorizontal` to `LogOut` icon with red hover

4. **Active Tab Visibility** — `src/app/dashboard/layout.tsx`
   - Active: `bg-[var(--primary)] text-white` (bright blue)
   - Inactive: `text-[var(--text-muted)]` with hover effect

5. **Color Accessibility** — `src/app/dashboard/ideas/page.tsx`, `src/components/ui/QuickAddIdea.tsx`
   - Replaced all hardcoded Tailwind colors with CSS variables
   - All components now theme-aware

---

## Common Patterns

### Using Theme in Components
```tsx
import { useTheme } from "@/lib/context/theme";

export function MyComponent() {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <div>
      <p>Current theme: {theme}</p>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
}
```

### CSS Variables in Tailwind
Always use these instead of hardcoded colors:

| Use This | Not This |
|----------|----------|
| `bg-[var(--card)]` | `bg-gray-100` or `bg-slate-800` |
| `text-[var(--foreground)]` | `text-white` or `text-black` |
| `border-[var(--border)]` | `border-gray-200` or `border-gray-800` |
| `bg-[var(--primary)]` | `bg-blue-500` |
| `text-[var(--text-muted)]` | `text-gray-500` |

### Firestore Queries
**Rule from CLAUDE.md**: Single `where(user_id)` + in-memory filter. Never two `where` clauses on different fields.

✅ Correct:
```ts
const snap = await col()
  .where("user_id", "==", userId)
  .limit(100)
  .get();
const filtered = snap.docs
  .map(d => d.data())
  .filter(doc => doc.segment === segment)
  .sort((a, b) => b.created_at - a.created_at);
```

❌ Wrong (requires composite index):
```ts
const snap = await col()
  .where("user_id", "==", userId)
  .where("segment", "==", segment)
  .orderBy("created_at", "desc")
  .get();
```

---

## Files Changed (Summary)

| File | What Changed | Why |
|------|--------------|-----|
| `src/app/dashboard/layout.tsx` | LogOut icon, active tab styling | Clear logout intent, tab visibility |
| `src/app/dashboard/ideas/page.tsx` | Color fixes, error handling, loading states | Theme support, better UX |
| `src/components/ui/QuickAddIdea.tsx` | Color fixes | Theme support |
| `src/lib/db/ideas.ts` | **CRITICAL**: Query refactor | Fix Firestore composite index issue |
| `src/lib/context/theme.tsx` | **NEW** | Theme state management |
| `src/app/globals.css` | Dark/light CSS variables, contrast improvements | Theme system foundation |
| `src/app/layout.tsx` | Added ThemeProvider wrapper | Theme available app-wide |
| `src/app/dashboard/settings/page.tsx` | Added Sun/Moon toggle button | User-facing theme switcher |

---

## Testing the Fixes

### Idea Bank
```bash
# 1. Create an idea manually
- Click "+ Add Idea"
- Type "My test idea"
- Click Save
- Should appear in grid

# 2. Fetch ideas
- Refresh page
- Ideas should persist

# 3. AI generate
- Click "AI Suggestions"
- Should generate 10 ideas in ~5-10 seconds
- Should show tone (professional, storytelling, etc.)
- Should show audience (Founders, Marketers, etc.)

# 4. Use an idea
- Click "Use This Idea" on any card
- Should navigate to create page with prefilled fields
- Idea should be marked as "used"
```

### Theme Toggle
```bash
# 1. Dark mode (default)
- Page loads in dark colors
- All text readable
- No harshness to eyes

# 2. Switch to light
- Click sun icon in Profile settings
- Page transitions to light colors
- All text readable
- Card backgrounds turn white

# 3. Persistence
- Refresh page
- Theme should remain (light)
- Close tab, reopen site
- Theme should be light (loaded from localStorage)

# 4. Both workspaces
- Toggle workspace (Personal ↔ Corporate)
- Theme should persist in both

# 5. All pages
- Navigate to Create, Schedule, Campaigns, Memory, etc.
- Theme should apply everywhere
```

---

## Documentation Files (New)

| File | Purpose |
|------|---------|
| [CHANGELOG_2026_04.md](docs/CHANGELOG_2026_04.md) | Summary of all April fixes + deployment |
| [IDEA_BANK_ARCHITECTURE.md](docs/IDEA_BANK_ARCHITECTURE.md) | Deep dive: data model, API, Firestore fix, UI |
| [THEME_SYSTEM.md](docs/THEME_SYSTEM.md) | Deep dive: theme architecture, CSS variables, usage |
| [DEVELOPER_QUICK_REFERENCE.md](docs/DEVELOPER_QUICK_REFERENCE.md) | This file — quick lookup |

---

## Deployment Checklist

Always follow this sequence:

```bash
# 1. Make changes
# 2. Test locally (npx next build --webpack)
# 3. Stage changes
git add -A

# 4. Commit (per CLAUDE.md)
git commit -m "fix: idea bank saving + dark/light theme toggle"

# 5. ALWAYS use this script to deploy
bash push-all.sh

# 6. Wait for Vercel
# Check https://vercel.com/aicurv-hue/linkedin-automation
# Status should show "Ready" (green check)

# 7. Verify live
# Visit https://cridl.app or relevant staging URL
# Test the feature
```

---

## Common Issues & Solutions

### Issue: Ideas not showing after save
**Symptom**: Click save, no error, but idea doesn't appear in grid
**Debug**:
1. Check browser console for errors
2. Check `/api/ideas` response in Network tab
3. Verify user is logged in (check Firebase token)
4. Check Firestore document exists in `users/{uid}/ideas/{id}`
5. Verify idea's `segment` matches current workspace

### Issue: Theme not persisting
**Symptom**: Switch to light theme, refresh page, it's dark again
**Debug**:
1. Open DevTools → Application → localStorage
2. Check `cridl_theme` key exists and is set to "light"
3. Check `document.documentElement.getAttribute("data-theme")` in console
4. Check ThemeProvider is wrapping the app in `src/app/layout.tsx`

### Issue: Colors wrong in light mode
**Symptom**: Text is too dark or background is wrong
**Debug**:
1. Check component is using `bg-[var(--card)]` not `bg-white`
2. Check `src/app/globals.css` has `[data-theme="light"]` block
3. Check CSS variable is defined in light theme block
4. Verify colors meet WCAG AA contrast (4.5:1 for text)

### Issue: Composite index error in logs
**Symptom**: "firestore requires a composite index" error
**Debug**:
1. Don't create the index — instead refactor the query per CLAUDE.md rule
2. Use single `where("user_id")` only
3. Move other filters to JavaScript memory
4. See [IDEA_BANK_ARCHITECTURE.md](docs/IDEA_BANK_ARCHITECTURE.md#the-fix) for example

---

## Key Constants & Enum Values

### Idea Status
```ts
type IdeaStatus = "active" | "used" | "archived";
```

### Idea Source
```ts
type IdeaSource = "manual" | "ai_suggested";
```

### Theme
```ts
type Theme = "dark" | "light";
```

### Segment
```ts
type Segment = "individual" | "corporate";
```

### Tone (for AI ideas)
```ts
type Tone = "professional" | "storytelling" | "educational" | "contrarian";
```

### Audience (for AI ideas)
```ts
type Audience = "Founders & CEOs" | "Marketers & Growth" | "Engineers & Devs" | "General Professional";
```

---

## Edge Cases to Consider

### Idea Bank
- What if user has 0 ideas? → Show empty state with icon + message
- What if AI generation fails? → Show error banner, don't navigate away
- What if filter has no results? → Show empty state
- What if idea is archived, then user tries to use it? → Allow it (restore to active)

### Theme
- What if user is offline? → localStorage provides theme (persisted)
- What if user clears localStorage? → Theme resets to "dark" default
- What if user disables JavaScript? → CSS `:root` dark mode is fallback
- What if `<html>` doesn't exist? → Can't set attribute, silent fail

---

## Performance Notes

### Idea Bank Query
- **Before**: Tried to use Firestore composite index (didn't exist, returned empty)
- **After**: Single Firestore query (~1 read) + JavaScript filter/sort
- **Cost**: Slightly higher Firestore reads, but negligible (user has ~100 ideas max)
- **Benefit**: No index management, works immediately, future-proof

### Theme System
- **Initialization**: Sync (reads localStorage on mount, sets attribute)
- **Toggle**: Sync (updates state, localStorage, DOM attribute)
- **CSS Application**: Native browser CSS variable substitution
- **Impact**: Negligible on performance (no layout recalculation)

---

## Next Steps / Future Work

1. **System theme detection** — Respect `prefers-color-scheme` media query
2. **Scheduled theme switching** — Auto-switch at sunset/sunrise
3. **Theme in Firebase profile** — Sync across devices
4. **High contrast mode** — WCAG AAA variant
5. **Idea search/tags** — Full-text search over ideas
6. **Idea auto-categorization** — AI tags ideas automatically
7. **Idea reuse tracking** — Show how many times an idea was used

---

## Contact / Questions

For questions on these changes:
- Check [CHANGELOG_2026_04.md](docs/CHANGELOG_2026_04.md) for overview
- Check [IDEA_BANK_ARCHITECTURE.md](docs/IDEA_BANK_ARCHITECTURE.md) for Firestore details
- Check [THEME_SYSTEM.md](docs/THEME_SYSTEM.md) for theme details
- Check git log for commit messages and context
