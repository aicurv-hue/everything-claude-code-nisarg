import OpenAI from "openai";

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  // Throw at module load so misconfigured deployments fail immediately with a clear message
  // rather than producing a cryptic error on the first AI call.
  throw new Error(
    "[openrouter] OPENROUTER_API_KEY is not set. Set this environment variable in Vercel or .env.local before deploying."
  );
}

export const openRouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: apiKey || "mock-key",
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://linkedin-automation-chi.vercel.app",
    "X-Title": "Cridl - LinkedIn Automation Portal",
  }
});

// Model allocation:
//   GENERATION_MODEL — final LinkedIn post writing only. Claude Sonnet for superior
//   storytelling quality, emotional realism, sentence-rhythm variation, and hook strength.
//   DEFAULT_MODEL    — all other text tasks (research, intent, image prompts, scoring,
//   voice-rewrite on demand, idea generation, etc.). Fast + cheap.
//   FALLBACK_MODEL   — retry fallback for DEFAULT_MODEL call sites.
export const GENERATION_MODEL = "anthropic/claude-sonnet-4-6";
export const DEFAULT_MODEL    = "google/gemini-2.5-flash";
export const FALLBACK_MODEL   = "google/gemini-2.5-flash";
