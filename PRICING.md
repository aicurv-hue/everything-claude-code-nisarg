# Cridl — Cost & Pricing Reference

> Last updated: 2026-04-10
> Update this file whenever models, token budgets, or fal.ai models change.
> See "Monthly Cost — Mature User" section for pricing basis.

---

## API Cost Rates (as of April 2026)

| Provider | Model | Input | Output |
|---|---|---|---|
| OpenRouter | `google/gemini-2.0-flash-001` | $0.10 / 1M tokens | $0.40 / 1M tokens |
| OpenRouter | `openai/gpt-4o-mini` (fallback + memory) | $0.15 / 1M tokens | $0.60 / 1M tokens |
| fal.ai | `fal-ai/nano-banana` (standard image) | — | ~$0.003–0.005 / image |
| fal.ai | `fal-ai/flux-pulid` (Use My Face) | — | ~$0.05–0.08 / image |
| Firebase | Firestore reads | $0.06 / 100K reads | — |
| Firebase | Firestore writes | $0.18 / 100K writes | — |

---

## Cost Per Individual Operation

| Operation | Model | Tokens In | Tokens Out | Est. Cost |
|---|---|---|---|---|
| Research | Gemini 2.0 Flash | ~800 | ~1,200 | ~$0.0006 |
| Post Generation (incl. image prompt) | Gemini 2.0 Flash | ~3,000–5,000 | ~600 | ~$0.002–0.003 |
| Image Prompt Regen (standalone) | Gemini 2.0 Flash | ~500 | ~200 | ~$0.0003 |
| Image Hook ("Generate Hook" button) | Gemini 2.0 Flash | ~300 | ~30 | ~$0.0001 |
| Memory Extraction (auto after publish) | GPT-4o-mini | ~600 | ~200 | ~$0.0002 |
| Best Time AI (cached 7 days) | Gemini 2.0 Flash | ~400 | ~200 | ~$0.0003 |
| AI Standard Image | fal-ai/nano-banana | — | — | ~$0.003–0.005 |
| Use My Face Image | fal-ai/flux-pulid | — | — | ~$0.05–0.08 |

---

## Cost Per Full "Create Post" Flow

| Step | Cost |
|---|---|
| Research | ~$0.001 |
| Post generation + image prompt | ~$0.003 |
| Memory extraction (fires after publish) | ~$0.0002 |
| **Subtotal — text only** | **~$0.004** |
| + AI standard image | **~$0.008–0.009 total** |
| + Use My Face image | **~$0.054–0.084 total** |

---

## Cost Per Campaign (example: 10 posts)

| Step | Cost |
|---|---|
| 1× Research | ~$0.001 |
| 10× Post generation | ~$0.025–0.030 |
| 10× Memory extraction | ~$0.002 |
| **Subtotal — text only** | **~$0.028–0.033** |
| + 10× AI standard images | **~$0.058–0.083 total** |
| + 10× Use My Face images | **~$0.528–0.833 total** |

---

## Monthly Cost — Mature User (Month 1+)

### What changes at month 1
After 1 month of usage, every post generation carries a much larger input context:

| Context block | Tokens added to EVERY generate call |
|---|---|
| Cortex system prompt (base) | ~2,000 tokens |
| Brand profile / settings | ~400 tokens |
| Writing samples (10 uploads, capped at 2,500 chars) | ~625 tokens |
| Past post memory (10 entries, capped at 2,000 chars) | ~500 tokens |
| Research + user prompt | ~800 tokens |
| **Total input per generation** | **~4,325 tokens** |

A new user (no memory/samples) runs at ~3,000 input tokens. So full memory adds ~**44% more input cost per generation** — still cheap in absolute terms because Gemini 2.0 Flash is $0.10/1M input.

---

### Standard Usage Model (Pricing Basis)

**Fixed assumptions used for all plan calculations:**
- 15 posts published/month
- 3 regenerations per post = 45 total generation calls
- 20 images/month max (including regenerations)
- Mature user: full memory context loaded (10 writing samples + 10 past post memories)
- Best Time AI: 4 refreshes/month (weekly, cached)
- Memory extraction fires once per published post (15×)

---

### Token Footprint Per Call (Mature User)

| Call type | Input tokens | Output tokens | Cost/call |
|---|---|---|---|
| Research | 800 | 1,200 | $0.00056 |
| Generation / Regen (with full memory) | 4,325 | 600 | $0.00067 |
| Memory extraction (GPT-4o-mini) | 600 | 200 | $0.00020 |
| Best Time AI | 400 | 200 | $0.00012 |

> Full memory breakdown per generation: Cortex system prompt ~2,000 + brand profile ~400 + writing samples (10×, capped 2,500 chars) ~625 + past post memory (10×, capped 2,000 chars) ~500 + research + user prompt ~800 = **~4,325 tokens input**

---

### Monthly Cost Breakdown (15 posts, 45 generations, 20 images)

#### AI Text

| Operation | Calls | Cost/call | Monthly cost |
|---|---|---|---|
| Research | 15 | $0.00056 | $0.0084 |
| Post generation + regen (45 total) | 45 | $0.00067 | $0.0302 |
| Memory extraction (published posts only) | 15 | $0.00020 | $0.0030 |
| Best Time AI (weekly refresh) | 4 | $0.00012 | $0.0005 |
| **AI text subtotal** | | | **$0.0421** |

#### Image Generation (20 images — 3 scenarios)

| Image mix | Standard ($0.004) | Use My Face ($0.065) | Image cost | **Total monthly** |
|---|---|---|---|---|
| All standard images | 20 | 0 | $0.080 | **$0.122** |
| Realistic mix (12 standard + 8 face) | 12 | 8 | $0.568 | **$0.610** |
| Heavy face usage (5 standard + 15 face) | 5 | 15 | $0.995 | **$1.037** |
| All Use My Face | 0 | 20 | $1.300 | **$1.342** |

#### Firebase (background, negligible)

| Resource | Est. usage | Cost |
|---|---|---|
| Firestore reads (~1,500/month) | 1.5K | ~$0.001 |
| Firestore writes (~200/month) | 200 | ~$0.0004 |
| **Firebase subtotal** | | **~$0.001** |

---

### Monthly Total Summary

| Scenario | Your cost/user/month | At 5× margin | At 8× margin |
|---|---|---|---|
| No images | **$0.043** | $0.22 | $0.35 |
| All standard images | **$0.122** | $0.61 | $0.98 |
| Realistic mix (12 std + 8 face) | **$0.610** | $3.05 | $4.88 |
| Heavy face (5 std + 15 face) | **$1.037** | $5.19 | $8.30 |
| All Use My Face | **$1.342** | $6.71 | $10.74 |

---

### Suggested Plan Pricing (based on standard model above)

| Plan | Posts | Images | Face images | Your cost | Suggested price |
|---|---|---|---|---|---|
| **Starter** | 8/mo, 1 regen each | 5 standard | 0 | ~$0.036 | **$9/mo** |
| **Pro** | 15/mo, 3 regens each | 15 standard + 5 face | 5 | ~$0.435 | **$29/mo** |
| **Business** | 30/mo, 3 regens each | 20 standard + 15 face | 15 | ~$1.20 | **$79/mo** |
| **Agency** | 60/mo, 3 regens each | 40 standard + 30 face | 30 | ~$2.80 | **$149/mo** |

> Margin ranges from 20×–67× on text, and 5×–10× on images.
> **Biggest lever: cap "Use My Face" per plan.** It's the only cost that scales dangerously.
> Consider selling face image credits as add-ons ($X for 10 extra face images) rather than bundling unlimited.

---

## Key Observations for Pricing Decisions

1. **"Use My Face" is the most expensive single operation** (~$0.05–0.08/image) — must be gated or capped per plan
2. **Standard post creation is very cheap** (~$0.004 without image) — generous limits are viable on all plans
3. **Campaign generation ≈ 10× single post cost** — should be a higher-tier feature
4. **Best Time AI is effectively free** — cached 7 days, only ~$0.0003 per refresh
5. **Memory extraction is negligible** — ~$0.0002 per published post, always fires

---

## Files to Update When Costs Change

| What changed | Where to look | Update here |
|---|---|---|
| Primary AI model | `src/lib/ai/openrouter.ts` → `DEFAULT_MODEL` | API Cost Rates table |
| Fallback / memory model | `src/lib/ai/openrouter.ts` → `FALLBACK_MODEL` | API Cost Rates table |
| Research token budget | `src/app/api/ai/research/route.ts` → `max_tokens` | Cost Per Operation table |
| Memory extraction model | `src/lib/ai/memory-extract.ts` → `EXTRACT_MODEL` | Cost Per Operation table |
| Standard image model | `src/lib/ai/image.ts` → `fal.run/fal-ai/...` | API Cost Rates + tables |
| Face image model | `src/app/api/image/face-generate/route.ts` → `fal.run/fal-ai/...` | API Cost Rates + tables |
