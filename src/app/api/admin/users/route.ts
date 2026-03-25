/**
 * Admin-only API routes for user management.
 * Protected by ADMIN_SECRET header check.
 * All operations use Firebase Admin SDK.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken || !adminAuth) return false;
    const decoded = await adminAuth.verifyIdToken(idToken);
    return ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || "");
  } catch {
    return false;
  }
}

/** GET /api/admin/users — list all Firebase Auth users with post counts */
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!adminAuth || !adminDb) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  try {
    const listResult = await adminAuth.listUsers(1000);

    const users = await Promise.all(
      listResult.users.map(async (u) => {
        // Count posts for this user
        const postSnap = await adminDb!.collection("posts")
          .where("user_id", "==", u.uid)
          .count()
          .get();

        // Check if LinkedIn token exists
        const tokenDoc = await adminDb!.collection("tokens").doc(u.uid).get();

        return {
          uid:               u.uid,
          email:             u.email || "",
          displayName:       u.displayName || "",
          createdAt:         u.metadata.creationTime,
          lastSignIn:        u.metadata.lastSignInTime,
          disabled:          u.disabled,
          postCount:         postSnap.data().count,
          linkedInConnected: tokenDoc.exists,
        };
      })
    );

    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH /api/admin/users — enable/disable a user */
export async function PATCH(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminAuth) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  const { uid, disabled } = await req.json();
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  await adminAuth.updateUser(uid, { disabled });
  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/users — permanently delete a user and all their data */
export async function DELETE(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminAuth || !adminDb) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  const { uid } = await req.json();
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  // Delete all user data from Firestore
  const collections = ["posts", "post_memories", "tokens", "schedule_suggestions"];
  for (const col of collections) {
    const snap = await adminDb.collection(col).where("user_id", "==", uid).get();
    const batch = adminDb.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    if (snap.docs.length > 0) await batch.commit();
  }

  // Delete profile doc (keyed by uid directly)
  await adminDb.collection("profiles").doc(uid).delete().catch(() => {});

  // Delete Firebase Auth account
  await adminAuth.deleteUser(uid);

  return NextResponse.json({ success: true });
}
