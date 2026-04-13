import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/utils/requireAdmin";

/**
 * POST /api/admin/migrate
 * Migrates all Firestore documents with user_id "demo-user" to a real Firebase UID.
 * Body: { targetEmail: "nisarg2526@gmail.com" }
 */
export async function POST(req: NextRequest) {
  // Accept either admin Firebase token OR CRON_SECRET for CLI usage
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCronAuth && !(await requireAdmin(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!adminDb || !adminAuth) return NextResponse.json({ error: "Admin SDK not configured" }, { status: 503 });

  const { targetEmail } = await req.json();
  if (!targetEmail) return NextResponse.json({ error: "targetEmail required" }, { status: 400 });

  // Look up the real Firebase UID for the target email
  const userRecord = await adminAuth.getUserByEmail(targetEmail);
  const realUid = userRecord.uid;

  const OLD_ID = "demo-user";
  const results: Record<string, number> = {};

  // Migrate each collection
  const collections = ["posts", "memory", "schedule_suggestions"];
  for (const col of collections) {
    const snap = await adminDb.collection(col).where("user_id", "==", OLD_ID).get();
    if (snap.empty) { results[col] = 0; continue; }

    const batch = adminDb.batch();
    snap.docs.forEach(doc => batch.update(doc.ref, { user_id: realUid }));
    await batch.commit();
    results[col] = snap.size;
  }

  // Migrate profile (stored as doc ID = user_id)
  const oldProfile = await adminDb.collection("profiles").doc(OLD_ID).get();
  if (oldProfile.exists) {
    const data = oldProfile.data()!;
    await adminDb.collection("profiles").doc(realUid).set(data, { merge: true });
    await adminDb.collection("profiles").doc(OLD_ID).delete();
    results["profiles"] = 1;
  } else {
    results["profiles"] = 0;
  }

  // Migrate LinkedIn token (stored as doc ID = user_id)
  const oldToken = await adminDb.collection("tokens").doc(OLD_ID).get();
  if (oldToken.exists) {
    const data = oldToken.data()!;
    await adminDb.collection("tokens").doc(realUid).set({ ...data, user_id: realUid }, { merge: true });
    await adminDb.collection("tokens").doc(OLD_ID).delete();
    results["tokens"] = 1;
  } else {
    results["tokens"] = 0;
  }

  return NextResponse.json({
    success: true,
    targetEmail,
    realUid,
    migrated: results,
  });
}
