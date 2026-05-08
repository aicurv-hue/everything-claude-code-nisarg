import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";
import { sanitizePromptInput } from "@/lib/ai/sanitize";
import { detectIntent } from "@/lib/ai/intent";

// Edge Runtime — no timeout on Vercel Hobby plan (unlike serverless 10s limit)
export const runtime = "edge";

// In-process research cache — works within warm Edge instances (survives for the instance lifetime)
// Key: "uid|topic|audience", Value: { result, cachedAt }
const researchCache = new Map<string, { result: any; cachedAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes within a warm instance

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
    const intentType = detectIntent(topic);

    // Check in-process cache — skip AI call if same user+topic+audience was researched recently
    // (Only cache when there's no custom sourceContext — cached results won't reflect new source material)
    const cacheKey = `${uid}|${topic}|${audience}`;
    if (!sourceContext) {
      const cached = researchCache.get(cacheKey);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return NextResponse.json(cached.result);
      }
    }

    // For personal topics: strip brand/product fields so research doesn't inject industry content
    const profileLines = clientProfile ? [
      intentType === "professional" && clientProfile.niche         && `- Niche: ${clientProfile.niche}`,
      intentType === "professional" && clientProfile.bioOrOffering && `- Offering: ${clientProfile.bioOrOffering}`,
      intentType === "professional" && clientProfile.icp           && `- Target customer: ${clientProfile.icp}`,
      intentType === "professional" && clientProfile.jtbd           && `- Jobs-to-be-Done: ${clientProfile.jtbd}`,
      intentType === "professional" && clientProfile.customerPains  && `- Customer Pains: ${clientProfile.customerPains}`,
    ].filter(Boolean) : [];
    const clientContext = profileLines.length > 0 ? `\nClient context:\n${profileLines.join("\n")}` : "";

    const sourceBlock = sourceContext
      ? `\n\nSOURCE MATERIAL PROVIDED BY USER — treat this as primary context for the research:\n"""\n${sourceContext}\n"""\nExtract insights, data points, and angles directly from this material where relevant.`
      : "";

    const researcherRole = intentType === "personal"
      ? `You are a research journalist and cultural analyst.`
      : `You are an expert LinkedIn content researcher.`;

    const researchRules = intentType === "personal"
      ? `Rules:
- This is a personal story or reflection post. Research the TOPIC ITSELF — factual context, cultural/historical background, relevant human truths.
- Do NOT inject business metrics, automation statistics, or industry data unless the topic explicitly mentions them.
- Every insight must deepen or contextualize the topic as a human experience.`
      : `Rules: specific data-backed insights (numbers, companies, trends), prefer 2024-2026 data, no generic claims.`;

    const prompt = `${researcherRole}

Produce a research report to power a single LinkedIn post:
- Topic: "${topic}"
- Tone: ${tone}${intentType === "professional" ? `\n- Audience: ${audience}` : ""}
- Length: ${length}
- Voice: ${segment === "individual" ? "personal brand, first-person" : "corporate brand"}${clientContext}${sourceBlock}

${researchRules}

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

    // Retry once on transient errors (5xx, network failures, per-attempt timeout).
    // Each attempt is bounded by AbortController so a slow model can't run out the function's overall budget.
    // Total budget across both models must fit inside Vercel's edge function limit.
    // Single model (Gemini 2.5 Flash). Two attempts with hard timeouts so a slow
    // call can never exceed the edge function budget.
    let data: any = null;
    let lastErr = "";
    const RESEARCH_MODELS: Array<{ model: string; timeoutMs: number }> = [
      { model: "google/gemini-2.5-flash", timeoutMs: 12000 },
      { model: "google/gemini-2.5-flash", timeoutMs: 10000 },
    ];
    for (const { model, timeoutMs } of RESEARCH_MODELS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 1500,
          }),
          signal: controller.signal,
        });
        if (!res.ok) {
          lastErr = `OpenRouter ${res.status} on ${model}: ${await res.text()}`;
          continue; // try next model
        }
        data = await res.json();
        break;
      } catch (fetchErr: any) {
        lastErr = fetchErr?.name === "AbortError" ? `research timeout on ${model}` : (fetchErr?.message || "network error");
      } finally {
        clearTimeout(timeoutId);
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
        intentType,
      });
    }

    const text = data.choices?.[0]?.message?.content || "";
    const synthesis = extractJSON(text);

    if (!synthesis?.summary) {
      return NextResponse.json({
        topic, summary: `Research on "${topic}" completed.`,
        insights: [{ title: "Topic Overview", content: `Key aspects of ${topic} for ${audience}.`, source: "AI" }],
        references: [],
        intentType,
      });
    }

    const result = { topic, ...synthesis, intentType };
    // Store in cache (only when no sourceContext was used — cached results are topic-generic)
    if (!sourceContext) {
      researchCache.set(cacheKey, { result, cachedAt: Date.now() });
      // Evict old entries if cache grows large
      if (researchCache.size > 200) {
        const oldest = [...researchCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
        if (oldest) researchCache.delete(oldest[0]);
      }
    }
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/ai/research] Error:", err?.message || err);
    return NextResponse.json({ error: "Research failed" }, { status: 500 });
  }
}
