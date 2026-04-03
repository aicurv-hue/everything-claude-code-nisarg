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
                  text: `You are a world-class visual analyst and LinkedIn content strategist. A user has uploaded a reference image to use as the basis for a LinkedIn post. Your job is to extract every possible detail from this image so that a LinkedIn ghostwriter called Neel can write a highly specific, compelling post grounded in the actual content of the image — not generic filler.

Be exhaustive. Neel cannot see the image — only your description. The richer your analysis, the better the post.

---

## SECTION 1 — MAIN SUBJECT
Identify and describe the primary subject in full detail. What is it? (product, machine, person, team, chart, document, screenshot, event, location, etc.) If it is a product, name it or describe it as precisely as possible. If it is a person, describe their apparent role, attire, expression, and context. If it is a scene, describe what is happening.

## SECTION 2 — VISUAL & PHYSICAL DETAILS
Describe everything visible:
- Colours, materials, textures, finish, size/scale (estimate if possible)
- Condition: new vs worn vs damaged vs in-use
- Environment or setting: factory floor, office, outdoors, trade show, warehouse, lab, etc.
- Lighting, angle, composition — what does the framing emphasise?
- Any branding, logos, model numbers, manufacturer markings
- Any safety labels, certifications, or regulatory markings visible

## SECTION 3 — TEXT, DATA & LABELS
Transcribe ALL visible text exactly as it appears:
- Product names, part numbers, serial numbers, spec plates
- Chart titles, axis labels, data values, percentages, legends
- Captions, overlays, watermarks, headlines
- Any handwritten notes or annotations
If no text is visible, state that clearly.

## SECTION 4 — TECHNICAL & DOMAIN ANALYSIS
Go deep on the technical context:
- What industry does this belong to? (manufacturing, logistics, engineering, SaaS, finance, healthcare, etc.)
- What is the function or purpose of what is shown?
- If machinery/equipment: what type, what process does it perform, what are the key components visible?
- If a product: what problem does it solve, who is the buyer, what is the value proposition?
- If a chart/graph: what trend or insight does the data reveal?
- What level of expertise or investment does this represent?
- Are there any visible problems, wear, failures, or interesting engineering decisions?

## SECTION 5 — BUSINESS & PROFESSIONAL CONTEXT
Interpret the business meaning of the image:
- What achievement, milestone, capability, or offering does this image represent?
- What pain points or challenges does it relate to?
- What type of buyer or decision-maker would care about this?
- What emotions does this image evoke — pride, reliability, scale, innovation, precision?
- Is there a before/after, problem/solution, or transformation narrative visible?

## SECTION 6 — LINKEDIN POST ANGLES (give at least 4)
Suggest specific, concrete angles Neel can use to write a LinkedIn post:
- Each angle should reference specific details from the image
- Include the hook idea, the core message, and the CTA direction
- Vary the angles: e.g. thought leadership, customer problem, product showcase, industry insight, behind-the-scenes

---

Be factual. Do not invent details not visible. If something is unclear or partially visible, say so and give your best interpretation. Length: write as much as needed — thoroughness is the goal.`,
                },
              ],
            }],
            temperature: 0.2,
            max_tokens: 1800,
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
