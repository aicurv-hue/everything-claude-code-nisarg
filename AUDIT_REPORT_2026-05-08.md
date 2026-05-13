# Cridl — Full System Audit Report
**Date:** 2026-05-08  
**Scope:** Post Generation Flow (Part 1) + Image Generation Flow (Part 2)  
**Status:** Reflects all 2026-05-08 commits from CHANGES.md

---

## PART 1 — POST GENERATION FLOW

### 1.1 Entry Point: `/dashboard/create/page.tsx`

**Flow triggered by `handleGenerate()`:**

```
User clicks Generate
  ↓
[1] /api/ai/extract-context  (optional — URL or image attachment)
  ↓
[2] /api/ai/research          (edge route, 10-min in-memory cache)
  ↓
[3] /api/memory/get           (node route — Firestore user memory)
  ↓
[4] /api/ai/generate          (edge route — core Cortex post)
  ↓
Result stored in localStorage("latest_post")
  ↓
Redirect → /dashboard/create/preview
```

**Notes:**
- Profile model field is read from Firestore but **ignored** — always Gemini 2.5 Flash regardless.
- Source extraction errors use native `alert()` instead of `setGenerateError` — known UX bug (Bug #7).
- Research result is passed directly into the generate call body.

---

### 1.2 Stage 1: Source Extraction — `/api/ai/extract-context`

**Runtime:** Edge  
**Auth:** `verifyTokenEdge`  

**Two modes:**

| Mode | Mechanism |
|------|-----------|
| URL | Fetch with 8s timeout, HTML stripped to 3000 chars, SSRF-blocked |
| Image | Gemini 2.5 Flash multimodal (vision) |

**Image vision call:**
- Model: `google/gemini-2.5-flash`
- Temp: 0.2
- max_tokens: 400
- Returns: `{ urlContent, imageDescription }`

---

### 1.3 Stage 2: Research — `/app/api/ai/research/route.ts`

**Runtime:** Edge  
**Auth:** `verifyTokenEdge`  
**Cache:** In-memory Map, 10-min TTL, 200-entry LRU  

**Intent Detection (updated 2026-05-08):**
- Now imports `detectIntent` from `@/lib/ai/intent` (shared single source of truth)
- Returns `"personal"` or `"professional"`
- Gates 5 fields behind `isProfessional`: `niche`, `bioOrOffering`, `icp`, `jtbd`, `customerPains`

**Research AI call:**
- Model: `google/gemini-2.5-flash`
- Temp: 0.3
- max_tokens: 1500
- Timeout: 12s primary + 10s retry (same model)
- Falls back to synthetic stub if both attempts fail (generation never blocked)

**Returns:** `{ topic, summary, insights[3], references[], intentType }`

---

### 1.4 Shared Intent Module — `src/lib/ai/intent.ts` (NEW — 2026-05-08)

Pure, edge-safe, no Firestore/openrouter imports.

**`PERSONAL_SIGNALS` regex list:**

| Pattern | Covers |
|---------|--------|
| `/\bwatch(ed\|ing)\b/` | "watched Citadel", "watching Citadel" |
| `/\bsaw\b/` | past-tense see |
| `/\bseeing\b/` | gerund (professional "see" excluded) |
| `/\blisten(ed\|ing)\b/` | podcast consumption |
| `/\bread(ing)?\b/` | book/article |
| `/\bfilm\b/, /\bmovie\b/, /\bbook\b/, /\bpodcast\b/` | media nouns |
| `/\bsharing my thoughts?\b/` | reflective opener |
| `/\bjust (thinking\|reflecting)\b/` | reflective |
| `/\bmy (opinion\|view\|take)\b/` | opinion post |
| `/\bi (realized\|noticed\|felt)\b/` | personal reflection |
| `/\bpersonal(ly)?\b/` | explicit personal |
| `/\blife lesson\b/` | story |
| `/\bunpopular opinion\b/` | opinion |
| `/\brecently i\b/` | personal narrative |

Imported by both `research/route.ts` (edge) and `research.ts` (server action) — no drift possible.

---

### 1.5 Stage 3: Core Post Generation — `src/lib/ai/generate.ts` (777 lines)

**Entry function:** `generatePost(request: PostRequest)`

#### System Prompt Assembly (15 sections)

Sections pulled from `neel-prompt-sections.ts` (mirror of `NEEL_RUNTIME.md`):

```
IDENTITY + PERSONA_BLOCK
INTENT_DETECTION
HOOK_RULES
SEGMENT_RULES (Individual or Corporate based on workspace)
STRUCTURE_RULES
COPYWRITING_RULES
AI_SLOP_RULES
FORMATTING_RULES
OUTPUT_RULES
+ dynamic blocks below
```

**Dynamic blocks appended:**

1. **Client Profile block** — brand context
2. **Research context** — summary + insights from Stage 2
3. **Writing samples** — capped 2500 chars
4. **Memory context** — Firestore user memory, capped 2000 chars
5. **Regeneration trail** — anchor + last 2 turns + elided count (if regen)

#### Brand Context Gating (post 2026-05-08 fix)

| Field | Personal | Professional |
|-------|----------|--------------|
| `name` | ✅ | ✅ |
| `roleOrIndustry` | ✅ | ✅ |
| `wordsToAvoid` | ✅ (negative constraint only) | ✅ |
| `personality` | ❌ stripped | ✅ |
| `verbatimLanguage` | ❌ stripped | ✅ |
| `niche` | ❌ stripped | ✅ |
| `icp` | ❌ stripped | ✅ |
| `jtbd` | ❌ stripped | ✅ |
| `customerPains` | ❌ stripped | ✅ |
| `pillars`, `usp`, `bioOrOffering`, `companyStage` | ❌ stripped | ✅ |

**Writing Samples gating (post 2026-05-08 fix):**
- Professional: full `buildWritingSamplesBlock()` (capped 2500 chars)
- Personal: only `style_notes` lines survive — `summary` and `keywords` stripped

**Personal top-override rule (7 rules, post 2026-05-08):**
- Rule 7 explicitly bans brand phrases referencing LinkedIn/posting/your-product from appearing in personal posts

#### Generation Call

- Model: `google/gemini-2.5-flash`
- Temp: `0.72` (normal) / `0.95` (regeneration)
- max_tokens: `1200`
- Timeout: 12s primary + 10s retry (AbortController)
- `finish_reason` must be `"stop"` AND output length ≥ 200 chars (`isUsableCompletion` guard)
- Final guard: throws if post < 100 chars after sanitization

#### `sanitizePost()` strips:
- Preambles ("Here's a LinkedIn post…", "Sure, here is…", etc.)
- Trailing explanations ("This post uses…", "Note:", etc.)
- Literal asterisks (LinkedIn renders them literally)

#### Stage 3b — Image Prompt Generation

After post is drafted:
- Model: `google/gemini-2.5-flash`
- Temp: 0.7
- max_tokens: 500
- Uses `IMAGE_PROMPT_SYSTEM` + `IMAGE_PROMPT_USER` from `neel-prompt-sections.ts`
- Returns image prompt string attached to post result

#### Stage 1.5 — Voice Rewrite Pass (auto, every generation)

After Stage 3:
- Runs `REWRITE_IN_VOICE_PROMPT` with user profile + writing samples
- Helper: `src/lib/ai/rewriteInVoice.ts`
- Silent fallback to original draft if call fails or output < threshold
- Also wired into Pro+ campaign generator

---

### 1.6 Regeneration Memory

**Firestore path:** `regeneration_sessions/{sessionId}`

**Structure:**
```json
{
  "anchor": "<original post text>",
  "turns": [
    { "text": "...", "comment": "user instruction" },
    { "text": "...", "comment": "..." }
  ]
}
```

- Max 10 turns
- Prompt includes: anchor + last 2 turns + "(N earlier turns elided)"
- Auto-cleaned on save / schedule / publish

---

### 1.7 Usage / Quota

**Route:** `/api/usage/check` (pre-flight, edge)  
**Timing:** Quota incremented **before** the model call  
**Refund on failure:** ❌ **None** — post quota is never refunded if generation fails

---

### 1.8 Quota Gate (API route)

**File:** `src/app/api/ai/generate/route.ts`  
**Runtime:** Edge  
1. `verifyTokenEdge`
2. POST `/api/usage/check?action=post` — if not OK, return 402
3. Call `generatePost()`
4. Return generated post

---

### 1.9 Server Action — `src/lib/ai/research.ts`

- `"use server"` — not edge-safe
- Now also imports `detectIntent` from `./intent` (same gate logic)
- Also calls Gemini 2.5 Flash (temp 0.3, max_tokens 1500)
- Persists to Firestore `research_history`
- **No live caller found in current codebase** — suspected dead code (Bug #4b)

---

### 1.10 BUGS — Part 1

| # | Severity | File | Bug |
|---|----------|------|-----|
| 1 | High | `api/ai/generate/route.ts` | No quota refund path on generation failure. Quota incremented pre-flight, never returned on model error/timeout/safety filter. |
| 4b | Low | `lib/ai/research.ts` | `performResearch()` has no live callers — dead code adding maintenance surface. |
| 6 | Medium | `lib/ai/generate.ts` | `max_tokens: 1200` too tight for `long` posts (380–420 words ≈ 560–620 tokens + system prompt overhead). Both retry attempts can fail. Consider 1600. |
| 7 | Low | `dashboard/create/page.tsx:178` | Source extraction error uses native `alert()` instead of `setGenerateError` — inconsistent UX. |

---

---

## PART 2 — IMAGE GENERATION FLOW

### 2.1 Three Image Modes

| Mode | Trigger | Model | Pattern |
|------|---------|-------|---------|
| AI Infographic | "Generate Image" button on preview | `fal-ai/gpt-image-2` | Submit → poll (queue) |
| Carousel | "Build Carousel" — N slides | `fal-ai/gpt-image-2` (N parallel) | Submit → poll × N |
| Face | "Generate Face" — LinkedIn photo merge | `fal-ai/flux-pulid` | Synchronous POST |

---

### 2.2 Prompt Chain for AI Infographic

**Step A — Image Prompt Generation** (`/api/ai/image-prompt` or Stage 3b in generate):

System prompt (`IMAGE_PROMPT_SYSTEM` from `neel-prompt-sections.ts`):
```
Modern minimal SaaS infographic, square 1:1, [dark|light] mode.

Style: premium editorial (Apple/Stripe/Linear quality). 
Palette: #0B1220 (dark bg) OR #F7F8FA (light bg) + #FFFFFF text + ONE accent from [#0A66C2 | #FF7A29 | #10B981].
Layout zones (top→bottom):
  TOP: large bold quoted headline (biggest text element)
  MIDDLE: 2-4 icon+label blocks (flat SVG icons, max 4 words each)
  ACCENT: one callout pill / highlight band (stat or punchy phrase)
  BOTTOM: CTA or takeaway line

Hard rules:
  - ≤ 30 words total in-image text
  - No people, faces, hands, bodies
  - No photography, cinematic, photoreal
  - No gradients (except subtle dark-to-darker)
  - No AI-cliché: brain, circuit, robot, neural network
  - No 3D, watercolour, sketch
  - No watermarks, logos, brand marks
  - Begin output with: "Modern minimal SaaS infographic, square 1:1..."
```

User prompt template (`IMAGE_PROMPT_USER`):
```
Post topic: {topic}
Key insight: {topInsight}
Tone: {tone}
Mode: {dark|light}
Generate an image prompt following the system spec exactly.
```

**Step B — gpt-image-2 submission** (`lib/ai/image.ts::submitImageJob`):

```json
POST https://queue.fal.run/fal-ai/gpt-image-2
{
  "prompt": "<generated prompt>",
  "image_size": "square_hd",
  "quality": "medium",
  "num_images": 1,
  "output_format": "png"
}
```

Returns: `{ request_id }`

**Step C — Polling** (`lib/ai/image.ts::pollImageJob`):

```
GET https://queue.fal.run/fal-ai/gpt-image-2/requests/{id}/status
  → IN_QUEUE / IN_PROGRESS
  → COMPLETED → GET .../result → images[0].url
  → FAILED → throw
```

**Step D — Re-host to Firebase Storage** (`/api/image/upload-url`):

- fal CDN URLs would fail CORS in `<img>` tags
- Re-hosted to `gs://cridl.firebasestorage.app/generated-images/{uid}/{timestamp}.png`
- Returns permanent Firebase Storage URL

---

### 2.3 Client-Side Orchestration — `src/lib/ai/clientImage.ts`

```
generateImageClient({ prompt, token })
  ↓
POST /api/image/generate          → { request_id }
  ↓
Poll GET /api/image/generate?id=  every 2s
  deadline: 90s
  ↓
COMPLETED → return fal CDN url
FAILED    → throw error
Timeout   → throw "Image generation timed out."
```

---

### 2.4 API Route — `/api/image/generate/route.ts`

**Runtime:** Edge  
**Auth:** `verifyTokenEdge`

**POST (submit):**
1. Auth check
2. POST `/api/usage/check` action:`"image"` — if not OK, return early
3. `submitImageJob(prompt)` → `{ request_id }`

**GET (poll):**
1. Auth check
2. `pollImageJob(id)`
3. If `FAILED` → fire-and-forget POST `/api/usage/refund` action:`"image"`
4. Return status

**Refund logic:**
- Refund only fires on poll returning FAILED
- No refund if submit step itself throws (Bug #2)

---

### 2.5 Carousel Flow

**Route:** `/api/ai/carousel-prompts` → `generateCarouselPrompts()`

- Model: Gemini 2.5 Flash
- Temp: 0.75
- max_tokens: 1100
- Returns N image prompts as JSON array (one per slide)

**Execution:**
- N parallel `generateImageClient()` calls (no concurrency cap)
- N parallel Firebase Storage uploads
- Per-slide refinement via `refineCarouselPrompt()` (temp 0.7, max_tokens 280)

---

### 2.6 Face Image Flow — `/api/image/face-generate/route.ts`

**Runtime:** Node (no `export const runtime` — defaults to Node)  
**Auth:** Firebase Admin SDK (`adminAuth.verifyIdToken`)  
**Plan gate:** Blocks Free plan users

**Quota:** `checkAndIncrementUsage(uid, "faceImage")` — direct Firestore increment

**Reads:** `profilePhotoUrl` from Firestore `profiles/{uid}`

**Style Prompts (`STYLE_PROMPTS` constant — hardcoded in route file):**
```js
{
  professional: "professional business attire, corporate setting, natural lighting",
  creative:     "creative professional, modern workspace, artistic lighting",
  casual:       "smart casual attire, friendly approachable look, natural setting",
  executive:    "executive business professional, premium suit, confident pose",
}
```

**fal.ai call:**
```json
POST https://fal.run/fal-ai/flux-pulid
{
  "reference_images": [{ "url": "<profilePhotoUrl>" }],
  "prompt": "Portrait of a professional person, {stylePrompt}, high quality photography, sharp focus, LinkedIn profile photo style[, relevant to the topic: {postTopic}]",
  "image_size": "square_hd",
  "num_inference_steps": 28,
  "num_images": 1
}
```

**IMPORTANT:** This is **synchronous** (not queue). `fal.run` not `queue.fal.run`. flux-pulid runs 15–25s. Vercel Node function timeout is 10s by default on Hobby/Pro plans.

---

### 2.7 Dead Code

| File | Function | Status |
|------|----------|--------|
| `lib/ai/image.ts` | `generateImageFromPrompt()` | No live callers — wraps submit+poll but clientImage.ts is used instead |

---

### 2.8 BUGS — Part 2

| # | Severity | File | Bug |
|---|----------|------|-----|
| 2 | Medium | `api/image/generate/route.ts` | No refund on **submit** failure. If `submitImageJob()` throws after quota was already charged, the user loses the credit permanently. |
| 3 | High | `api/image/face-generate/route.ts` | **No abort timeout.** flux-pulid is synchronous and takes 15–25s. Vercel Node default timeout is 10s → silent 504 to the client. Also: **no refund on failure** — quota charged pre-call, never returned. |
| 4a | Low | `lib/ai/image.ts` | `generateImageFromPrompt()` has no live callers — dead code. |
| 5 | Low | `api/image/face-generate/route.ts` | `STYLE_PROMPTS` hardcoded in route file. Per CLAUDE.md: "Cortex prompt → edit NEEL_RUNTIME.md only." Should move to `NEEL_RUNTIME.md` + `neel-prompt-sections.ts`. |
| 8 | Low | `lib/ai/image.ts` + `neel-prompt-sections.ts` | `gpt-image-2` called with `quality: "medium"` but `IMAGE_PROMPT_SYSTEM` promises "premium editorial (Apple/Stripe/Linear quality)". Consider bumping to `"high"` or aligning the language. |

---

---

## OPEN BUGS SUMMARY (8 total — prioritized)

| Priority | # | Severity | Description |
|----------|---|----------|-------------|
| 1 | 1 | High | Refund `post` quota on `/api/ai/generate` failure |
| 2 | 2 | Medium | Refund image/face quota on **submit** failure (not just poll-FAILED) |
| 3 | 3 | High | Add abort timeout to `face-generate` (15–25s call vs 10s Vercel Node limit) + refund on failure |
| 4 | 4a/4b | Low | Delete dead code: `image.ts::generateImageFromPrompt()` + `research.ts::performResearch()` |
| 5 | 5 | Low | Move `face-generate::STYLE_PROMPTS` to `NEEL_RUNTIME.md` |
| 6 | 6 | Medium | Bump `max_tokens` to ~1600 for `long` posts in `generate.ts` |
| 7 | 7 | Low | Replace `alert()` in source extraction error path with `setGenerateError` |
| 8 | 8 | Low | Align `gpt-image-2 quality:"medium"` with "premium editorial" language in IMAGE_PROMPT_SYSTEM |

---

## RESOLVED (2026-05-08 commits)

| Fixed | Details |
|-------|---------|
| Intent regex drift | `intent.ts` created — both research paths now import from single source; gerund forms added |
| Brand context bleed (personal) | `verbatimLanguage` + `personality` now gated behind `isProfessional` in `generate.ts` |
| Research route personal-intent gap | `jtbd` + `customerPains` now also stripped on personal intent in `research/route.ts` |
| Writing samples bleed (personal) | Personal intent now strips `summary` + `keywords`; only `style_notes` survives |
| Personal top-override | 7th rule added explicitly banning brand phrases referencing LinkedIn/posting/product |

---

*Report generated: 2026-05-08. Reflects live codebase state post all May 8 commits.*
