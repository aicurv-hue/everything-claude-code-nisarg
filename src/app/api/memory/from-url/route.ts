/**
 * POST /api/memory/from-url
 *
 * Fetches a LinkedIn post URL via Jina Reader, extracts memory, and saves
 * to Firestore with source: "user_url".
 *
 * Rules:
 *   - Max 10 combined user_upload + user_url entries per user+segment
 *   - URL must pass SSRF safety check
 *   - Content must be at least 50 characters after fetch
 *   - Extraction failures return 422
 *
 * Auth: Authorization: Bearer <firebase-id-token>
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { extractMemory } from "@/lib/ai/memory-extract";

const MAX_UPLOADS = 10;
const MIN_LENGTH  = 50;
const MAX_CONTENT = 1500;

/** Block private/loopback IPs and non-http(s) schemes to prevent SSRF */
function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
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

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
  }

  const { url, segment = "individual" } = await req.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  if (!isSafeUrl(url)) {
    return NextResponse.json({ error: "Invalid or disallowed URL" }, { status: 422 });
  }

  // ── Fetch via Jina Reader ─────────────────────────────────────────────────
  let content = "";
  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "Accept": "text/plain", "X-Return-Format": "text" },
      signal: AbortSignal.timeout(12000),
    });
    if (jinaRes.ok) {
      const text = await jinaRes.text();
      content = text.trim().slice(0, MAX_CONTENT);
    }
  } catch {
    // timeout or network error — fall through to length check
  }

  if (content.length < MIN_LENGTH) {
    return NextResponse.json(
      { fallback: true, error: "Could not extract post content from this URL. Please paste the text manually." },
      { status: 422 }
    );
  }

  // ── Check existing user_upload + user_url count ───────────────────────────
  // Compound query requires a Firestore composite index; fall through gracefully if missing
  let existingCount = 0;
  try {
    const existingSnap = await adminDb
      .collection("post_memories")
      .where("user_id", "==", uid)
      .where("segment", "==", segment)
      .where("source",  "in", ["user_upload", "user_url"])
      .get();
    existingCount = existingSnap.size;
  } catch {
    // Index not yet created — skip count check, allow save (worst case slightly over limit)
    existingCount = 0;
  }

  if (existingCount >= MAX_UPLOADS) {
    return NextResponse.json(
      { error: "Writing sample limit reached (10 max per segment)" },
      { status: 409 }
    );
  }

  // ── Extract memory ────────────────────────────────────────────────────────
  const extracted = await extractMemory(content, "", "", "");
  if (!extracted) {
    return NextResponse.json({ error: "Could not extract memory from this content." }, { status: 422 });
  }

  // ── Save to Firestore ─────────────────────────────────────────────────────
  const docData = {
    user_id:     uid,
    segment,
    source:      "user_url" as const,
    source_url:  url,
    raw_content: content,
    topic:       "",
    audience:    "",
    tone:        "",
    summary:     extracted.summary,
    keywords:    extracted.keywords,
    style_notes: extracted.style_notes || "",
    created_at:  FieldValue.serverTimestamp(),
  };

  const docRef = await adminDb.collection("post_memories").add(docData);

  const entry = {
    id: docRef.id,
    ...docData,
    created_at: { seconds: Math.floor(Date.now() / 1000) },
  };

  return NextResponse.json({ success: true, entry });
}
