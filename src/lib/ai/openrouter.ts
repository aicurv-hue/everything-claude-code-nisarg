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

export const DEFAULT_MODEL   = "moonshotai/kimi-k2.6";         // Kimi K2.6 via OpenRouter (primary)
export const FALLBACK_MODEL  = "google/gemini-2.0-flash-001";  // Gemini 2.0 Flash fallback if Kimi fails
