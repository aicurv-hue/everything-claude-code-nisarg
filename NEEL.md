# NEEL — Complete Input Documentation

> Neel is the AI author powering LinkAuto. This document covers every input layer that reaches Neel, how each one influences the output, where it is set, and what happens when it is missing.
>
> **Purpose:** Ensure zero data loss between the user's intent and Neel's generation. Every blank field is a missed opportunity for post quality.

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
         ▼
[Layer G] Memory Extraction (fire-and-forget)
    → Summary + Keywords saved to memory for next time
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
- `customerPains` — research probes pain points the audience feels *(added in audit fix)*

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
| `keywords` | 5–10 concrete keywords (extracted by gpt-4o-mini) |
| `style_notes` | **NEW** — 1-sentence style fingerprint: sentence rhythm, vocabulary register, data usage, voice markers |
| `segment` | individual or corporate (kept separate) |
| `created_at` | Timestamp — used for recency scoring |

**Memory entries can now be deleted** by the user from `/dashboard/memory`. Hover any entry to reveal the delete (trash) icon. Deleting removes it from Neel's future context immediately.

### Relevance Scoring (pure JS — zero tokens):
```
score = keyword overlap with current topic words × 2
      + audience exact match × 1.5
      + tone match × 1
      − 0.5 for each 30-day period past the first month (recency decay)
```

If no relevant matches exist (score = 0 for all), the 3 most recent entries are used as a continuity fallback.

### What Neel does with memory (updated behaviour):

**VOICE & STYLE — always applied first:**
- Mirror the writing style from `style_notes` — sentence rhythm, vocabulary, data density
- The post must sound like the same person who wrote past posts
- No personality drift, no invented humor or vocabulary

**TOPIC CONTINUITY — applied based on overlap:**
- If same/related topic: decide whether to deepen the thread (Part 2) OR add a new dimension
- Do NOT always pivot to a completely different angle — sometimes the next post should build directly on the last (deepening the argument, adding a case study, giving "what to do next")
- Avoid restating the EXACT same argument with different words
- If topic is different from past posts: write fresh, reference established positioning if relevant

**What Neel never does with memory:**
- Never invents a story arc that contradicts past posts
- Never pivots so sharply that the post sounds like a different author

**Individual and Corporate memories are completely separate.** Switching segment gives Neel a different memory pool.

---

## Layer D — Brand Profile

**Where set:** Settings page (`/dashboard/settings`) — 5 tabs
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
| System Prompt | `systemPrompt` | Appended AFTER all built-in rules. Overrides or extends Neel's default behaviour. |

**⚠️ Critical: Settings are segment-specific.** Individual and Corporate have completely independent profiles. If Corporate profile is blank, Neel writes without brand context for corporate posts.

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

## Layer G — Memory Extraction (Output → Future Input)

**Where run:** After `generatePost()` returns, fire-and-forget
**File:** `src/lib/ai/memory-extract.ts`
**Model used:** `openai/gpt-4o-mini` (cheapest — ~$0.0002 per call)

After every successful generation, this runs silently:
1. Takes the generated post content + topic + audience + tone
2. Sends a compact AI call asking for:
   - 2-sentence summary (angle taken + core argument)
   - 5–10 concrete keywords
   - **1-sentence style fingerprint** — sentence rhythm, vocabulary register, data usage, voice markers
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
- **In-memory Set** (`publishingIds`) — prevents two concurrent cron calls in the same Node process from publishing the same post twice (local dev protection)
- **Firestore status `"processing"`** — post disappears from `getScheduled()` results immediately; if server restarts mid-publish, the post stays in `"processing"` and is not re-fetched

**Memory is saved only on confirmed LinkedIn publish** — not on draft save or scheduling. `savePostMemory` is called in the cron worker after LinkedIn confirms success.

### Image Mode in Scheduled Posts

Three modes stored on the post:
| Mode | Stored as | Worker behaviour |
|------|-----------|-----------------|
| `ai` | `image_url = null` initially; AI generates after scheduling | Generates AI image at schedule time if `image_url` is missing |
| `upload` | `image_url = Firebase Storage HTTPS URL` | User image uploaded to Storage at schedule time (10s timeout); worker uses stored URL |
| `none` | `image_url = null`, `image_mode = "none"` | Worker posts text-only; no image |

`data:` URL images (local files) are **uploaded to Firebase Storage** at schedule time via `uploadDataUrlToStorage()` so the worker can retrieve them later. A 10s `Promise.race` timeout prevents the scheduling dialog from hanging if Storage is unavailable.

### Engagement Tracking

Likes and comments are synced hourly via the cron worker's engagement sync block.

**Fields added to Post:**
- `likes_count` — LinkedIn reaction count
- `comments_count` — LinkedIn comment count
- `engagement_synced_at` — unix ms timestamp of last sync

**Sync flow:**
1. After publishing due posts, worker fetches all published posts from last 30 days
2. Filters those not synced in the last hour (max 20 per run)
3. Calls `/api/linkedin/engagement` with their `linkedin_post_id` URNs
4. Updates `likes_count`, `comments_count`, `engagement_synced_at` in Firestore

**Visible in:**
- `/dashboard/history` — Engagement column (👍 likes · 💬 comments)
- `/dashboard` — Total Engagement stat card (sum of all likes + comments)
- PostDetailDrawer — Likes / Comments cards on published posts

---

## Bugs Found & Fixed During Audit

| # | Bug / Issue | Fix Applied |
|---|---|---|
| 1 | Model name `google/gemini-2.0-flash-001` in settings — doesn't exist on OpenRouter | Changed to `google/gemini-2.0-flash` |
| 2 | `customerPains` never passed to research — Neel didn't probe pain points | Added to research `clientContext` |
| 3 | Empty profile fields appeared as `"undefined"` in prompt | Filter-before-append — only non-empty fields included |
| 4 | Dynamic Tailwind class purged at build time | Replaced with static conditional strings |
| 5 | Dashboard stats didn't refresh on segment switch | Fixed `loadAll()` dependency array |
| 6 | Create page used disconnected local segment state | Replaced with `useSegment()` context |
| 7 | **Hallucination** — Neel invented family members, locations, personal stories not in the profile. Root cause: `segmentVoice` said "draw on personal experience" with no grounding facts. | Added explicit `⛔ NO FABRICATION` rule: never invent family, locations, named clients, or personal events not in the profile or research. If no personal story available, use industry-level observation or a researched example instead. |
| 8 | **Always-different-angle** — memory continuity rule #1 forced Neel to always pivot to a new angle, even when deepening the same thread was the right call. Resulted in jarring topic jumps. | Replaced binary "always different" rule with nuanced logic: if topic is same, decide whether to deepen (Part 2) or add a new dimension — don't always pivot. Style consistency takes priority over angle diversity. |
| 9 | **Voice drift** — memory only stored topic angles, not HOW the user writes. After several posts, Neel's style drifted away from the user's natural voice. | Added `style_notes` field to `PostMemory` and `MemoryExtract`. Memory extraction now captures 1-sentence style fingerprint (sentence rhythm, vocabulary, data usage). Neel mirrors this in all future posts. |
| 10 | **No memory delete** — users couldn't remove bad/hallucinated entries from memory. Once stored, a wrong entry kept influencing future posts. | Added `memoryService.delete(id)` method + hover-to-reveal trash button on every memory entry in `/dashboard/memory`. |

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
| Profile `verbatimLanguage` empty | Neel uses generic professional language | Fill in Settings → Customer Voice — put exact phrases your customers say |
| Profile `wordsToAvoid` empty | Neel may use your banned words | Fill in Settings → Customer Voice |
| Profile `usp` empty | No differentiation from competitors | Fill in Settings → Branding |
| Memory empty (new user) | No continuity — Neel writes without history | Grows automatically with every generation |
| Corporate profile blank | Corporate posts get no brand context | Fill in Settings with Corporate selected |

---

## File Map

| File | Role |
|---|---|
| `Master_Neel_Prompt.md` | **Single source of truth for all of Neel's prompt text** — edit here to change behaviour, no code changes needed |
| `src/app/dashboard/create/page.tsx` | Collects Layers A, E — triggers full pipeline |
| `src/lib/ai/research.ts` | Runs Layer B — research pipeline |
| `src/lib/db/memory.ts` | Stores + retrieves Layer C — memory |
| `src/lib/ai/memory-extract.ts` | Extracts Layer G — post-generation memory indexing |
| `src/lib/ai/generate.ts` | Reads `Master_Neel_Prompt.md`, assembles prompt, calls Neel |
| `src/lib/db/profiles.ts` | Stores Layer D — brand profile |
| `src/app/dashboard/settings/page.tsx` | UI for Layers D + F |
| `src/app/dashboard/memory/page.tsx` | Dashboard for Layer C — view Neel's memory bank |
| `src/lib/context/segment.tsx` | Global segment state (individual/corporate) |
| `src/lib/ai/openrouter.ts` | OpenRouter client — `DEFAULT_MODEL: google/gemini-2.0-flash` |
| `src/lib/ai/save-memory.ts` | Shared helper — `savePostMemory()` called after confirmed LinkedIn publish |
| `src/lib/storage/uploadImage.ts` | Uploads `data:` URL images to Firebase Storage; returns HTTPS URL |
| `src/app/api/cron/publish-due/route.ts` | Cron worker — finds due posts, claims them, publishes to LinkedIn, syncs engagement |
| `src/app/api/linkedin/engagement/route.ts` | Fetches likes + comments from LinkedIn `/v2/socialActions/{urn}` |
| `vercel.json` | Vercel Cron config — triggers `/api/cron/publish-due` every minute in production |

### How Master_Neel_Prompt.md works

`generate.ts` reads this file at runtime and parses it into named sections separated by `---`. Each section has a `## SECTION_NAME` header. Dynamic values use `{{PLACEHOLDER}}` syntax and are substituted at call time.

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
| `IMAGE_PROMPT_SYSTEM` | Rules for the image generation prompt |
| `IMAGE_PROMPT_USER` | Template for image user turn. `{{TOPIC}}`, `{{SEGMENT}}`, `{{POST}}` filled at runtime |

**In development:** file is re-read on every generation call — edit and save `Master_Neel_Prompt.md` and the next generation uses the new rules instantly.
**In production:** file is cached after first read for performance.

---

*Last audited: 2026-03-25 | Pipeline version: 4.1 (Scheduling + Engagement + Duplicate-publish prevention)*
