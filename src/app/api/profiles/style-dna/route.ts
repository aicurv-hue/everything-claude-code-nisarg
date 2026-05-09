/**
 * POST /api/profiles/style-dna
 *
 * Extracts a compact StyleDNA fingerprint from a user's writing samples
 * (post_memories where source = "user_upload") and saves it back to the
 * profile segment in Firestore.
 *
 * Called automatically (fire-and-forget) from /api/memory/upload after
 * samples are saved. Can also be called manually to re-extract.
 *
 * Requires: Authorization: Bearer <firebase-id-token>
 * Body: { segment: "individual" | "corporate" }
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

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
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const { segment = "individual" } = await req.json().catch(() => ({}));

  // Fetch writing samples for this user+segment
  const snap = await adminDb
    .collection("post_memories")
    .where("user_id", "==", uid)
    .where("segment", "==", segment)
    .where("source", "==", "user_upload")
    .get();

  if (snap.empty || snap.size < 2) {
    return NextResponse.json({ ok: false, reason: "Need at least 2 writing samples to extract Style DNA." });
  }

  const samples = snap.docs.map((d) => d.data());

  // Build prompt using style_notes (high-signal) + truncated raw_content
  const sampleBlocks = samples.map((s, i) => {
    const styleNote = s.style_notes ? `Voice pattern: ${s.style_notes}` : "";
    const snippet = typeof s.raw_content === "string" && s.raw_content.length > 0
      ? `Post excerpt: ${s.raw_content.slice(0, 280)}`
      : "";
    return `Sample ${i + 1}:\n${[styleNote, snippet].filter(Boolean).join("\n")}`;
  }).join("\n\n");

  const prompt = `You are a writing style analyst. Study these ${samples.length} LinkedIn post samples from a single author and extract their writing fingerprint.

${sampleBlocks}

Return ONLY valid JSON with this exact schema (no preamble, no markdown):
{
  "hookStyle": "one of: contrarian_question | stat_number | story_scene | bold_statement | question | observation",
  "sentenceRhythm": "one of: short_punchy | medium_flowing | mixed_varied | long_analytical",
  "avgSentenceWords": <integer 8-25>,
  "humorPresence": "one of: none | dry_occasional | warm_frequent | self_deprecating",
  "emotionalIntensity": "one of: controlled | moderate | high | intense",
  "ctaStyle": "one of: reflective_question | direct_invitation | declarative | open_ended",
  "signaturePatterns": ["3-5 specific patterns observed, e.g. 'Starts with a number then pivots to story', 'Uses short 1-line paragraphs for emphasis', 'Closes with a direct question to the reader'"]
}`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenRouter API key not configured" }, { status: 500 });

  let styleDna: any = null;
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
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      console.error("[style-dna] OpenRouter error:", res.status, await res.text());
      return NextResponse.json({ ok: false, reason: "AI extraction failed" });
    }

    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "").trim();
    styleDna = extractJSON(raw);

    if (!styleDna?.hookStyle || !styleDna?.sentenceRhythm || !Array.isArray(styleDna?.signaturePatterns)) {
      console.error("[style-dna] Unexpected shape:", styleDna);
      return NextResponse.json({ ok: false, reason: "Unexpected extraction shape" });
    }

    styleDna.extractedAt = Date.now();
  } catch (err: any) {
    console.error("[style-dna] Extraction error:", err?.message || err);
    return NextResponse.json({ ok: false, reason: "Extraction threw: " + (err?.message || "unknown") });
  }

  // Save to profiles/{uid} — merge so other segment fields are not overwritten
  try {
    await adminDb.collection("profiles").doc(uid).set(
      { [`${segment}.style_dna`]: styleDna },
      { merge: true }
    );
    console.log(`[style-dna] Saved for uid=${uid} segment=${segment}`);
  } catch (err: any) {
    console.error("[style-dna] Firestore save failed:", err?.message);
    return NextResponse.json({ ok: false, reason: "Firestore save failed" });
  }

  return NextResponse.json({ ok: true, style_dna: styleDna });
}
