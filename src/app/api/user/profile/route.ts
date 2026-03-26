/**
 * GET /api/user/profile
 *
 * Returns the authenticated user's profile from Firestore.
 * Used by the preview page to read per-user settings like linkedinOrganizationId.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken || !adminAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    if (!adminDb) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }

    const snap = await adminDb.collection("profiles").doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({});
    }

    return NextResponse.json(snap.data());
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
