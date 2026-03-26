import { NextRequest, NextResponse } from "next/server";
import { generateImageFromPrompt } from "@/lib/ai/image";

// Edge Runtime — no 10s timeout on Vercel Hobby (fal.ai can take >10s)
export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing image prompt." }, { status: 400 });
    }

    const result = await generateImageFromPrompt(prompt);
    return NextResponse.json({ url: result.url, prompt: result.prompt });
  } catch (error: any) {
    console.error("Image generation error:", error);
    return NextResponse.json({ error: error.message || "Image generation failed." }, { status: 500 });
  }
}
