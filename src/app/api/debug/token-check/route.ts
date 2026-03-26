/**
 * GET /api/debug/token-check?uid=FIREBASE_UID
 * Checks what's in Firestore tokens collection for a given UID.
 * DELETE THIS ROUTE after debugging.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  const uid = new URL(req.url).searchParams.get("uid");

  const result: Record<string, any> = {
    adminDb_available: !!adminDb,
    uid_received: uid,
  };

  if (!adminDb) {
    result.error = "adminDb is NULL — FIREBASE_SERVICE_ACCOUNT_JSON env var is likely missing or invalid in Vercel";
    return NextResponse.json(result, { status: 503 });
  }

  if (!uid) {
    return NextResponse.json({ error: "Pass ?uid=FIREBASE_UID" }, { status: 400 });
  }

  try {
    const snap = await adminDb.collection("tokens").doc(uid).get();
    result.token_doc_exists = snap.exists;
    if (snap.exists) {
      const d = snap.data()!;
      result.has_access_token = !!d.access_token;
      result.has_refresh_token = !!d.refresh_token;
      result.user_sub = d.user_sub || null;
      result.user_name = d.user_name || null;
      result.expires_at = d.expires_at ? new Date(d.expires_at).toISOString() : null;
      result.expires_at_ms = d.expires_at || null;
      result.is_expired = d.expires_at ? d.expires_at < Date.now() : null;
      result.updated_at = d.updated_at?.toDate?.()?.toISOString() || null;
    }
  } catch (err: any) {
    result.firestore_error = err?.message || String(err);
  }

  return NextResponse.json(result);
}
