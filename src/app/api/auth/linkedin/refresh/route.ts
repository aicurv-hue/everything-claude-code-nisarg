import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

/**
 * POST /api/auth/linkedin/refresh
 *
 * Silently exchanges the refresh_token for a new access_token.
 * Reads refresh_token from Firestore (tokens/{firebaseUid}) — never cookies.
 * Requires Authorization: Bearer <firebase-id-token> header.
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

  // ── Get refresh token from Firestore ────────────────────────────────────
  const snap = await adminDb.collection("tokens").doc(firebaseUid).get().catch(() => null);
  const tokenRecord = snap?.exists ? snap.data() : null;
  const refreshToken = tokenRecord?.refresh_token;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token found. User must re-authenticate." }, { status: 401 });
  }

  // ── Exchange with LinkedIn ───────────────────────────────────────────────
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: (process.env.LINKEDIN_CLIENT_ID || "").trim().replace(/\n/g, ""),
      client_secret: (process.env.LINKEDIN_CLIENT_SECRET || "").trim().replace(/\n/g, ""),
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[linkedin/refresh] Token refresh failed:", errText);
    // Clear stale Firestore token so UI shows "disconnected"
    await adminDb.collection("tokens").doc(firebaseUid).update({ access_token: null, refresh_token: null }).catch(() => {});
    return NextResponse.json({ error: "Token refresh failed. Please reconnect LinkedIn." }, { status: 401 });
  }

  const tokenData = await tokenRes.json();
  const newAccessToken: string = tokenData.access_token;
  const expiresIn: number = tokenData.expires_in || 5184000;
  const newRefreshToken: string | undefined = tokenData.refresh_token;
  const refreshExpiresIn: number = tokenData.refresh_token_expires_in || 31536000;

  // ── Save updated tokens to Firestore ────────────────────────────────────
  const updates: Record<string, any> = {
    access_token: newAccessToken,
    expires_at: Date.now() + expiresIn * 1000,
  };
  if (newRefreshToken) {
    updates.refresh_token = newRefreshToken;
    updates.refresh_expires_at = Date.now() + refreshExpiresIn * 1000;
  }
  await adminDb.collection("tokens").doc(firebaseUid).update(updates);

  console.log(`[linkedin/refresh] Token refreshed for ${firebaseUid}`);
  return NextResponse.json({ success: true, expiresIn });
}
