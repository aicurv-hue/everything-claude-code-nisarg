# Cridl Changelog — April 2026

_Last updated: 2026-04-19_

## April 19, 2026 — UI/UX Fixes & Dark/Light Theme Toggle

### Issues Fixed

#### 1. **Logout Icon Confusion (Fixed)**
- **Issue**: The 3-dots (MoreHorizontal) button in sidebar user card was misleading — users expected a menu, but clicking it logged them out.
- **Fix**: Changed icon from `MoreHorizontal` to `LogOut` with red hover color and clear title "Log out"
- **File**: `src/app/dashboard/layout.tsx`
- **Impact**: Logout action is now visually clear and predictable

#### 2. **Idea Bank Not Saving (Root Cause: Firestore Composite Index)**
- **Issue**: Ideas were not saving. The `/dashboard/ideas` page appeared broken — fetch always returned empty, AI generation failed silently.
- **Root Cause**: `src/lib/db/ideas.ts` `getAll()` was using:
  ```ts
  where("user_id") + where("segment") + orderBy("created_at")
  ```
  This requires a Firestore composite index that was never created. Firestore silently fails multi-field queries without the required index.
- **Fix**: Refactored to single-field query + in-memory filtering/sorting (per CLAUDE.md rule: "Single `where(user_id)` + in-memory filter. Never two `where` clauses on different fields")
  ```ts
  const snap = await col()
    .where("user_id", "==", userId)
    .limit(200)
    .get();
  let ideas = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ContentIdea))
    .filter((i) => i.segment === segment)
    .sort((a, b) => {
      const ta = (a.created_at as any)?.seconds ?? 0;
      const tb = (b.created_at as any)?.seconds ?? 0;
      return tb - ta;
    });
  ```
- **Files**: `src/lib/db/ideas.ts`
- **Impact**: All idea operations now work — saving, fetching, filtering, AI generation

#### 3. **Theme Colors Invisible on Dark Background**
- **Issue**: QuickAddIdea modal and Idea Bank page used hardcoded light theme colors (gray-100, gray-200, gray-900, border-gray-200) — invisible/unreadable on dark background
- **Fix**: Replaced all Tailwind color classes with CSS variables (`bg-[var(--card)]`, `border-[var(--border)]`, `text-[var(--foreground)]`, etc.)
- **Files**:
  - `src/components/ui/QuickAddIdea.tsx`
  - `src/app/dashboard/ideas/page.tsx`
- **Impact**: Forms and modals now respect theme colors and are readable in both dark and light modes

#### 4. **Personal/Company Tab Not Clearly Active**
- **Issue**: The toggle switch between "Personal" and "Company" workspace tabs was barely visible — active state used `bg-[var(--card)]` (barely darker than background)
- **Fix**: 
  - Active button: `bg-[var(--primary)] text-white shadow-sm` (bright blue, high contrast)
  - Inactive button: `text-[var(--text-muted)] hover:text-[var(--text-sub)]` (muted text, hover effect)
  - Container: `bg-[var(--background)] rounded-lg p-[3px] flex gap-[2px] border border-[var(--border)]` (clear border and background separation)
- **File**: `src/app/dashboard/layout.tsx`
- **Impact**: Active workspace is now immediately clear to users

#### 5. **Dark/Light Theme Toggle Implementation**
- **Status**: NEW FEATURE — not previously implemented
- **Components**:
  1. **ThemeProvider** (`src/lib/context/theme.tsx` — NEW)
     - React Context with `{ theme, toggleTheme }`
     - Persists theme to `localStorage` key `cridl_theme`
     - Sets `data-theme` attribute on `<html>` element for CSS variable switching
     - Defaults to "dark" if no stored preference
  
  2. **CSS Variables** (`src/app/globals.css` updated)
     - Updated dark mode CSS variables for better contrast:
       - `--background: #0a0b10` (darker)
       - `--text-sub: #9095b0` (brighter)
       - `--text-muted: #505570` (improved)
       - `--border: #252830` (more visible)
     - Added full light mode theme block:
       ```css
       [data-theme="light"] {
         --background: #f4f5f7;
         --foreground: #111318;
         --card: #ffffff;
         --border: #d8dae3;
         --text-sub: #4a4f6a;
         --text-muted: #8b90a8;
         /* ... all 13 variables for light mode */
       }
       ```
  
  3. **App Layout** (`src/app/layout.tsx` updated)
     - Wrapped `<AuthProvider>` with `<ThemeProvider>`
     - Theme is now available app-wide via `useTheme()` hook
  
  4. **Theme Toggle Button** (`src/app/dashboard/settings/page.tsx` updated)
     - Added Sun/Moon icons (lucide-react)
     - Button placed left of "Save Changes" in Profile settings header
     - Shows "Light" or "Dark" label based on current theme
     - Title attribute shows context: "Switch to light mode" / "Switch to dark mode"
     - Styling: border, card background, hover effects use CSS variables

- **Files**: `src/lib/context/theme.tsx` (NEW), `src/app/globals.css`, `src/app/layout.tsx`, `src/app/dashboard/settings/page.tsx`
- **Impact**: Users can toggle between dark and light themes; preference persists across sessions

#### 6. **Error Handling Improvements**
- **Issue**: Ideas page had no error feedback when API calls failed
- **Fix**: Added comprehensive error handling:
  - `error` state variable to track API errors
  - Error banner UI displayed above the input form with dismiss button
  - HTTP error checks in `fetchIdeas()`, `handleAdd()`, `handleGenerate()` with appropriate user messages
  - Loading states (`adding`, `generating`) with disabled buttons
  - "Make sure your profile is filled in" hint for AI generation failures
- **Files**: `src/app/dashboard/ideas/page.tsx`, `src/components/ui/QuickAddIdea.tsx`
- **Impact**: Users see clear feedback when operations fail instead of silent failures

---

## Summary of Changes

| Component | Type | Impact |
|-----------|------|--------|
| Logout Icon | UX | Clear visual intent |
| Idea Bank DB Query | Architecture | All idea operations now work |
| Dark/Light Theme | Feature | Full theme switching with persistence |
| Color Accessibility | UX | All text/inputs readable in both themes |
| Active Tab Visibility | UX | Workspace switcher is clear |
| Error Feedback | UX | Users see API errors and loading states |

---

## Files Modified

1. `src/app/dashboard/layout.tsx` — LogOut icon + active tab styling
2. `src/app/dashboard/ideas/page.tsx` — Color fixes + error handling
3. `src/components/ui/QuickAddIdea.tsx` — Color fixes
4. `src/lib/db/ideas.ts` — **CRITICAL**: Firestore query fix
5. `src/lib/context/theme.tsx` — **NEW**: ThemeProvider
6. `src/app/globals.css` — Dark/light CSS variables + contrast improvements
7. `src/app/layout.tsx` — ThemeProvider wrapper

---

## Deployment

- **Commit**: `fix: idea bank saving + dark/light theme toggle`
- **Branch**: `linkedin-main`
- **Deploy Command**: `bash push-all.sh`
- **Status**: ✅ Deployed to Vercel (April 19, 2026)

---

## Testing Notes

- Build verified: `npx next build --webpack` passed with no errors
- Theme persistence: localStorage key `cridl_theme` stores "dark" or "light"
- Idea operations: Create, fetch, filter, AI generate all functional
- Error states: Invalid tokens, profile incomplete, HTTP errors all show user-facing feedback

---

## Future Considerations

- Theme preference could be synced to user's Firebase profile (optional persistence)
- System theme detection (prefers-color-scheme) could be added as fallback before localStorage
- Light mode contrast ratios meet WCAG AA standards
