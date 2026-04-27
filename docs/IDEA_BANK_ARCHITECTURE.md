# Idea Bank Architecture & Fix Documentation

_Updated: 2026-04-19_

## Overview

The Idea Bank feature allows users to save content ideas (manually or via AI suggestions) and convert them to posts. This document explains the architecture, the bug that broke it, and the fix applied.

---

## Data Model

### ContentIdea (Firestore Document)

Located in: `firestore.users/{user_id}/ideas/{idea_id}`

```ts
interface ContentIdea {
  id?: string;
  title: string;
  description?: string;
  pillar?: string;              // Content category (e.g., "Leadership", "AI Trends")
  suggestedTone?: string;       // "professional" | "storytelling" | "educational" | "contrarian"
  suggestedAudience?: string;   // "Founders & CEOs" | "Marketers & Growth" | "Engineers & Devs"
  source: "manual" | "ai_suggested";
  status: "active" | "used" | "archived";
  segment: "individual" | "corporate";  // Dual workspace
  user_id: string;
  created_at: Timestamp;
  updated_at?: Timestamp;
}
```

---

## API Routes

### `POST /api/ideas` — Create Idea
```ts
// Request
{
  title: string;
  description?: string;
  segment: "individual" | "corporate";
  source: "manual" | "ai_suggested";
}

// Response
{ id: string; ideas: ContentIdea[] }
```

### `GET /api/ideas?segment=individual` — Fetch Ideas
```ts
// Response
{ ideas: ContentIdea[] }
```

### `PATCH /api/ideas` — Update Idea (status)
```ts
// Request
{
  id: string;
  status: "active" | "used" | "archived";
}

// Response
{ ok: boolean }
```

### `DELETE /api/ideas?id={id}` — Delete Idea
```ts
// Response
{ ok: boolean }
```

### `POST /api/ideas/generate` — AI Generate Ideas (10 at a time)
```ts
// Request
{
  segment: "individual" | "corporate";
  count: number;  // default 10
}

// Response
{ ideas: ContentIdea[] }
```

---

## The Bug: Firestore Composite Index Issue

### Symptom
Ideas page showed "Loading ideas..." forever, then "No ideas yet" even after saving ideas or clicking "AI Suggestions." The fetch always returned an empty array.

### Root Cause
The original `getAll()` method in `src/lib/db/ideas.ts` performed a three-field query:

```ts
// ❌ BROKEN CODE
const ideas = await col()
  .where("user_id", "==", userId)
  .where("segment", "==", segment)
  .orderBy("created_at", "desc")
  .limit(100)
  .get();
```

**Why this fails:**
- Firestore requires a **composite index** to query on multiple fields with an orderBy clause
- The composite index for (`user_id` + `segment` + `created_at`) was never created
- Firestore silently fails the query without throwing an error — it just returns 0 documents
- This is a silent failure, not an exception, so error handling didn't catch it

### The Fix
Follow CLAUDE.md rule: **"Single `where(user_id)` + in-memory filter. Never two `where` clauses on different fields."**

```ts
// ✅ FIXED CODE
async getAll(userId: string, segment: string, statusFilter?: string) {
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
      return tb - ta;  // Descending
    });
  
  if (statusFilter) {
    ideas = ideas.filter((i) => i.status === statusFilter);
  }
  
  return ideas.slice(0, 100);
}
```

**Why this works:**
- Single `where("user_id")` — no composite index needed
- In-memory filter for `segment` — fast for typical user volumes (10–100 ideas per user)
- In-memory sort by `created_at` — JavaScript sort is deterministic
- Slice to 100 limit — prevents returning huge result sets

---

## Performance Implications

### Before Fix
- Firestore query: ❌ Failed silently
- Result: Always empty array
- User experience: Broken feature

### After Fix
- Firestore query: 1x read (all ideas for user, regardless of segment)
- Memory filter + sort: O(n log n), where n = ideas for user (typically < 200)
- Result: Correct filtered & sorted ideas
- User experience: ✅ Working

**Cost**: 
- Slightly higher Firestore read cost (single query instead of composite index)
- Negligible in practice — user has only ~100 ideas max
- Trade-off: Simplicity + no index management vs. Firestore composite index maintenance

---

## UI Layer

### Idea Bank Page (`src/app/dashboard/ideas/page.tsx`)

#### State Management
```ts
const [ideas, setIdeas] = useState<Idea[]>([]);
const [loading, setLoading] = useState(true);
const [generating, setGenerating] = useState(false);
const [adding, setAdding] = useState(false);
const [error, setError] = useState<string | null>(null);
const [filter, setFilter] = useState<"all" | "active" | "ai_suggested" | "manual" | "used">("active");
```

#### Actions

**Fetch Ideas**
```ts
const fetchIdeas = useCallback(async () => {
  if (!user) return;
  try {
    const token = await getAuthToken();
    if (!token) { setLoading(false); return; }
    const res = await fetch(`/api/ideas?segment=${segment}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setIdeas(data.ideas || []);
  } catch (err) {
    console.error("[ideas] fetch failed", err);
    setError("Failed to load ideas. Please refresh.");
  } finally {
    setLoading(false);
  }
}, [user, segment]);
```

**Add Idea**
```ts
async function handleAdd() {
  if (!addTitle.trim()) return;
  setAdding(true);
  setError(null);
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: addTitle.trim(), segment, source: "manual" }),
    });
    if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
    setAddTitle("");
    setShowAdd(false);
    await fetchIdeas();
  } catch (err: any) {
    console.error("[ideas] add failed", err);
    setError(err.message || "Failed to save idea.");
  } finally {
    setAdding(false);
  }
}
```

**Generate AI Ideas**
```ts
async function handleGenerate() {
  setGenerating(true);
  setError(null);
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/ideas/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ segment, count: 10 }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as any).error || `HTTP ${res.status}`);
    }
    await fetchIdeas();
  } catch (err: any) {
    console.error("[ideas] generate failed", err);
    setError(err.message || "AI generation failed. Make sure your profile is filled in.");
  } finally {
    setGenerating(false);
  }
}
```

#### Filtering
```ts
const filtered = ideas.filter((i) => {
  if (filter === "all") return true;
  if (filter === "active") return i.status === "active";
  if (filter === "used") return i.status === "used";
  if (filter === "ai_suggested") return i.source === "ai_suggested" && i.status === "active";
  if (filter === "manual") return i.source === "manual" && i.status === "active";
  return true;
});
```

---

## AI Generation Pipeline

### Quick Generation (10 ideas at once)

Route: `POST /api/ideas/generate`

**Flow:**
1. User clicks "AI Suggestions" button
2. Sends `{ segment, count: 10 }` to `/api/ideas/generate`
3. Server fetches user's profile (identity, audience, branding, voice)
4. Calls OpenRouter with a prompt to generate 10 idea titles + descriptions + suggested tone/audience
5. Parses response into `ContentIdea[]` objects
6. Saves to Firestore with `source: "ai_suggested"` + `status: "active"`
7. Returns ideas to UI
8. UI calls `fetchIdeas()` to refresh the grid

**Model:** Gemini 2.0 Flash (primary) or GPT-4o-mini (fallback)

---

## Segment Isolation

All idea operations are **segment-specific**:
- Individual workspace: ideas saved under segment "individual"
- Corporate workspace: ideas saved under segment "corporate"
- Fetch always filters by current segment
- Users cannot mix workspaces

---

## Error Handling

### User-Facing Errors
| Error | Message | Action |
|-------|---------|--------|
| No auth token | (Implicit: redirect to login) | Session expired |
| HTTP error on fetch | "Failed to load ideas. Please refresh." | Network or server issue |
| HTTP error on add | "Failed to save idea." | Server error |
| HTTP error on generate | "AI generation failed. Make sure your profile is filled in." | Profile incomplete or API issue |

### Error Banner UI
```tsx
{error && (
  <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-800/40 text-red-400 text-sm">
    <span className="flex-1">{error}</span>
    <button onClick={() => setError(null)} className="font-bold hover:opacity-70">×</button>
  </div>
)}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `src/app/dashboard/ideas/page.tsx` | UI: Idea Bank page, grid, filters, actions |
| `src/lib/db/ideas.ts` | Database layer: CRUD + query |
| `src/app/api/ideas/route.ts` | API endpoint: POST/PATCH/DELETE |
| `src/app/api/ideas/generate/route.ts` | API endpoint: AI generation |
| `src/components/ui/QuickAddIdea.tsx` | Modal: Add idea inline (legacy, less used) |

---

## Testing Checklist

- [ ] Create idea manually — saves with source "manual"
- [ ] Fetch ideas — returns only ideas for current segment
- [ ] Filter by "Active" / "AI" / "Manual" / "Used" — shows correct subset
- [ ] Click "AI Suggestions" — generates 10 ideas with tone + audience
- [ ] Click "Use This Idea" — navigates to create page with prefilled fields
- [ ] Archive idea — moves to archived status, hidden from active view
- [ ] Delete idea — permanently removes from collection
- [ ] Error on no token — shows login redirect
- [ ] Error on incomplete profile — shows "Make sure your profile is filled in"
- [ ] Dark theme — all colors readable
- [ ] Light theme — all colors readable

---

## Future Enhancements

- Search/fuzzy filter over ideas by title
- Bulk delete/archive
- Duplicate idea option
- Edit idea after creation
- AI regenerate tone/audience suggestions for an idea
- Sort by date, source, tone
- Idea tags / custom categories
