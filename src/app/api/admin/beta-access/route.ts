import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * POST /api/admin/beta-access
 * Add or remove an email from the beta allowlist.
 *
 * Auth: Bearer <CRON_SECRET>
 *
 * Body:
 *   { email: "user@example.com", action: "add" | "remove" }
 *
 * GET /api/admin/beta-access
 * List all approved emails.
 */

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // Must set CRON_SECRET to use this endpoint
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
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
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ error: "Admin SDK not configured" }, { status: 503 });
  }

  const snap = await adminDb.collection("beta_access").where("approved", "==", true).get();
  const emails = snap.docs.map(d => d.data().email as string);
  return NextResponse.json({ count: emails.length, emails });
}
