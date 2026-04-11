# NEEL — Complete Pipeline Documentation

> Neel is the AI author powering Cridl. This document covers every input layer that reaches Neel, how each one influences the output, where it is set, and what happens when it is missing.
>
> **Purpose:** Single source of truth for building user SOPs, internal onboarding, and future feature design. Keep this updated whenever `generate.ts`, `research.ts`, memory, profiles, settings, or the create/preview pages change.

---

## How Neel Works — Pipeline Overview

```
User fills Create form
         │
         ▼
[Layer A] Post Parameters ──────────────────────────────────┐
         │                                                   │
         ▼                                                   │
[Layer B] Research (Stage 1 & 2) ── Sub-questions → Insights│
         │                                                   │
         ▼                                                   ▼
[Layer C] Memory Context ─────────► Neel generates post ◄───┤
         │                                                   │
         ▼                                                   │
[Layer D] Brand Profile (from Settings) ────────────────────┤
         │                                                   │
         ▼                                                   │
[Layer E] Custom Instructions (per-post) ───────────────────┤
         │                                                   │
         ▼                                                   │
[Layer F] Profile System Prompt (from Settings AI tab) ─────┘
         │
         ▼
    Post + Image Prompt
         │
         ├──► [Layer G] Image Style Prefix (from Settings Image Style tab)
         │              prepended to every image prompt before fal.ai call
         │
         ├──► [Layer H] Image Hook Text (on-demand, preview page)
         │              separate Gemini call → 7-word overlay text on image
         │
         ▼
[Layer I] Memory Extraction (fire-and-forget)
    → Summary + Keywords + Style fingerprint saved to memory for next time
```

---

## Layer A — Post Parameters

**Where set:** Create Post page (`/dashboard/create`)
**Passed to:** `performResearch()` + `generatePost()`

| Field | Type | Options | Effect on Neel |
|---|---|---|---|
| `topic` | Free text | Any | The core idea. Drives research sub-questions and the entire post angle. **Most critical input.** |
| `tone` | Enum | professional, storytelling, educational, contrarian | Selects a specific hook formula. Each tone has a distinct opening pattern with ✅/❌ examples baked in. |
| `audience` | Enum | founders, marketers, engineers, general | Research is filtered to surface insights valuable to this audience. Neel frames every claim from their perspective. |
| `length` | Enum | short (~100w), medium (~200w), long (~400w) | Sets exact word-count range and paragraph count in the prompt. Neel is given an explicit spec: "180–250 words, 5–7 paragraphs." |
| `segment` | Context | individual, corporate | Switches entire voice mode. Individual = first-person, grounded in profile facts only. Corporate = company voice, business outcomes, named proof. |

**AI Context sidebar (right panel on Create page) shows:**
- Active AI writer model
- Active niche
- Active brand voice
- **Active image style** (new — shows which visual style will be applied to generated images)
- Memory count (number of past posts Neel has read)

**What happens if topic is vague?**
Research falls back to generic sub-questions (trends, pain points, statistics) — the post will be weaker. Specific topics = specific research = better hooks.

---

## Layer B — Research Output

**Where generated:** `src/lib/ai/research.ts`
**Passed to:** `generatePost()` as `research: ResearchResult`

This is a 2-stage process run before Neel writes anything.

### Stage 1 — Sub-question Generation
The AI generates 4–5 targeted research questions based on `topic + tone + audience + segment + clientProfile`. These focus on: statistics, trends, surprising insights, pain points, and audience-specific outcomes.

**Example sub-questions for topic "AI in legal tech", audience "founders":**
```
1. What % of legal discovery time can AI reduce — and what's the dollar impact per case?
2. Which law firms have deployed AI and what were the results?
3. What are founders getting wrong about AI adoption in legal workflows?
4. What does the 2025 data say about AI vs. human accuracy in contract review?
```

### Stage 2 — Research Synthesis
Each sub-question is answered and synthesised into:

| Field | Description | Used by Neel |
|---|---|---|
| `summary` | 2–3 sentence executive summary with the KEY finding | Neel reads this first — it sets the post's central claim |
| `insights[]` | Array of `{ title, content, source }` — specific findings with data | Neel draws EVERY claim from these — no fabrication allowed |
| `references[]` | URLs of sources | Shown on preview sidebar; stored in DB |

**Profile fields used in research:**
- `icp` — research focuses on this exact buyer profile
- `niche` / `roleOrIndustry` — contextualises the industry angle
- `bioOrOffering` — ensures research is relevant to the author's product/service
- `jtbd` — research surfaces insights aligned to what customers are hiring the author for
- `customerPains` — research probes pain points the audience feels

**What happens if research fails?**
A graceful fallback is used: `"Research on [topic] could not be completed. The post will be generated from the topic alone."` — Neel still writes but without data-backed claims. Quality drops significantly.

---

## Layer C — Memory Context

**Where stored:** Firestore `post_memories` collection / localStorage mock
**Where retrieved:** `src/lib/db/memory.ts` → `memoryService.getRelevant()`
**Passed to:** `generatePost()` as `memoryContext: PostMemory[]`

After the first post is generated, Neel builds a persistent memory of everything he has written. Before each new generation, the top 5 most relevant past posts are retrieved and injected into his prompt.

### What is stored in each memory entry:

| Field | Description |
|---|---|
| `topic` | The original topic used |
| `audience` | Audience targeted |
| `tone` | Tone used |
| `summary` | 2-sentence summary: angle taken + core argument made |
| `keywords` | 5–10 concrete keywords (extracted by AI) |
| `style_notes` | 1-sentence style fingerprint: sentence rhythm, vocabulary register, data usage, voice markers |
| `segment` | individual or corporate (kept separate) |
| `created_at` | Timestamp — used for recency scoring |

**Memory entries can be deleted** by the user from `/dashboard/memory`. Hover any entry to reveal the delete (trash) icon. Deleting removes it from Neel's future context immediately.

### Relevance Scoring (pure JS — zero tokens):
```
score = keyword overlap with current topic words × 2
      + audience exact match × 1.5
      + tone match × 1
      − 0.5 for each 30-day period past the first month (recency decay)
```

If no relevant matches exist (score = 0 for all), the 3 most recent entries are used as a continuity fallback.

### What Neel does with memory:

**VOICE & STYLE — always applied first:**
- Mirror the writing style from `style_notes` — sentence rhythm, vocabulary, data density
- The post must sound like the same person who wrote past posts
- No personality drift, no invented humor or vocabulary

**TOPIC CONTINUITY — applied based on overlap:**
- If same/related topic: decide whether to deepen the thread (Part 2) OR add a new dimension
- Do NOT always pivot to a completely different angle — sometimes the next post should build directly on the last (deepening the argument, adding a case study, giving "what to do next")
- Avoid restating the EXACT same argument with different words
- If topic is different from past posts: write fresh, reference established positioning if relevant

**Individual and Corporate memories are completely separate.** Switching segment gives Neel a different memory pool.

---

## Layer D — Brand Profile

**Where set:** Settings page (`/dashboard/settings`) — 6 tabs
**Passed to:** `performResearch()` as `clientProfile` + `generatePost()` as `clientProfile`
**File:** `src/lib/db/profiles.ts`

This is the most impactful layer after the topic itself. Every field is a non-negotiable constraint for Neel.

### Tab 1 — Identity

| Field | Key | Effect |
|---|---|---|
| Full Name / Company Name | `name` | Neel writes in your name — "I built X" vs "CompanyName achieved X" |
| Role / Industry | `roleOrIndustry` | Sets the authority context — framing your expertise |
| Expertise / Niche | `niche` | Neel stays in this lane — every post reinforces your niche authority |
| Personal Bio / Company Overview | `bioOrOffering` | Provides narrative context — Neel references your story/offering naturally |

### Tab 2 — Audience Strategy

| Field | Key | Effect |
|---|---|---|
| Ideal Customer Profile (ICP) | `icp` | Research sub-questions are aimed at this exact buyer. Neel frames outcomes for them. |
| Company Stage / Audience Stage | `companyStage` | Calibrates language — seed founders vs. enterprise buyers need different framing |
| Jobs to be Done (JTBD) | `jtbd` | The single most important audience signal. Research probes what they're "hiring" you for. |

### Tab 3 — Branding

| Field | Key | Effect |
|---|---|---|
| Content Pillars | `pillars` | Neel stays inside these topic clusters — reinforces topical authority |
| Brand Personality / Tone | `personality` | Layered on top of the post tone — "authoritative yet conversational" shapes sentence rhythm |
| Unique Selling Proposition | `usp` | Neel can work this in naturally — differentiates every post from competitors |

### Tab 4 — Customer Voice

| Field | Key | Effect |
|---|---|---|
| Core Pains & Emotional Tensions | `customerPains` | Neel opens wounds before closing them — hooks become more visceral |
| Verbatim Language | `verbatimLanguage` | Exact phrases your customers use — Neel weaves these in so readers feel seen |
| Words to Avoid | `wordsToAvoid` | Hard ban — Neel will never use these. Example: "synergy, leverage, paradigm shift" |

### Tab 5 — AI Config

| Field | Key | Effect |
|---|---|---|
| Model | `model` | Which LLM Neel uses for this segment. Each segment can have a different model. |
| System Prompt | `systemPrompt` | Appended AFTER all built-in rules. Overrides or extends Neel's default behaviour. Use for persistent per-segment dos/don'ts. |

### Tab 6 — Image Style *(new in v1.2)*

| Field | Key | Effect |
|---|---|---|
| Image Style | `imageStyle` | Selects the visual art style applied to every AI-generated image for this segment. Saved per-segment (Individual and Corporate can have different styles). |

**Available image styles:**

| Style ID | Label | What the prefix instructs fal.ai |
|---|---|---|
| `photo` | 📷 Photo | Cinematic editorial photography, ultra-realistic, natural lighting, shallow depth of field |
| `illustration` | 🎨 Illustration | Soft editorial illustration, warm linework, hand-crafted texture, muted ink palette |
| `abstract` | 🔷 Abstract | Abstract conceptual art, geometric shapes, emotion-driven composition, premium editorial |
| `3d` | 🧊 3D Render | Photorealistic 3D render, volumetric lighting, depth, cinematic quality, editorial style |
| `lineart` | ✏️ Line Art | Minimal black ink line art on white, clean strokes, no fill, sketch style |
| `bw_photo` | ⬛ B&W Photo | Cinematic black and white photography, high contrast, film grain, editorial style, desaturated |

**How it works:** When the user saves a style, the corresponding prefix string is prepended to every AI-generated image prompt by `generate.ts` before it reaches fal.ai. This locks the visual rendering medium across all posts. The underlying emotional/compositional prompt is still generated by Neel per-post — the style prefix constrains HOW it looks, not WHAT it shows.

**⚠️ Critical: Image style is segment-specific.** Individual and Corporate can have completely independent visual identities. If no style is set, images are generated without a style constraint (Neel's cinematic editorial defaults still apply).

---

## Layer E — Custom Instructions

**Where set:** Create Post page — "Custom AI Instructions" collapsable panel
**Passed to:** `generatePost()` as `customInstructions`
**Priority: HIGHEST** — overrides everything else in the prompt.

This is a per-post override. Use it for:
- "Start with a shocking stat"
- "Include a statistic from the energy sector"
- "No hashtags"
- "Keep it under 150 words"
- "Mention BEAPL valves specifically"
- "DO NOT mention competitors"

**Quick-add chips available:** Use a question as the hook, Include a statistic, Start with a story, No hashtags, Keep it under 150 words, Use bullet points.

**What happens if left blank?** Neel uses his default rules. Custom instructions are optional but powerful for specific campaign requirements.

---

## Layer F — Profile System Prompt

**Where set:** Settings → AI Config tab → "Profile-Specific System Prompt"
**Passed to:** `generatePost()` as `systemPrompt`
**Priority:** High — appended after built-in rules, before custom instructions.

This is Neel's persistent persona layer for this segment. The default contains the Gold-Standard LinkedIn format rules. You can customise it to:
- Add industry-specific copywriting rules
- Set recurring narrative themes
- Enforce specific structural patterns
- Give Neel persistent dos/don'ts that apply to every post in this segment

**⚠️ Warning:** Modifying this affects every future post in this segment until changed. The UI shows a "Custom Prompt Active" warning badge.

---

## Layer G — Image Style Prefix *(new in v1.2)*

**Where set:** Settings → Image Style tab
**Where applied:** `src/lib/ai/generate.ts` — `generatePost()` and `generateImagePrompt()`
**Route:** `/api/ai/image-prompt` also accepts and forwards `imageStyle`

**Flow:**
1. User selects a style in Settings → Image Style → Save
2. Style is stored in `ProfileSegment.imageStyle` in Firestore
3. On Create page load, `activeProfile.imageStyle` is read from the fetched profile
4. When generating, `imageStyle` is sent in the request body to `/api/ai/generate`
5. `generatePost()` reads `IMAGE_STYLE_PREFIXES[imageStyle]` and prepends it to the Neel-generated image prompt before returning
6. Same prefix logic applies on standalone image-prompt regeneration (`handleRegenerateImagePrompt` on preview page reads `imageStyle` from `localStorage.client_profile`)

**Key file:** `src/lib/ai/generate.ts` — `IMAGE_STYLE_PREFIXES` constant map

**Fixed frame rules applied regardless of style:**
- No full faces (partial/profile/chest-down only)
- Always **square 1:1** (`square_hd` 1024×1024) — fills full width on mobile LinkedIn feed *(updated v1.3)*
- TEXT ZONE RULE: top-left quadrant (top 45%, left 50%) must be dark/clean negative space — reserved for hook text overlay. Subject always in center-right or lower-right.

---

## Layer H — Image Hook Text Overlay *(new in v1.2)*

**Where:** Preview page (`/dashboard/create/preview`) — "Image Hook Text" panel below the image
**Route:** `POST /api/ai/image-hook` (Edge Runtime)
**Function:** `generateImageHook(post, topic)` in `src/lib/ai/generate.ts`
**Model:** `google/gemini-2.0-flash-001`, temperature 0.85, max_tokens 30

**What it is:** A ≤7-word punchy question or bold statement overlaid as text on the generated/uploaded image. Rendered in **Plus Jakarta Sans weight 800** (OpenAI Codex-style typography) in the top-left zone of the image. A diagonal gradient (`rgba(0,0,0,0.62)` top-left → transparent at 58%) provides legibility without obscuring the subject. Hook text width is constrained to 44% of the image (left zone only) — the subject is always on the right. *(Updated v1.3)*

**How it works:**
1. User generates or uploads an image on the preview page
2. "Image Hook Text" panel appears below the image
3. User clicks "Generate Hook" — Gemini generates a 7-word-max hook from the post content
4. Hook is shown in an editable input field — user can tweak it freely
5. Hook is displayed live on the image as a CSS overlay (bottom gradient + bold white text)
6. Hook is saved as `image_hook` field on the Post object when drafting, publishing, or scheduling

**Why on-demand (not auto-generated):**
Adding an automatic hook generation on every image generation would add a second sequential OpenRouter call to an already-slow pipeline. Making it manual keeps the UX fast and lets users skip it entirely for posts where a text overlay doesn't fit.

**Stored on Post:** `image_hook?: string` in `src/lib/db/posts.ts`

---

## Layer I — Memory Extraction (Output → Future Input)

**Where run:** After `generatePost()` returns, fire-and-forget
**File:** `src/lib/ai/memory-extract.ts`
**Model used:** `openai/gpt-4o-mini` (cheapest — ~$0.0002 per call)

After every successful generation, this runs silently:
1. Takes the generated post content + topic + audience + tone
2. Sends a compact AI call asking for:
   - 2-sentence summary (angle taken + core argument)
   - 5–10 concrete keywords
   - 1-sentence style fingerprint — sentence rhythm, vocabulary register, data usage, voice markers
3. Saves all three fields to the `post_memories` collection
4. This entry becomes available for all future generations in this segment

**Failure is silent** — if extraction fails, the post still saves and the user is not affected. The memory just doesn't grow for that post.

**User can delete memory entries** from `/dashboard/memory` — hover any entry to see the trash icon. This is important when a bad/hallucinated post has been stored and must be purged before it poisons future generations.

---

## Complete Prompt Architecture (Neel's System Prompt Order)

```
1. Neel's identity + OUTPUT RULES (hardcoded — never changes)
2. POST PARAMETERS (tone, audience, word count, hook formula)
3. SEGMENT VOICE (individual vs corporate — hardcoded rules)
4. STRUCTURE (hook → body → CTA → hashtags — exact format)
5. COPYWRITING RULES (7 rules — specificity, benefits, clarity, etc.)
6. BRAND CONTEXT (from Layer D — profile fields)
7. PROFILE SYSTEM PROMPT (from Layer F — settings AI tab)
8. MEMORY CONTEXT (from Layer C — top 5 relevant past posts)     ← grows over time
9. CUSTOM INSTRUCTIONS (from Layer E — per-post override)         ← highest priority

Then (post-prompt, not in system prompt):
10. IMAGE STYLE PREFIX (from Layer G) prepended to image prompt output
11. IMAGE HOOK (from Layer H) — separate call, not part of Neel's prompt
```

**User prompt (sent as the `user` turn):**
```
Topic, Tone, Audience, Length, Segment
Research summary
Key insights (numbered list from research)
"Start directly with the hook line."
```

---

## Scheduling & Publishing Pipeline

### How Scheduled Posts Publish

Posts with `status: "scheduled"` are picked up by the cron worker at `/api/cron/publish-due`.

**Two triggers:**
1. **Vercel Cron** — fires every minute in production (configured in `vercel.json`)
2. **CronPoller** — client-side component in `DashboardLayout`, polls every 60s in local dev

**Worker flow per due post:**
```
1. Re-fetch all posts with status === "scheduled" that are past scheduled_at
2. Claim each post immediately → status = "processing" (prevents duplicate publish)
3. In-memory lock (publishingIds Set) — second concurrent call skips in-flight posts
4. Refresh LinkedIn access token if expired or within 5 min of expiry
5. Upload image to LinkedIn Images API (if image_url is set and not a data: URL)
6. POST to LinkedIn /rest/posts
7. Mark post as "published" + store linkedin_post_id
8. Fire-and-forget: save to Neel's memory (savePostMemory)
9. On failure: mark post as "failed"
```

**Duplicate publish prevention** (two-layer):
- **In-memory Set** (`publishingIds`) — prevents two concurrent cron calls in the same Node process from publishing the same post twice
- **Firestore status `"processing"`** — post disappears from `getScheduled()` results immediately; if server restarts mid-publish, the post stays in `"processing"` and is not re-fetched

### Image Mode in Scheduled Posts

| Mode | Stored as | Worker behaviour |
|------|-----------|-----------------|
| `ai` | `image_url = null` initially | Generates AI image at schedule time if `image_url` is missing |
| `upload` | `image_url = Firebase Storage HTTPS URL` | User image uploaded to Storage at schedule time (10s timeout); worker uses stored URL |
| `none` | `image_url = null`, `image_mode = "none"` | Worker posts text-only; no image |

`data:` URL images are **uploaded to Firebase Storage** at schedule time via `uploadDataUrlToStorage()` so the worker can retrieve them later. A 10s `Promise.race` timeout prevents the scheduling dialog from hanging if Storage is unavailable.

### Engagement Tracking

Likes and comments are synced hourly via the cron worker's engagement sync block.

**Fields on Post:**
- `likes_count` — LinkedIn reaction count
- `comments_count` — LinkedIn comment count
- `engagement_synced_at` — unix ms timestamp of last sync

**Sync flow:**
1. After publishing due posts, worker fetches all published posts from last 30 days
2. Filters those not synced in the last hour (max 20 per run)
3. Calls `/api/linkedin/engagement` with their `linkedin_post_id` URNs
4. Updates `likes_count`, `comments_count`, `engagement_synced_at` in Firestore

**Visible in:** History page, Dashboard stat cards, PostDetailDrawer

---

## What Happens When Fields Are Missing

| Missing Field | Impact on Post Quality | Action |
|---|---|---|
| `topic` is vague | Research uses generic sub-questions → weak, generic insights | Be specific: include numbers, contexts, questions |
| Profile `name` empty | Neel writes without author attribution | Fill in Settings → Identity |
| Profile `niche` empty | Posts lack authority positioning | Fill in Settings → Identity |
| Profile `icp` empty | Research is audience-agnostic | Fill in Settings → Audience |
| Profile `jtbd` empty | Research doesn't probe what customers need most | Fill in Settings → Audience |
| Profile `customerPains` empty | Hooks lack emotional resonance | Fill in Settings → Customer Voice |
| Profile `verbatimLanguage` empty | Neel uses generic professional language | Fill in Settings → Customer Voice |
| Profile `wordsToAvoid` empty | Neel may use banned words | Fill in Settings → Customer Voice |
| Profile `usp` empty | No differentiation from competitors | Fill in Settings → Branding |
| Profile `imageStyle` not set | Images generated without visual style lock — inconsistent across posts | Choose a style in Settings → Image Style |
| Memory empty (new user) | No continuity — Neel writes without history | Grows automatically with every generation |
| Corporate profile blank | Corporate posts get no brand context | Fill in Settings with Corporate selected |

---

## Bugs Found & Fixed (Full History)

| # | Bug / Issue | Fix Applied |
|---|---|---|
| 1 | Model name `google/gemini-2.0-flash-001` in settings — doesn't exist on OpenRouter | Changed to `google/gemini-2.0-flash` |
| 2 | `customerPains` never passed to research — Neel didn't probe pain points | Added to research `clientContext` |
| 3 | Empty profile fields appeared as `"undefined"` in prompt | Filter-before-append — only non-empty fields included |
| 4 | Dynamic Tailwind class purged at build time | Replaced with static conditional strings |
| 5 | Dashboard stats didn't refresh on segment switch | Fixed `loadAll()` dependency array |
| 6 | Create page used disconnected local segment state | Replaced with `useSegment()` context |
| 7 | **Hallucination** — Neel invented family members, locations, personal stories not in the profile | Added `⛔ NO FABRICATION` rule in `SEGMENT_INDIVIDUAL` and `SEGMENT_CORPORATE` |
| 8 | **Always-different-angle** — memory rule forced pivot every time | Replaced with nuanced logic: deepen (Part 2) or new dimension — don't always pivot |
| 9 | **Voice drift** — memory stored angles but not HOW the user writes | Added `style_notes` field — 1-sentence style fingerprint extracted per post |
| 10 | **No memory delete** — bad entries poisoned future posts | Added `memoryService.delete(id)` + hover-reveal trash button on `/dashboard/memory` |
| 11 | **`[BLANK LINE]` appearing literally in posts** | Rewrote STRUCTURE section with plain English instructions |
| 12 | **Cliché image prompts** (gears, circuits, glowing orbs) | Rewrote `IMAGE_PROMPT_SYSTEM`: bans gears/circuits/holograms, requires human-centered scenes |
| 13 | **`fs.readFileSync` crashes on Edge Runtime** | Inlined all sections as TS constants in `neel-prompt-sections.ts` |
| 14 | **FUNCTION_INVOCATION_TIMEOUT** on `/api/ai/generate` and `/api/ai/research` | Converted both routes to Edge Runtime |
| 15 | **OAuth callback 504 GATEWAY_TIMEOUT** | Fire-and-forget DB save; reduced profile fetch timeout; converted callback to Edge Runtime |
| 16 | **Scheduled posts always failing** — tokens saved to wrong collection | Fixed `COLLECTION = "tokens"` in `src/lib/db/tokens.ts` |
| 17 | **No LinkedIn disconnect button** | Added Disconnect button to Settings + `POST /api/auth/linkedin/disconnect` |
| 18 | **Dashboard FAILED_PRECONDITION** — composite Firestore index missing | Removed `orderBy` from Firestore query; sort done in JS |
| 19 | **OpenRouter 400 error** — invalid model ID | Changed to `google/gemini-2.0-flash-001` across all routes |
| 20 | **Image style not applied on initial generation** — create page didn't send `imageStyle` | Added `imageStyle: activeProfile?.imageStyle` to generate request in `create/page.tsx` |
| 21 | **6 settings tabs overflowing tab bar** — `px-4` padding too wide for 6 tabs | Reduced to `px-3` — all 6 tabs now fit in one row without scrolling |

---

## File Map

| File | Role |
|---|---|
| `Master_Neel_Prompt.md` | **Human-editable source of truth** for all Neel prompt text — edit here, then sync to `neel-prompt-sections.ts` |
| `src/lib/ai/neel-prompt-sections.ts` | **Inlined TS constants** for every prompt section — Edge Runtime compatible |
| `src/app/dashboard/create/page.tsx` | Collects Layers A, E — triggers full pipeline; shows active image style in AI Context sidebar |
| `src/app/dashboard/create/preview/page.tsx` | Editable post preview — image picker, image overlay + hook editor, schedule button, Regenerate Post/Image |
| `src/lib/ai/research.ts` | Runs Layer B — Edge Runtime, 2-stage research pipeline |
| `src/lib/ai/generate.ts` | Assembles prompt, calls Neel via OpenRouter. Exports `generatePost()`, `generateImagePrompt()`, `generateImageHook()`. Contains `IMAGE_STYLE_PREFIXES` map. |
| `src/lib/db/memory.ts` | Stores + retrieves Layer C — memory |
| `src/lib/ai/memory-extract.ts` | Extracts Layer I — post-generation memory indexing |
| `src/lib/db/profiles.ts` | Stores Layer D — brand profile. Contains `ImageStyle` type and `imageStyle` field on `ProfileSegment`. |
| `src/lib/db/posts.ts` | Post CRUD. Contains `image_hook` field (Layer H overlay text). |
| `src/app/dashboard/settings/page.tsx` | UI for Layers D + F + Image Style (6 tabs) + LinkedIn connect/disconnect |
| `src/app/dashboard/memory/page.tsx` | Dashboard for Layer C — view + delete Neel's memory entries |
| `src/lib/context/segment.tsx` | Global segment state (individual/corporate) |
| `src/lib/ai/openrouter.ts` | OpenRouter client — `DEFAULT_MODEL: google/gemini-2.0-flash-001` |
| `src/lib/ai/save-memory.ts` | `savePostMemory()` — called after confirmed LinkedIn publish |
| `src/lib/storage/uploadImage.ts` | Uploads `data:` URL images to Firebase Storage; returns HTTPS URL |
| `src/lib/db/tokens.ts` | LinkedIn token CRUD — saves to `tokens` collection (matches cron reader) |
| `src/app/api/ai/generate/route.ts` | Edge Runtime — POST, passes full body to `generatePost()` including `imageStyle` |
| `src/app/api/ai/research/route.ts` | Edge Runtime — POST runs 2-stage research |
| `src/app/api/ai/image-prompt/route.ts` | Edge Runtime — POST regenerates image prompt standalone, accepts `imageStyle` |
| `src/app/api/ai/image-hook/route.ts` | **New (v1.2)** — Edge Runtime — POST generates 7-word hook text via `generateImageHook()` |
| `src/app/api/auth/linkedin/callback/route.ts` | Edge Runtime — OAuth callback |
| `src/app/api/auth/linkedin/disconnect/route.ts` | POST clears all `li_*` cookies (disconnect) |
| `src/app/api/cron/publish-due/route.ts` | Cron worker — claims posts, refreshes tokens, publishes to LinkedIn, syncs engagement |
| `src/app/api/linkedin/engagement/route.ts` | Fetches likes + comments from LinkedIn API |
| `vercel.json` | Vercel Cron config — triggers `/api/cron/publish-due` every minute |
| `push-all.sh` | **Always use this to push** — deploys to Vercel + updates all branches |

### How neel-prompt-sections.ts works

`generate.ts` imports `NEEL_SECTIONS` from `neel-prompt-sections.ts` — a TypeScript constant containing all prompt sections. Dynamic values use `{{PLACEHOLDER}}` syntax substituted at call time.

`Master_Neel_Prompt.md` is the human-readable copy. When you edit it, **manually sync the changed section** into `neel-prompt-sections.ts` to apply in production.

| Section | Controls |
|---|---|
| `IDENTITY` | Neel's core persona and role statement |
| `OUTPUT_RULES` | Hard rules — no preamble, no labels, start with hook |
| `HOOK_PROFESSIONAL / STORYTELLING / EDUCATIONAL / CONTRARIAN` | Per-tone hook formulas with ✅/❌ examples |
| `SEGMENT_INDIVIDUAL` | First-person voice + NO FABRICATION prohibition |
| `SEGMENT_CORPORATE` | Company voice + NO FABRICATION prohibition |
| `STRUCTURE` | Full post structure (hook → body → CTA → hashtags). `{{PARAGRAPHS}}` filled at runtime |
| `COPYWRITING_RULES` | 7 hard rules applied to every sentence |
| `FORMATTING` | Emoji, line break, ALL CAPS limits |
| `IMAGE_PROMPT_SYSTEM` | Rules for image prompt generation — now includes FIXED FRAME RULES (v1.2) |
| `IMAGE_PROMPT_USER` | Template for image user turn. `{{TOPIC}}`, `{{SEGMENT}}`, `{{POST}}` filled at runtime |

---

## SOP — User Onboarding Checklist

> Use this as a step-by-step guide for new users or when onboarding a client.

### Step 1 — Connect LinkedIn
- Go to **Settings** → Click **Connect LinkedIn**
- Authorise the app — you'll be redirected back automatically
- Status should show **Connected** with your name

### Step 2 — Fill Your Individual Profile
Go to **Settings → Identity tab** (with Individual selected):
- [ ] Full Name
- [ ] Current Role
- [ ] Expertise / Niche
- [ ] Personal Bio

Go to **Settings → Audience tab**:
- [ ] Ideal Customer Profile (ICP)
- [ ] Jobs to be Done (JTBD)

Go to **Settings → Branding tab**:
- [ ] Content Pillars (3–5 topics)
- [ ] Brand Personality / Tone
- [ ] Unique Selling Proposition

Go to **Settings → Customer Voice tab**:
- [ ] Customer Pains
- [ ] Verbatim Language (exact phrases customers say)
- [ ] Words to Avoid

### Step 3 — Set Your Image Style
Go to **Settings → Image Style tab**:
- [ ] Select a visual style for your posts
- [ ] Recommended starting point: **📷 Photo** (cinematic editorial photography)
- [ ] Click **Save Changes**

### Step 4 — Generate Your First Post
- Go to **Create Post**
- Enter a specific topic (include a number or question for better research)
- Select tone, audience, length
- Check AI Context sidebar — confirm your niche, brand voice, and image style are shown
- Click **Research & Generate Post**

### Step 5 — Review on Preview Page
- Edit the post text if needed
- Select **AI Generate** for image → click **Generate Image**
- Optionally click **Generate Hook** to add a text overlay on the image
- **Schedule** or **Publish directly**

### Step 6 — Repeat & Refine
- After 3–5 posts, Neel's memory grows and posts become more consistent
- Check **Memory** page to see what Neel has stored
- If a post was bad, delete its memory entry to prevent it from influencing future posts

---

## SOP — Internal Team Reference

### Changing Neel's Writing Behaviour
1. Edit the relevant section in `Master_Neel_Prompt.md`
2. Copy the changed section into the matching key in `src/lib/ai/neel-prompt-sections.ts`
3. Test locally — `npm run dev`, generate a post, check output
4. Push via `bash push-all.sh`

### Adding a New Image Style
1. Add the style ID to `ImageStyle` type in `src/lib/db/profiles.ts`
2. Add the prefix string to `IMAGE_STYLE_PREFIXES` in `src/lib/ai/generate.ts`
3. Add the style card metadata to `IMAGE_STYLES` array in `src/app/dashboard/settings/page.tsx`
4. Document it in the Image Style table in this file
5. Push via `bash push-all.sh`

### Deploying
**Always** use `bash push-all.sh` — never `git push` directly. The script pushes to:
- `linkedin/main` → triggers Vercel production deploy
- `linkedin/linkedin-main` → GitHub development branch
- `origin/linkedin-main` → ECC repo mirror

### Environment Variables (Vercel)
| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | AI generation (Neel, research, image prompts, hook) |
| `FAL_API_KEY` | Image generation via fal.ai |
| `FIREBASE_*` | Firestore + Auth |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | OAuth |
| `ADMIN_EMAILS` | Comma-separated list of admin dashboard users |
| `BETA_APPROVED_EMAILS` | Comma-separated list of beta access users |
| `CRON_SECRET` | Secures `/api/cron/publish-due` — passed as `x-cron-secret` header |

---

---

## Changelog

### v4.3 — 2026-03-28 (Brand-Consistent Image System)
- Layer G: Image Style Prefix system (6 art styles, per-segment)
- Layer H: Image Hook Text overlay (on-demand Gemini call, 7-word max)
- Fixed Frame Rules added to image prompt system
- Tab 6 (Image Style) added to Settings page

### v4.3.1 — 2026-03-28 (Mobile-First Image Format)
- **Image format** changed from `landscape_4_3` → `square_hd` (1024×1024) — fills full width on mobile LinkedIn feed
- **Hook typography** upgraded to Plus Jakarta Sans weight 800 (OpenAI Codex-style) via `next/font/google`
- **TEXT ZONE RULE** updated for square 1:1: top-left quadrant (top 45%, left 50%) reserved for hook text, subject always center-right or lower-right
- Hook text width constrained to 44% of image to prevent subject overlap
- Diagonal gradient (top-left dark → transparent) replaces bottom-bar gradient
- `Master_Neel_Prompt.md` updated to v1.3 with all square format rules
- `neel-prompt-sections.ts` updated with square TEXT ZONE RULE and FIXED FRAME RULES

*Last audited: 2026-03-28 | Pipeline version: 4.3.1 (Mobile-First Square Images + Codex Hook Typography)*
