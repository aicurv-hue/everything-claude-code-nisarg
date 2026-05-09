/**
 * POST /api/memory/upload
 *
 * Accepts up to 10 LinkedIn posts pasted by the user.
 * Runs memory extraction on each, saves to Firestore with source: "user_upload".
 *
 * Rules:
 *   - Max 10 user_upload entries per user+segment (enforced server-side)
 *   - If already at 10, returns 409 with count so UI can show the warning
 *   - Each post must be at least 50 characters
 *   - Extraction failures are skipped (saved: N, failed: M)
 *
 * Auth: Authorization: Bearer <firebase-id-token>
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { extractMemory } from "@/lib/ai/memory-extract";

const MAX_UPLOADS = 10;
const MIN_LENGTH  = 50;

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let firebaseUid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    firebaseUid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
  }

  const { posts, segment = "individual" } = await req.json();

  if (!Array.isArray(posts) || posts.length === 0) {
    return NextResponse.json({ error: "posts must be a non-empty array" }, { status: 400 });
  }

  // ── Check existing upload count for this user+segment ────────────────────
  const existingSnap = await adminDb
    .collection("post_memories")
    .where("user_id",  "==", firebaseUid)
    .where("segment",  "==", segment)
    .where("source",   "==", "user_upload")
    .get();

  const existingCount = existingSnap.size;

  if (existingCount >= MAX_UPLOADS) {
    return NextResponse.json(
      { error: `You already have ${existingCount} writing samples. Delete one before adding more.`, count: existingCount },
      { status: 409 }
    );
  }

  const slots = MAX_UPLOADS - existingCount;
  const batch  = posts.slice(0, slots); // never exceed 10 total

  let saved  = 0;
  let failed = 0;
  const entries: any[] = [];

  for (const raw of batch) {
    const content = typeof raw === "string" ? raw.trim() : "";
    if (content.length < MIN_LENGTH) { failed++; continue; }

    try {
      // Extract summary, keywords, style_notes from the raw post
      const extract = await extractMemory(content, "", "", "");
      if (!extract) { failed++; continue; }

      const docRef = await adminDb.collection("post_memories").add({
        user_id:     firebaseUid,
        segment,
        source:      "user_upload",
        raw_content: content,
        topic:       "",     // not applicable for user uploads
        audience:    "",
        tone:        "",
        summary:     extract.summary,
        keywords:    extract.keywords,
        style_notes: extract.style_notes || "",
        created_at:  FieldValue.serverTimestamp(),
      });

      entries.push({
        id:          docRef.id,
        user_id:     firebaseUid,
        segment,
        source:      "user_upload",
        raw_content: content,
        topic:       "",
        audience:    "",
        tone:        "",
        summary:     extract.summary,
        keywords:    extract.keywords,
        style_notes: extract.style_notes || "",
        created_at:  { seconds: Math.floor(Date.now() / 1000) },
      });

      saved++;
    } catch (err) {
      console.error("[memory/upload] extraction/save failed:", err);
      failed++;
    }
  }

  console.log(`[memory/upload] uid=${firebaseUid} segment=${segment} saved=${saved} failed=${failed}`);

  // Fire-and-forget Style DNA re-extraction whenever samples are added.
  // Ensures the style fingerprint stays current without blocking the upload response.
  if (saved > 0) {
    const origin = req.headers.get("origin") || req.nextUrl.origin;
    fetch(`${origin}/api/profiles/style-dna`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: req.headers.get("authorization") || "",
      },
      body: JSON.stringify({ segment }),
    }).catch((e) => console.warn("[memory/upload] style-dna trigger failed:", e?.message));
  }

  return NextResponse.json({ saved, failed, entries, total: existingCount + saved });
}
