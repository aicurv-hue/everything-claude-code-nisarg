import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

/**
 * GET /api/dashboard/stats
 *
 * Returns LinkedIn connection status and system health for the
 * AUTHENTICATED user only — looks up token from Firestore by Firebase UID.
 *
 * Cookies are NEVER used for auth decisions — Firestore is the source of truth.
 * Node.js runtime required (Firebase Admin SDK).
 */
export async function GET(req: NextRequest) {
  // ── Resolve Firebase UID from Authorization header ──────────────────────
  let firebaseUid: string | null = null;
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ") && adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      firebaseUid = decoded.uid;
    } catch {
      // Invalid token — continue, will show disconnected
    }
  }

  // ── Look up this user's LinkedIn token from Firestore ────────────────────
  let liName = "";
  let liPicture = "";
  let liEmail = "";
  let linkedInConnected = false;
  let hasRefreshToken = false;
  let tokenDaysLeft = 0;

  if (firebaseUid && adminDb) {
    try {
      const snap = await adminDb.collection("tokens").doc(firebaseUid).get();
      if (snap.exists) {
        const data = snap.data()!;
        linkedInConnected = !!data.access_token;
        hasRefreshToken   = !!data.refresh_token;
        liName            = data.user_name    || "";
        liPicture         = data.user_picture || "";
        liEmail           = data.user_email   || "";
        if (data.expires_at) {
          tokenDaysLeft = Math.max(0, Math.floor((data.expires_at - Date.now()) / (1000 * 60 * 60 * 24)));
        }
      }
    } catch (e) {
      console.warn("[dashboard/stats] Firestore lookup failed:", e);
    }
  }

  const openRouterKeySet   = !!process.env.OPENROUTER_API_KEY;
  const falKeySet          = !!process.env.FAL_API_KEY;
  const firebaseConfigured =
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "your-project-id";

  return NextResponse.json(
    {
      timestamp: Date.now(),
      linkedin: {
        connected: linkedInConnected,
        hasRefreshToken,
        tokenDaysLeft,
        name:    liName,
        picture: liPicture,
        email:   liEmail,
      },
      system: {
        aiEngine:    openRouterKeySet    ? "ready"       : "degraded",
        imageEngine: falKeySet           ? "ready"       : "degraded",
        profileSync: firebaseConfigured  ? "active"      : "mock",
        linkedin:    linkedInConnected   ? "connected"   : hasRefreshToken ? "refreshing" : "disconnected",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
