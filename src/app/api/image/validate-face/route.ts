import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64 || !imageBase64.startsWith("data:")) {
      return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ hasFace: true, quality: "good", message: "Validation skipped (no API key)" });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://linkauto.app",
        "X-Title": "LinkAuto",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "system",
            content: "You are a face detection checker. Respond with JSON only.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: 'Does this image contain a clear, well-lit human face suitable for professional headshots? Respond with JSON: { "hasFace": boolean, "quality": "good" | "poor" | "none", "message": string }',
              },
              {
                type: "image_url",
                image_url: { url: imageBase64 },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error("[validate-face] OpenRouter error:", res.status);
      return NextResponse.json({ hasFace: true, quality: "good", message: "Validation unavailable — proceeding." });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: { hasFace?: boolean; quality?: string; message?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { hasFace: true, quality: "good", message: "Could not parse validation result." };
    }

    return NextResponse.json({
      hasFace: parsed.hasFace ?? true,
      quality: parsed.quality ?? "good",
      message: parsed.message ?? "Photo processed.",
    });
  } catch (err: any) {
    console.error("[validate-face] Error:", err);
    return NextResponse.json({ hasFace: true, quality: "good", message: "Validation error — proceeding." });
  }
}
