import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/admin/beta-access
 * Add or remove an email from the beta allowlist.
 *
 * Auth: Bearer <Firebase ID token> (must be in ADMIN_EMAILS)
 *    OR Bearer <CRON_SECRET>  (legacy, kept for scripts)
 *
 * Body: { email: string, action: "add" | "remove" }
 *
 * GET /api/admin/beta-access
 * List all approved emails + pending (signed-up but not yet approved) users.
 */

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return false;

  // Option 1: CRON_SECRET (legacy scripts)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return true;

  // Option 2: Firebase ID token with admin email check
  try {
    if (!adminAuth) return false;
    const decoded = await adminAuth.verifyIdToken(token);
    return ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || "");
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ error: "Admin SDK not configured" }, { status: 503 });
  }

  const { email, action } = await req.json();
  if (!email || !["add", "remove"].includes(action)) {
    return NextResponse.json({ error: "email and action (add|remove) required" }, { status: 400 });
  }

  const key = (email as string).toLowerCase().trim();
  const ref = adminDb.collection("beta_access").doc(key);

  if (action === "add") {
    await ref.set({ approved: true, email: key, added_at: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, action: "added", email: key });
  } else {
    await ref.delete();
    return NextResponse.json({ success: true, action: "removed", email: key });
  }
}

export async function GET(req: NextRequest) {
  if (!await isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ error: "Admin SDK not configured" }, { status: 503 });
  }

  const snap = await adminDb.collection("beta_access").where("approved", "==", true).get();
  const approved = snap.docs.map(d => ({
    email: d.data().email as string,
    added_at: d.data().added_at?.toDate?.()?.toISOString() ?? null,
  }));
  return NextResponse.json({ count: approved.length, approved });
}
