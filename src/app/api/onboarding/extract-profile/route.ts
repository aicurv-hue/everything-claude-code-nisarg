import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { openRouter, DEFAULT_MODEL, FALLBACK_MODEL } from "@/lib/ai/openrouter";

export const runtime = "nodejs";

const SYSTEM = `You extract a creator's brand profile from raw text they pasted from their LinkedIn profile (headline + about + experience). Return ONLY a valid JSON object — no prose, no code fences.

Fields (omit any you genuinely cannot infer; do not invent):
- name: full name
- roleOrIndustry: one short phrase, e.g. "B2B SaaS founder" or "Performance marketer in fintech"
- niche: 3-6 word specialty, e.g. "AI-powered sales enablement"
- bioOrOffering: 1-2 sentences describing what they do and for whom
- icp: 1 sentence on ideal customer / audience
- pillars: 3-5 content pillars, comma-separated, lowercase, e.g. "growth, hiring, product, leadership"
- personality: 4-6 adjectives describing tone, comma-separated, e.g. "direct, witty, contrarian, practical"
- usp: 1 sentence on unique angle
- verbatimLanguage: phrases or jargon they actually use, comma-separated (pull from text)

Rules:
- No asterisks anywhere in output values.
- Keep every field tight and usable as-is in a profile form.
- If text is too sparse to be useful, return {} (empty object).`;

export async function POST(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await adminAuth.verifyIdToken(h.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { text } = await req.json();
  const trimmed = typeof text === "string" ? text.trim().slice(0, 8000) : "";
  if (trimmed.length < 30) {
    return NextResponse.json({ error: "Please paste at least your headline and a few lines from your About section." }, { status: 400 });
  }

  async function callModel(model: string) {
    return openRouter.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Pasted LinkedIn content:\n"""\n${trimmed}\n"""\n\nExtract the profile JSON.` },
      ],
      temperature: 0.4,
      max_tokens: 700,
    });
  }

  let raw = "";
  try {
    const res = await callModel(DEFAULT_MODEL);
    raw = res.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.error("[extract-profile] primary failed, falling back", err);
    try {
      const res = await callModel(FALLBACK_MODEL);
      raw = res.choices?.[0]?.message?.content || "";
    } catch (err2) {
      console.error("[extract-profile] fallback failed", err2);
      return NextResponse.json({ error: "AI extraction failed. Try again or skip this step." }, { status: 502 });
    }
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ profile: {} });

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return NextResponse.json({ profile: {} });
  }

  const allowed = ["name", "roleOrIndustry", "niche", "bioOrOffering", "icp", "pillars", "personality", "usp", "verbatimLanguage"] as const;
  const profile: Record<string, string> = {};
  for (const k of allowed) {
    const v = parsed[k];
    if (typeof v === "string" && v.trim()) profile[k] = v.replace(/\*/g, "").trim();
  }

  return NextResponse.json({ profile });
}
