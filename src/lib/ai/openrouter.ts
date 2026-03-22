import OpenAI from "openai";

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.warn("OPENROUTER_API_KEY is not set. AI features will fail.");
}

export const openRouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: apiKey || "mock-key",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:3000", // Optional, for OpenRouter tracking
    "X-Title": "LinkedIn Automation Portal", // Optional
  }
});

export const DEFAULT_MODEL   = "google/gemini-2.0-flash";      // Gemini 2.0 Flash via OpenRouter
export const FALLBACK_MODEL  = "openai/gpt-4o-mini";           // Fallback if Gemini is down
