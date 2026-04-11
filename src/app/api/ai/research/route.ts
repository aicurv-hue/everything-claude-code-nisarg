import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

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
    const { topic, options = {}, sourceContext } = await req.json();
    if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

    const { segment = "individual", tone = "professional", audience = "general", length = "medium", clientProfile } = options;

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
      const err = await res.text();
      console.error("[research] OpenRouter error:", err);
      throw new Error(`OpenRouter ${res.status}: ${err}`);
    }

    const data = await res.json();
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
