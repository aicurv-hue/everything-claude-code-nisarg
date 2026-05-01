import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

export const runtime = "edge";

/** Block private/loopback IPs and non-http(s) schemes to prevent SSRF */
function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  // Block loopback, private ranges, link-local, metadata endpoints
  if (host === "localhost") return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (host === "0.0.0.0") return false;
  if (host.endsWith(".internal") || host.endsWith(".local")) return false;
  return true;
}

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
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { url, imageBase64, imageType } = await req.json();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "API key not configured" }, { status: 500 });

    let urlContent: string | undefined;
    let imageDescription: string | undefined;

    // ── URL extraction ──────────────────────────────────────────────────────────
    if (url) {
      if (!isSafeUrl(url)) {
        return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 422 });
      }
      try {
        const pageRes = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Cridl/1.0)" },
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
            "X-Title": "Cridl",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: `data:${imageType};base64,${imageBase64}` },
                },
                {
                  type: "text",
                  text: `You are helping a LinkedIn ghostwriter called Cortex craft a post. Describe this image in ONE plain prose paragraph (150-250 words). NEVER output JSON, code, bullet points, headers, or markdown.

Extract and emphasize:
1. The core insight or data (what changed? what's surprising? what's the business impact?)
2. Every number, percentage, metric visible — transcribe exactly
3. What audience this resonates with (founders, engineers, marketers, etc?)
4. 2–3 specific angles Cortex could turn this into a LinkedIn hook (e.g., "the hidden cost of X", "why Y failed", "the pattern nobody talks about")
5. Emotional hooks: what makes this story worth sharing? (risk, growth, disruption, counterintuitive, etc)

Be vivid but factual. Focus on what makes this post-worthy.`,
                },
              ],
            }],
            temperature: 0.2,
            max_tokens: 400,
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
