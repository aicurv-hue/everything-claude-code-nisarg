import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

/**
 * GET /api/linkedin/status
 *
 * Returns LinkedIn connection status for the AUTHENTICATED user only.
 * Reads from Firestore (tokens/{firebaseUid}) — never from cookies.
 *
 * Auto-refreshes the token if near expiry and updates Firestore.
 * Node.js runtime required (Firebase Admin SDK).
 */
const TOKEN_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function GET(req: NextRequest) {
  // ── Resolve Firebase UID ─────────────────────────────────────────────────
  let firebaseUid: string | null = null;
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ") && adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      firebaseUid = decoded.uid;
    } catch {
      // Invalid token
    }
  }

  if (!firebaseUid || !adminDb) {
    return NextResponse.json({ connected: false });
  }

  // ── Look up this user's token in Firestore ───────────────────────────────
  let tokenRecord: Record<string, any> | null = null;
  try {
    const snap = await adminDb.collection("tokens").doc(firebaseUid).get();
    tokenRecord = snap.exists ? snap.data()! : null;
  } catch (e) {
    console.warn("[linkedin/status] Firestore lookup failed:", e);
    return NextResponse.json({ connected: false });
  }

  if (!tokenRecord?.access_token) {
    return NextResponse.json({ connected: false });
  }

  // ── Auto-refresh if near expiry ──────────────────────────────────────────
  if (tokenRecord.refresh_token && tokenRecord.expires_at) {
    const timeLeft = tokenRecord.expires_at - Date.now();
    if (timeLeft < TOKEN_REFRESH_THRESHOLD_MS) {
      try {
        const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type:    "refresh_token",
            refresh_token: tokenRecord.refresh_token,
            client_id:     process.env.LINKEDIN_CLIENT_ID!,
            client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
          }),
        });
        if (tokenRes.ok) {
          const data = await tokenRes.json();
          const updates: Record<string, any> = {
            access_token: data.access_token,
            expires_at:   Date.now() + (data.expires_in || 5184000) * 1000,
          };
          if (data.refresh_token) {
            updates.refresh_token        = data.refresh_token;
            updates.refresh_expires_at   = Date.now() + (data.refresh_token_expires_in || 31536000) * 1000;
          }
          await adminDb.collection("tokens").doc(firebaseUid).update(updates);
          // Update local copy for response
          Object.assign(tokenRecord, updates);
          console.log(`[linkedin/status] Token auto-refreshed for ${firebaseUid}`);
        }
      } catch (e) {
        console.warn("[linkedin/status] Auto-refresh failed:", e);
      }
    }
  }

  return NextResponse.json({
    connected:    true,
    name:         tokenRecord.user_name    || "",
    picture:      tokenRecord.user_picture || "",
    email:        tokenRecord.user_email   || "",
    tokenDaysLeft: tokenRecord.expires_at
      ? Math.max(0, Math.floor((tokenRecord.expires_at - Date.now()) / (1000 * 60 * 60 * 24)))
      : 0,
  });
}
