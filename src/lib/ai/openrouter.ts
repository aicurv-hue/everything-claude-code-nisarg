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

// Single-model architecture: Gemini 2.5 Flash powers every text + vision call across Cridl.
// FALLBACK_MODEL is kept equal so existing fallback chains retry the same model once on transient errors.
export const DEFAULT_MODEL   = "google/gemini-2.5-flash";
export const FALLBACK_MODEL  = "google/gemini-2.5-flash";
