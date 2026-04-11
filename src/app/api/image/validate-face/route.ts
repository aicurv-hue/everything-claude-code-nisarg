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
      return NextResponse.json({ error: "Face validation unavailable — API key not configured" }, { status: 503 });
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.cridl.com",
        "X-Title": "Cridl",
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
      return NextResponse.json({ error: "Face validation service error — please try again" }, { status: 502 });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed: { hasFace?: boolean; quality?: string; message?: string } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "Could not parse validation result — please try again" }, { status: 502 });
    }

    return NextResponse.json({
      hasFace: parsed.hasFace ?? false,
      quality: parsed.quality ?? "none",
      message: parsed.message ?? "Photo processed.",
    });
  } catch (err: any) {
    console.error("[validate-face] Error:", err);
    return NextResponse.json({ error: "Face validation failed — please try again" }, { status: 500 });
  }
}
