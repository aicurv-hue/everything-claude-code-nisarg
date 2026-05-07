import { NextRequest, NextResponse } from "next/server";
import { generateImageFromPrompt } from "@/lib/ai/image";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

// Node runtime — gpt-image-2 medium can take 20-40s, exceeding Edge's hard limit.
// maxDuration=60s on Hobby is enough headroom; Edge's "An error occurred…" plain-text
// timeout page was breaking client JSON parsing.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check and increment image generation quota (pre-flight to Node.js route)
  const checkRes = await fetch(new URL("/api/usage/check", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("authorization") || "",
    },
    body: JSON.stringify({ action: "image" }),
  });
  if (!checkRes.ok) return checkRes;

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
