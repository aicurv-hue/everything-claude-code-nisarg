# HOW IT WORKS — LinkAuto End-to-End Feature Documentation

Last updated: 2026-04-09

---

## 1. LinkedIn OAuth Flow

**Entry point:** `/dashboard/settings` → "Connect LinkedIn" button → `/api/auth/linkedin`

### Step-by-step:
1. `/api/auth/linkedin` generates a 32-char random hex state token, encodes `returnTo` URL + Firebase UID into it, stores in httpOnly cookie for CSRF protection, then redirects to LinkedIn OAuth v2 authorize URL.
2. Scopes requested: `openid profile email w_member_social w_organization_social`
3. LinkedIn redirects back to `/api/auth/linkedin/callback` with `code` + `state`.
4. Callback validates state (CSRF check), exchanges code for tokens via LinkedIn, fetches user profile (4s timeout fallback), then:
   - Stores tokens in **Firestore** `tokens/{firebaseUID}` (via `/api/tokens/save`) — this is the source of truth for API calls
   - Also stores in **httpOnly cookies** as secondary fallback
5. Redirects back to original page with `?linkedin_connected=true`.

### Token fields stored:
`access_token`, `refresh_token`, `user_sub`, `user_name`, `user_email`, `user_picture`, `expires_at`, `refresh_expires_at`

### Token refresh:
- Cron checks if `expires_at` is within 5 minutes → calls LinkedIn token refresh endpoint → updates Firestore
- Manual reconnect in Settings always gets a fresh token

---

## 2. Direct Publishing (Individual & Corporate)

**Entry point:** `/dashboard/create/preview` → "Publish to LinkedIn" button

### Client-side flow:
1. `getAuthToken()` fetches Firebase ID token from client
2. POST to `/api/linkedin/publish` with Bearer token + `{ content, imageUrl, segment, organizationId, topic, audience, tone }`
3. On success: show "Published!" banner, fire-and-forget `createPost()` to Firestore
4. On failure: show error message from API response

### Server-side (`/api/linkedin/publish`):
1. Verify Firebase Bearer token (Admin SDK, Node runtime)
2. Fetch LinkedIn tokens from Firestore `tokens/{firebaseUID}`
3. Resolve author URN:
   - Individual → `urn:li:person:{user_sub}`
   - Corporate → `urn:li:organization:{organizationId}` (from request body or user profile)
4. If image provided: upload to LinkedIn Images API (3-step: initializeUpload → fetch bytes from fal.ai URL → PUT to LinkedIn upload URL)
5. POST to LinkedIn `/rest/posts` API (v202505)
6. Return `postId` from `x-restli-id` response header

### Error handling:
- 422 or 400 with "organization permission" → returns `PARTNER_APPROVAL_REQUIRED` code + message to use Schedule
- Other LinkedIn errors → parse error body, return readable message

---

## 3. Scheduled Publishing (Cron)

**Trigger:** cron-job.org hits `/api/cron/publish-due` every hour (also browser-polled every 5min on Schedule page)

### Flow:
1. Auth: only `CRON_SECRET` header or Vercel cron header accepted
2. Query Firestore `posts` where `status = "scheduled"` and `scheduled_at <= now`
3. For each post (in-memory lock prevents duplicates):
   a. Atomic Firestore transaction: `scheduled → processing`
   b. Fetch LinkedIn token from `tokens/{user_id}`
   c. Refresh token if expired or within 5min of expiry
   d. Resolve author URN (from post record → user profile → env fallback)
   e. Upload image if provided
   f. POST to LinkedIn `/rest/posts`
   g. Update post: `status → published`, add `linkedin_post_id`, `published_at`
   h. Fire-and-forget memory save
4. Returns `{ processed, published, failed, results[] }`

### Notes:
- Runs across ALL users (not per-user)
- Engagement sync intentionally disabled — LinkedIn Partner API required

---

## 4. AI Research Pipeline

**Entry point:** `/dashboard/create` → submit form → server action `performResearch()`

### Flow (`src/lib/ai/research.ts`):
1. Single OpenRouter call using `google/gemini-2.0-flash-001`
2. System prompt instructs structured JSON output: `{ summary, insights: [{title, content, source}], references }`
3. Input: topic + metadata (segment, tone, audience, length, client profile)
4. Output stored in Firestore `research_history` (client-side, non-blocking)
5. Result passed to generate step

### Why single call:
Previously two sequential calls (sub-questions → synthesis) exceeded Vercel's 60s timeout. Consolidated to one combined call.

---

## 5. AI Post Generation (Neel)

**Entry point:** Research result → server action `generatePost()` OR preview page "Regenerate"

### Flow (`src/lib/ai/generate.ts`):
1. Load `Master_Neel_Prompt.md` at runtime → extract named sections
2. Assemble system prompt: Neel identity + brand profile + no-fabrication rules + no-asterisk rules
3. Assemble user prompt: research insights + memory context (top-5 scored) + writing samples + custom instructions + source material
4. Call OpenRouter with user's configured model (default: `google/gemini-2.0-flash-001`)
5. On 5xx/429: retry with `openai/gpt-4o-mini` fallback
6. Sanitize output: strip AI preambles, markdown headers, asterisks
7. Return `{ post, imagePrompt }`

### Memory context injection:
- Fetch top-5 memories by relevance score (keyword overlap + audience/tone match + recency decay)
- If no relevant matches (score ≤ 0): fall back to 3 most recent

### Brand profile injected:
name, role, niche, ICP, content pillars, personality, USP, bioOrOffering, customer pains, verbatim language, words to avoid, style_notes

---

## 6. Image Generation

### Mode 1: AI Generate (`/api/image/generate`)
1. Client calls with Bearer token + `{ prompt }`
2. Server verifies token, calls fal.ai `generateImageFromPrompt`
3. Returns `{ url, prompt }`

### Mode 2: Use My Face (`/api/image/face-generate`)
1. Client calls with Bearer token + `{ backgroundStyle, postTopic }`
2. Server reads `profilePhotoUrl` from Firestore `profiles/{uid}`
3. Constructs prompt with style prefix + topic context
4. Calls fal.ai `/fal-ai/flux-pulid` (flux model with reference face image)
5. Returns generated image URL

### Image styles available (AI Generate + face):
`photo | illustration | abstract | 3d | lineart | bw_photo` — each has a detailed cinematic prompt prefix

### Image upload to LinkedIn:
On publish, if image URL present: initializeUpload → fetch image bytes → PUT to LinkedIn upload URL → use returned `image` asset URN in post body

---

## 7. Campaigns

**Entry point:** `/dashboard/campaigns/new` → 3-step wizard

### Step 1 — Parameters:
User enters: topic, audience, tone, post_count (N), frequency_days, segment, length, custom_instructions
Campaign saved to Firestore `campaigns` collection with `status: draft`

### Step 2 — Generate & Review (`/api/campaigns/[id]/generate`):
1. Single research call for the campaign topic
2. Fetch brand profile (segment-specific)
3. Fetch 3 most recent memories for voice consistency
4. **Sequential generation** for each of N posts:
   - System prompt: brand profile + recent style + specs + custom instructions
   - User prompt: research + ALL prior posts in campaign (builds narrative forward)
   - Each post gets unique angle instruction
   - Saved to Firestore `posts` with `campaign_id`, `campaign_position`, `status: draft`
5. Returns array of posts with IDs

### Step 3 — Schedule & Activate (`/api/campaigns/[id]/activate`):
1. Input: `start_date`, `timezone`, `frequency_days`
2. Fetch all draft posts for campaign
3. Calculate: `scheduled_at = startMs + (position * frequency_days * 86400000)`
4. Batch update all posts: `status → scheduled`, add `scheduled_at`
5. Update campaign: `status → active`

### UI features:
- Per-post image drawer (4 modes: AI Generate, Use My Face, Upload, No Image)
- Auto-save on edit (1.5s debounce, useRef mirror to avoid stale closure)
- Campaign badge on Drafts page (violet "Campaign" pill)
- Activate modal on campaign detail page

---

## 8. Memory System

**Trigger:** Automatically after every post generation (fire-and-forget, never blocks UI)

### Extraction (`src/lib/ai/memory-extract.ts`):
- Model: `openai/gpt-4o-mini` (~$0.0002/call)
- Extracts per post:
  - **summary**: 2 sentences (angle + core argument)
  - **keywords**: 5–10 concrete terms (no stop-words)
  - **style_notes**: 1 sentence on HOW the person writes (rhythm, register, data use, patterns)
- On failure: returns null silently

### Storage (`src/lib/db/memory.ts`):
- Firestore collection: `post_memories`
- Per user + segment (individual | corporate)
- Fields: summary, keywords, style_notes, audience, tone, created_at, source (auto | user_upload)

### Relevance scoring (used at generation time):
```
score += 2 * (overlapping keywords with topic words)
score += 1.5 if audience matches exactly
score += 1 if tone matches
score -= 0.5 per 30-day period older than 30 days
```
Returns top-5. Falls back to 3 most recent if all scores ≤ 0.

### Memory dashboard:
- View all entries (summary + keywords + style_notes)
- Delete individual entries (hover-reveal trash icon)
- Stats: totalMemories, uniqueTopics, topKeywords, toneBreakdown, oldest/newest

---

## 9. Profile Settings

**6 tabs, 2 segments (Individual / Corporate):**

| Tab | Key fields |
|-----|-----------|
| Identity | Name, role, bio/offering, niche, ICP, company stage, JTBD, content pillars, personality, USP |
| Audience | Target audience definition, market context |
| Branding | Brand voice, messaging guidelines, customer pains, verbatim language, words to avoid |
| Customer Voice | Pains, desires, motivations (JTBD framework) |
| AI Config | Model selection, custom system prompt |
| Image Style | Visual style (photo/illustration/abstract/3d/lineart/bw_photo) |

- Profile photo upload on Identity tab (Individual only) → stored in Firestore `profiles/{uid}.profilePhotoUrl`
- Used by face-generate endpoint
- Change tracking: Save button enabled only when `hasChanges = true`

---

## 10. Analytics

**What works (`/api/analytics`):**
- Total posts, this month, last month
- Posts by hour of day (24h distribution)
- Posts by day of week
- Posts by tone
- Posts by length (short/medium/long)
- Weekly growth (last 8 weeks)
- Recent 5 posts
- Best posting time recommendation (hour + day with most posts)

**What doesn't work:**
- Likes, comments, engagement — LinkedIn moved these to Partner API only (April 2025)
- All engagement fields return 0 until LinkedIn Partner API access is granted

---

## 11. Admin Panel

**Access:** `/admin` — protected by `ADMIN_EMAILS` env var

**Capabilities:**
- List all users with: post stats (total/draft/scheduled/published/failed), LinkedIn connection status, token expiry, segment usage
- Disable/enable users (Firebase Auth)
- Delete users + all data (posts, memories, tokens, profiles, schedule_suggestions)
- Aggregated platform stats

---

## 12. Auth Pattern (Edge Runtime)

All Edge Runtime API routes use `verifyTokenEdge.ts` (NOT Firebase Admin SDK — not edge-compatible):
1. Extract `Authorization: Bearer <token>` header
2. Call Firebase REST API: `GET https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={FIREBASE_API_KEY}` with idToken
3. Returns `{ uid, email }` or throws

Client-side: always call `getAuthToken()` before any authenticated fetch to get current Firebase ID token.

---

## 13. Key Architectural Patterns

### Stale closure fix (campaigns auto-save):
Use `useRef` mirroring state → update ref inside `setPosts` updater → debounced save reads from ref not state.

### Composite index avoidance (Firestore):
Single `where(user_id)` query + in-memory filter for second condition. Never two `where` clauses on different fields (avoids needing Firestore composite index).

### Async params (Next.js 15):
`{ params }: { params: Promise<{id: string}> }` + `await params` — required for all dynamic routes.

### Fire-and-forget pattern:
Memory extraction, post save to Firestore after LinkedIn publish — never awaited by UI. Failures are silent. This prevents non-critical operations from blocking user feedback.
