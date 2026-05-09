import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/utils/requireAdmin";

/**
 * GET  /api/admin/waitlist         — list pending waitlist entries
 * POST /api/admin/waitlist         — approve or reject an entry
 *   body: { email: string, action: "approve" | "reject" }
 */

async function auth(req: NextRequest) {
  return !!(await requireAdmin(req));
}

export async function GET(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK not configured" }, { status: 503 });

  const snap = await adminDb.collection("waitlist").get();
  const entries = snap.docs
    .map(d => ({
      email: d.data().email as string,
      name: d.data().name as string | null,
      source: d.data().source as string,
      status: d.data().status as string,
      created_at: d.data().created_at?.toDate?.()?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  return NextResponse.json({ entries });
}

export async function POST(req: NextRequest) {
  if (!await auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK not configured" }, { status: 503 });

  const { email, action } = await req.json();
  const key = (email as string)?.toLowerCase().trim();
  if (!key || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "email and action (approve|reject) required" }, { status: 400 });
  }

  const waitlistRef = adminDb.collection("waitlist").doc(key);

  if (action === "approve") {
    // Add to beta_access
    await adminDb.collection("beta_access").doc(key).set({
      approved: true,
      email: key,
      added_at: FieldValue.serverTimestamp(),
    });
    // Mark waitlist entry as approved
    await waitlistRef.update({ status: "approved", approved_at: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, action: "approved", email: key });
  } else {
    await waitlistRef.update({ status: "rejected", rejected_at: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true, action: "rejected", email: key });
  }
}
