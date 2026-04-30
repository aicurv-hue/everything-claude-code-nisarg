# Cridl — Complete Product Brief
> Single source of truth for AI context, website copy, marketing content, and product strategy.
> Last updated: April 2026 | Status: Public Beta

---

## 1. Product Identity

**Name:** Cridl
**Category:** LinkedIn Content Automation SaaS
**Tagline:** *Your LinkedIn presence, on autopilot.*
**One-liner:** Cridl researches, writes, and schedules LinkedIn posts in your voice — so you show up consistently without the effort.
**Mission:** Make high-quality, research-backed LinkedIn content accessible to every professional and brand — not just those who can afford full-time writers.

---

## 2. What Cridl Does (Plain English)

Cridl is a web app that helps professionals and companies build a strong LinkedIn presence using AI. Instead of staring at a blank page, users enter a topic, pick a tone, and Cridl does the rest:

1. **Researches** the topic with AI — pulling real insights, data points, and angles
2. **Writes** a LinkedIn post in the user's exact voice using "Cortex," a dedicated AI ghostwriter
3. **Generates** a matching image (AI-created or face-consistent with the user's photo)
4. **Previews** the post for review and editing before anything goes live
5. **Publishes or schedules** directly to LinkedIn — individual profiles and company pages both supported

The result is a post that sounds like you wrote it, backed by real research, with a professional image — in under 90 seconds.

---

## 3. Target Audience

### Primary Users

| Persona | Pain They Have | How Cridl Helps |
|---|---|---|
| **Founders & Solopreneurs** | No time to write, inconsistent posting | Daily posts without daily effort |
| **Consultants & Coaches** | Hard to translate expertise into content | Research-backed posts in their niche |
| **Marketing Teams** | Need consistent company voice at scale | Corporate workspace with brand context |
| **Freelancers & Creators** | Voice gets diluted by AI tools | Writing samples + memory preserves voice |
| **Thought Leaders** | Repeating the same angles | Memory system prevents duplication |

### Secondary Users
- In-house content teams managing LinkedIn company pages
- Agencies creating content for multiple clients (future: multi-profile)
- Sales professionals building personal brand

### Geography
- **India-first** (INR pricing, Razorpay payments)
- **Global ambition** — product works for any LinkedIn user worldwide; pricing expansion planned

---

## 4. Key Features

### AI Content Generation
- **Two-stage research pipeline** — AI generates sub-questions about the topic, answers them, then synthesizes insights before writing a single word
- **4 tone modes:** Professional (stat-driven authority), Storytelling (vivid opening scene), Educational (pain + numbered solution), Contrarian (challenges common beliefs with data)
- **4 audience targets:** Founders & CEOs, Marketers & Growth, Engineers & Devs, General Professional
- **3 post lengths:** Short (~100w), Medium (~200w), Long (~400w)
- **Custom instructions** — per-post free-form overrides (do X, avoid Y)
- **Intent detection** — automatically detects personal topics (books, life events, opinions) and prevents forced business messaging

### Cortex — The AI Ghostwriter
- A named AI persona ("Cortex") that writes every post
- Reads the user's brand profile, past posts, and writing samples before generating
- Never invents facts, family members, locations, or clients not in the profile
- Consistently applies hook formulas proven for LinkedIn engagement
- See full details in Section 7

### Persistent Memory System
- After every post, Cortex auto-extracts: topic summary, keywords, writing style fingerprint
- Before writing any new post, the 5 most relevant past posts are retrieved and injected as context
- Prevents repetitive angles and maintains voice consistency across months of posting
- Users can view and delete memory entries at `/dashboard/memory`
- Completely separate memory pools for Individual and Corporate segments

### Image Generation (4 modes)
1. **AI Generate** — fal.ai creates a custom image from the post's AI-written image prompt
2. **Use My Face** — User uploads a headshot; AI generates variations (Professional, Casual, Minimal, Creative) with face consistency using flux-pulid model
3. **Upload** — User provides their own image
4. **No Image** — Text-only post

**6 image styles** (saved per profile):
Photo, Illustration, Abstract, 3D Render, Line Art, B&W Photo — applied consistently to all posts in a profile for brand coherence.

### Scheduling & Publishing
- Direct publishing to LinkedIn — individual profiles and company pages both fully working
- Schedule posts for any date/time with timezone support
- AI suggests 3 best posting time slots based on engagement patterns
- Bulk CSV upload — schedule up to 500 posts at once via 3-step wizard
- Content calendar — month + list view, color-coded by status
- Auto-publish cron runs every hour (via cron-job.org)

### Campaigns
- Build multi-post content series (2–50 posts) from a single topic
- Set frequency (every N days), start date, and timezone
- Each post is generated sequentially — every post knows what came before for narrative continuity
- Per-post image drawer (all 4 image modes available per post)
- Review and edit all posts before activating
- Activate with one click — all posts auto-scheduled

### Profile Settings (6 tabs)
| Tab | What It Configures |
|---|---|
| **Identity** | Name, role, niche, bio, profile photo |
| **Audience** | Ideal Customer Profile (ICP), company stage, Jobs-to-be-Done |
| **Branding** | Content pillars (3–5 topics), brand personality, USP |
| **Customer Voice** | Core customer pains, verbatim language they use, words to ban |
| **AI Config** | AI model selection, custom system prompt |
| **Image Style** | Visual style for all AI-generated images |

Every field feeds directly into Cortex's prompt — the more filled in, the more on-brand the output.

### AI Assist in Settings
Most settings fields have an "AI Assist" button that auto-generates or expands the field based on what's already filled in — reducing setup friction.

---

## 5. How It Works — The Full Pipeline

```
User enters: topic + tone + audience + length
         ↓
Intent Detection (instant, zero-cost)
  → Is this personal (book, life event, opinion) or professional?
  → Personal: strips brand context to avoid forced business messaging
         ↓
Research Stage (Gemini 2.0 Flash)
  → Generates 4–5 targeted sub-questions about the topic
  → Answers each question with real insights and sources
  → Synthesizes into a research brief: summary + insights[] + references[]
         ↓
Memory Retrieval (pure JavaScript, zero API cost)
  → Scores 20 recent posts for relevance: keyword overlap + tone/audience match + recency
  → Top 5 injected as context for Cortex
         ↓
Post Generation (Cortex via OpenRouter)
  → System prompt = NEEL_RUNTIME + brand profile + memory + writing samples
  → Output: post text + image prompt
         ↓
Image Generation (fal.ai)
  → Image style prefix prepended for visual consistency
  → AI generates 1024×1024 image
         ↓
Preview Page
  → User reads, edits, regenerates, or swaps image
  → Picks publish now or schedule
         ↓
Publish to LinkedIn (direct API)
  → Individual profile or company page
  → Text + image uploaded via LinkedIn Images API
         ↓
Memory Extraction (async, fire-and-forget)
  → Extracts: summary, keywords, style_notes
  → Saves to Firestore for future post context
```

---

## 6. Dual Workspace — Individual vs Corporate

Cridl runs two completely separate workspaces within a single account:

| | Individual | Corporate |
|---|---|---|
| **Voice** | First-person (I, my) | Company voice (we, our) |
| **Purpose** | Personal brand building | Company page management |
| **LinkedIn target** | Personal profile | Company page (Organization ID) |
| **Memory pool** | Separate | Separate |
| **Profile photo** | Headshot for "Use My Face" | Not applicable |
| **Color coding** | Blue | Violet |
| **Plan requirement** | All plans | Pro+ (for Organization ID) |

Users can switch between workspaces instantly via the segment toggle in the dashboard. All posts, campaigns, memory, and settings are segment-specific.

---

## 7. Cortex — The AI Ghostwriter

Cortex is Cridl's AI persona — not a generic AI tool, but a named ghostwriter with a specific identity and strict rules.

**Who Cortex is:**
- "LinkedIn's sharpest ghostwriter and sole author of every post"
- A blend of conversion copywriter + viral content strategist
- Governed by a single source-of-truth prompt file (`NEEL_RUNTIME.md`)

**What makes Cortex different from ChatGPT for LinkedIn:**
- Reads your full brand profile before writing — not just the topic
- Reads your past posts and writing samples — learns your style
- Researches the topic first — never writes from ignorance
- Follows proven LinkedIn hook formulas for each tone
- Knows what NOT to do: no asterisks, no bullet soup, no forced positivity, no fabricated stories
- Intent-aware: treats personal stories as human narratives, not brand opportunities

**Cortex's hook formulas (examples):**
- **Professional:** "72% of factory owners in Gujarat overpay for energy because of one overlooked meter setting."
- **Storytelling:** "Rajan had been running his textile unit for 11 years before someone showed him the pump data."
- **Educational:** "Most founders spend 6 hours a week on LinkedIn with nothing to show. Here are 3 things that changed my return rate:"
- **Contrarian:** "Posting every day on LinkedIn did NOT grow my following. Posting 3× a week with research-backed insights did."

---

## 8. Pricing

India pricing (INR). Global pricing planned.

| Plan | Price/month | Posts | AI Images | Face Images | Profiles | Key Features |
|---|---|---|---|---|---|---|
| **Free** | ₹0 | 5 | 2 | — | 1 individual | Basic research, manual publishing |
| **Starter** | ₹499 | 30 | 10 | 5 | 1 individual | Full AI research, scheduling |
| **Pro** | ₹999 | 100 | 50 | 20 | 1 individual + 1 company | Use My Face, campaigns |
| **Business** | ₹1,999 | Unlimited | Unlimited | Unlimited | 3 individual + 3 company | Priority support, all features |

- Payment via Razorpay (subscriptions)
- 14-day free trial on paid plans
- Promo codes available (admin-controlled)
- Plan gating enforced in-app — users see upgrade prompts for locked features

---

## 9. Unique Selling Points (vs Competitors)

| Differentiator | Why It Matters |
|---|---|
| **Research before writing** | Every post is backed by real insights, not generic AI fill — the only tool that does this as standard |
| **Persistent memory** | Posts stay fresh and non-repetitive over months — competitors reset every session |
| **Dual workspace (Individual + Corporate)** | One platform for personal brand AND company page — no tool switching |
| **Intent detection** | Stops AI from shoe-horning business messaging into personal stories — content feels authentic |
| **"Use My Face" images** | AI-generated images featuring the user's actual face — unique in the category |
| **Named AI ghostwriter (Cortex)** | Not a faceless AI — a persona with rules, style, and a personality users trust |
| **Writing samples as voice input** | Upload real posts you've written — Cortex learns to write like you |
| **6 consistent image styles** | Visual brand coherence across all posts, not random AI outputs |
| **Campaign builder** | Multi-post drip series from one topic — planned narrative arcs, not one-offs |
| **Customer Voice tab** | Uses verbatim customer language in hooks — resonates better than polished copy |

---

## 10. Current Product Status

### Fully Working ✅
- LinkedIn OAuth (individual + company pages)
- Direct publishing — individual profiles (fully working)
- Direct publishing — company pages (fully working)
- Scheduled publishing — cron runs every hour
- AI research pipeline (Gemini 2.0 Flash, single call)
- AI post generation — brand profile + memory + research context
- Image generation — AI Generate and Use My Face (fal.ai)
- Campaign builder — sequential brand-aware generation
- Memory system — auto-extract after publish, relevance-scored retrieval
- Profile settings — all 6 tabs, both segments
- Post history with detail modal
- Bulk CSV upload (up to 500 posts)
- Content calendar (month + list view)
- Memory bank (view + delete)
- Admin panel — user management, stats, promo codes
- Onboarding flow (5 steps)
- Android APK + PWA support

### Not Yet Built / Limitations ❌
- **Engagement metrics** — LinkedIn moved likes/comments to Partner API only (April 2025). Analytics shows post timing but 0 for engagement numbers until Partner API is approved.
- **iOS app** — Android only currently
- **Multi-platform publishing** — LinkedIn only (no X, Instagram, etc.)
- **Voice-to-post** — Not yet built
- **Push notifications** — No alerts for scheduled posts
- **E2E automated tests** — Not written yet

---

## 11. Brand Voice & Positioning for Marketing

### Brand Personality
- **Authoritative but not corporate** — we speak like a sharp friend who knows LinkedIn, not a SaaS brochure
- **Outcome-focused** — always lead with what the user gets, not the feature list
- **Honest about AI** — we don't hide that AI is writing; we lean into "AI that researches first" as the differentiator
- **India-proud, globally ambitious** — relatable to Indian professionals, scalable to the world

### Core Messaging Angles
1. "The only LinkedIn tool that researches before it writes"
2. "Cortex remembers every post you write — so you never sound repetitive"
3. "Individual brand + company page. One platform."
4. "90 seconds from blank page to scheduled post"
5. "Your voice. Your style. Powered by AI that actually learns."
6. "Stop posting from memory. Start posting from research."

### Keywords for SEO / Ads
- LinkedIn automation tool India
- LinkedIn post generator AI
- LinkedIn content scheduler
- AI ghostwriter LinkedIn
- LinkedIn personal brand tool
- LinkedIn company page automation
- Schedule LinkedIn posts
- LinkedIn content calendar

### Emotional Hook (for ads/social)
> "You know you should post on LinkedIn. You just never do. Cridl fixes that."

### Social Proof Numbers (current)
- 500+ posts published
- 5× faster content creation vs writing manually
- 2-in-1: Individual + Corporate in one platform

---

## 12. Roadmap Gaps & Strategy Opportunities

These are logical next steps based on current feature gaps and market signals:

| Gap | Opportunity |
|---|---|
| No engagement analytics | Apply for LinkedIn Partner API — unlocks likes/comments data and becomes a strong retention feature |
| India-only pricing | Launch USD pricing tier to open global market |
| LinkedIn only | Add X (Twitter) and Instagram as publishing targets — same research + writing pipeline applies |
| Single user per account | Multi-seat / team plans for agencies and marketing teams |
| No iOS app | Build iOS app (Capacitor already configured) |
| No voice input | Voice-to-post — user speaks their idea, Cortex writes the post |
| No push notifications | Scheduled post reminders increase retention and reduce failed posts |
| No A/B testing | Let users test 2 versions of a post; Cridl tracks which performs better (needs Partner API) |
| No repurposing feature | "Turn this blog post / YouTube video into a LinkedIn post" — high demand use case |
| No white-label / agency mode | Agencies could run Cridl under their own brand for clients |

---

## 13. Technical Stack (for AI/developer context)

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Backend | Next.js API Routes (Node.js + Edge Runtime) |
| Database | Firebase Firestore |
| Auth | Firebase Auth + LinkedIn OAuth2 |
| AI Models | Gemini 2.0 Flash (default), GPT-4o, Claude 3.5 Sonnet, Claude Haiku 4.5, Gemini 2.5 Flash (via OpenRouter) |
| Image Generation | fal.ai (standard + flux-pulid face-consistent) |
| Payments | Razorpay |
| Deployment | Vercel (primary), Android APK via Capacitor, PWA |
| Scheduling | cron-job.org → `/api/cron/publish-due` every hour |

---

*This document is the single source of truth for all Cridl marketing, product, and strategy work. Update it when features ship or positioning changes.*
