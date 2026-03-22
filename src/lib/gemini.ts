import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set in environment variables. Real AI generation will fail.");
}

export const genAI = new GoogleGenerativeAI(apiKey || "mock-key");

export const getGeminiModel = (modelName: string = "gemini-2.0-flash") => {
  return genAI.getGenerativeModel({ model: modelName });
};
