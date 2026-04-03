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
                  text: `You are an expert visual analyst helping a LinkedIn content writer understand a reference image.

Analyse the image thoroughly and provide a structured description covering:

1. **Main Subject**: What is the primary object, person, scene, or concept shown?
2. **Visual Details**: Colours, materials, condition, scale, environment/setting, any branding or logos.
3. **Text & Data**: Transcribe any visible text, labels, numbers, charts, or infographic data exactly.
4. **Technical / Domain Context**: If the image shows machinery, equipment, products, or industrial components, identify the type, likely industry, purpose, and notable features (e.g. wear patterns, specifications, configurations).
5. **Key Insights for a Post**: What story, problem, achievement, or insight does this image communicate? What emotions or professional themes does it evoke?
6. **Suggested LinkedIn Angles**: Give 2–3 specific angles Neel could use to write a compelling LinkedIn post referencing this image.

Be specific, factual, and thorough. Do not invent details not visible in the image.`,
                },
              ],
            }],
            temperature: 0.2,
            max_tokens: 700,
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
