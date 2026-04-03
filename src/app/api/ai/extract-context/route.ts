import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/** Strip HTML tags and decode common entities, returning first 3000 chars of visible text */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 3000);
}

export async function POST(req: NextRequest) {
  try {
    const { url, imageBase64, imageType } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    let urlContent: string | undefined;
    let imageDescription: string | undefined;

    // ── URL extraction ──────────────────────────────────────────────────────────
    if (url) {
      try {
        const pageRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkAuto/1.0)" },
          signal: AbortSignal.timeout(8000),
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          urlContent = stripHtml(html);
        } else {
          return NextResponse.json({ error: `Could not fetch URL (${pageRes.status})` }, { status: 422 });
        }
      } catch (e: any) {
        return NextResponse.json({ error: `URL fetch failed: ${e?.message || "timeout"}` }, { status: 422 });
      }
    }

    // ── Image vision analysis ───────────────────────────────────────────────────
    if (imageBase64 && imageType) {
      try {
        const visionRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://linkedin-automation-chi.vercel.app",
            "X-Title": "LinkAuto",
          },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [{
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:${imageType};base64,${imageBase64}` },
                },
                {
                  type: "text",
                  text: "Describe what you see in this image in detail. Focus on: main subject, any text or data visible, charts/graphs if present, mood/tone, and how the content could relate to a LinkedIn post. Be specific and concise (max 200 words).",
                },
              ],
            }],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        if (visionRes.ok) {
          const visionData = await visionRes.json();
          imageDescription = (visionData.choices?.[0]?.message?.content || "").trim();
        } else {
          console.warn("[extract-context] Vision call failed:", visionRes.status);
        }
      } catch (e) {
        console.warn("[extract-context] Vision analysis error:", e);
      }
    }

    return NextResponse.json({ urlContent, imageDescription });
  } catch (err: any) {
    console.error("[api/ai/extract-context]", err?.message || err);
    return NextResponse.json({ error: err?.message || "Extraction failed" }, { status: 500 });
  }
}
