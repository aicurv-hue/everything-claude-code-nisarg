---
name: Edge Runtime — required for OpenRouter and LinkedIn OAuth routes
description: Routes calling OpenRouter or LinkedIn OAuth must export runtime = "edge" to avoid Vercel timeout.
type: feedback
---

Any API route that calls OpenRouter (AI) or LinkedIn OAuth MUST include:
```ts
export const runtime = "edge";
```

Current edge routes:
- `src/app/api/ai/research/route.ts`
- `src/app/api/ai/generate/route.ts`
- `src/app/api/ai/image-prompt/route.ts`
- `src/app/api/auth/linkedin/callback/route.ts`

**Why:** Vercel serverless functions have a 10s timeout on the hobby/pro plan. Edge Runtime has no timeout limit. AI generation and OAuth flows can easily exceed 10s.

**How to apply:** Any new route that makes an external AI call or OAuth request must be an Edge route. Also check existing routes when adding AI calls to them.
