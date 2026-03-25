import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

/**
 * GET /api/beta/check?email=user@example.com
 * Returns { approved: boolean }
 * Used by AuthGuard after login to gate dashboard access.
 *
 * Approval order:
 *   1. BETA_APPROVED_EMAILS env var (comma-separated) — instant, no DB needed
 *   2. Firestore beta_access collection (for runtime additions)
 */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) return NextResponse.json({ approved: false });

  // 1. Check env var allowlist first (works without Admin SDK)
  const envList = (process.env.BETA_APPROVED_EMAILS || "")
    .split(",")
    .map(e => e.toLowerCase().trim())
    .filter(Boolean);
  if (envList.includes(email)) return NextResponse.json({ approved: true });

  // 2. Check Firestore (for emails added at runtime via admin API)
  if (!adminDb) return NextResponse.json({ approved: false });

  const doc = await adminDb.collection("beta_access").doc(email).get();
  const approved = doc.exists && doc.data()?.approved === true;
  return NextResponse.json({ approved });
}
