import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";
import { sanitizePromptInput } from "@/lib/ai/sanitize";

// Edge Runtime — no timeout on Vercel Hobby plan (unlike serverless 10s limit)
export const runtime = "edge";

function extractJSON(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = fenced ? fenced[1] : text;
  try { return JSON.parse(cleaned.trim()); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch { return null; } }
    return null;
  }
}

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { topic: rawTopic, options = {}, sourceContext: rawSourceContext } = await req.json();
    if (!rawTopic) return NextResponse.json({ error: "topic required" }, { status: 400 });

    const topic = sanitizePromptInput(rawTopic, 200);
    const sourceContext = sanitizePromptInput(rawSourceContext, 3000);

    const { segment = "individual", tone = "professional", audience: rawAudience = "general", length = "medium", clientProfile } = options;
    const audience = sanitizePromptInput(rawAudience, 150);

    const profileLines = clientProfile ? [
      clientProfile.niche         && `- Niche: ${clientProfile.niche}`,
      clientProfile.bioOrOffering && `- Offering: ${clientProfile.bioOrOffering}`,
      clientProfile.icp           && `- Target customer: ${clientProfile.icp}`,
    ].filter(Boolean) : [];
    const clientContext = profileLines.length > 0 ? `\nClient context:\n${profileLines.join("\n")}` : "";

    const sourceBlock = sourceContext
      ? `\n\nSOURCE MATERIAL PROVIDED BY USER — treat this as primary context for the research:\n"""\n${sourceContext}\n"""\nExtract insights, data points, and angles directly from this material where relevant.`
      : "";

    const prompt = `You are an expert LinkedIn content researcher.

Produce a research report to power a single LinkedIn post:
- Topic: "${topic}"
- Tone: ${tone}
- Audience: ${audience}
- Length: ${length}
- Voice: ${segment === "individual" ? "personal brand, first-person" : "corporate brand"}${clientContext}${sourceBlock}

Rules: specific data-backed insights (numbers, companies, trends), prefer 2024-2026 data, no generic claims.

Return ONLY valid JSON:
{
  "summary": "2-3 sentence executive summary of strongest finding for ${audience}",
  "insights": [
    {"title": "insight title", "content": "1-2 sentence specific finding with stat", "source": "Publication or year"},
    {"title": "...", "content": "...", "source": "..."},
    {"title": "...", "content": "...", "source": "..."}
  ],
  "references": ["source1", "source2"]
}`;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "OpenRouter API key not configured" }, { status: 500 });

    // Retry up to 2 times on transient errors (5xx, network failures)
    let data: any = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://linkedin-automation-chi.vercel.app",
            "X-Title": "Cridl",
          },
          body: JSON.stringify({
            model: "google/gemini-2.0-flash-001",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 1200,
          }),
        });
        if (!res.ok) {
          lastErr = `OpenRouter ${res.status}: ${await res.text()}`;
          if (res.status < 500) break; // don't retry 4xx
          continue;
        }
        data = await res.json();
        break;
      } catch (fetchErr: any) {
        lastErr = fetchErr?.message || "network error";
      }
    }

    if (!data) {
      console.error("[research] All attempts failed:", lastErr);
      // Return a structured fallback so downstream generation still works
      return NextResponse.json({
        topic,
        summary: `Research on "${topic}" is currently unavailable. The post will be generated from your existing brand context and the topic description.`,
        insights: [{ title: topic, content: `Explore the key dimensions of ${topic} relevant to ${audience}.`, source: "Fallback" }],
        references: [],
      });
    }

    const text = data.choices?.[0]?.message?.content || "";
    const synthesis = extractJSON(text);

    if (!synthesis?.summary) {
      return NextResponse.json({
        topic, summary: `Research on "${topic}" completed.`,
        insights: [{ title: "Topic Overview", content: `Key aspects of ${topic} for ${audience}.`, source: "AI" }],
        references: [],
      });
    }

    return NextResponse.json({ topic, ...synthesis });
  } catch (err: any) {
    console.error("[api/ai/research] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Research failed" }, { status: 500 });
  }
}
