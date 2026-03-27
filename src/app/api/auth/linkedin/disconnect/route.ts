import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

/**
 * POST /api/auth/linkedin/disconnect
 *
 * Removes LinkedIn tokens from Firestore for the authenticated user.
 * Requires Authorization: Bearer <firebase-id-token> header.
 * Cookies are NEVER used — Firestore is the source of truth.
 */
export async function POST(req: NextRequest) {
  // ── Resolve Firebase UID ────────────────────────────────────────────────
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
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // ── Delete LinkedIn token fields from Firestore ─────────────────────────
  const { FieldValue } = await import("firebase-admin/firestore");
  await adminDb.collection("tokens").doc(firebaseUid).set(
    {
      access_token:       FieldValue.delete(),
      refresh_token:      FieldValue.delete(),
      expires_at:         FieldValue.delete(),
      refresh_expires_at: FieldValue.delete(),
      user_sub:           FieldValue.delete(),
      user_name:          FieldValue.delete(),
      user_picture:       FieldValue.delete(),
      user_email:         FieldValue.delete(),
    },
    { merge: true }
  );

  console.log(`[linkedin/disconnect] Disconnected LinkedIn for ${firebaseUid}`);
  return NextResponse.json({ disconnected: true });
}

// GET redirect — kept for backwards compat but now also clears Firestore if auth provided
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ") && adminAuth && adminDb) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      const { FieldValue } = await import("firebase-admin/firestore");
      await adminDb.collection("tokens").doc(decoded.uid).set(
        {
          access_token: FieldValue.delete(), refresh_token: FieldValue.delete(),
          expires_at: FieldValue.delete(), refresh_expires_at: FieldValue.delete(),
          user_sub: FieldValue.delete(), user_name: FieldValue.delete(),
          user_picture: FieldValue.delete(), user_email: FieldValue.delete(),
        },
        { merge: true }
      );
    } catch {}
  }
  return NextResponse.redirect(new URL("/dashboard/settings", req.url));
}
