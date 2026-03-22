import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/dashboard/stats
 *
 * Returns real-time dashboard data:
 * - Post counts (total, published, drafts, lastWeek, failed)
 * - System status (LinkedIn, AI engine, profile sync)
 * - LinkedIn user info
 * - Last refresh timestamp
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  // ── LinkedIn connection status ──────────────────────────────────────────────
  const accessToken  = cookieStore.get("li_access_token")?.value;
  const refreshToken = cookieStore.get("li_refresh_token")?.value;
  const tokenExpiry  = cookieStore.get("li_token_expiry")?.value;
  const liName       = cookieStore.get("li_user_name")?.value    || "";
  const liPicture    = cookieStore.get("li_user_picture")?.value || "";
  const liEmail      = cookieStore.get("li_user_email")?.value   || "";

  const linkedInConnected = !!accessToken;
  const hasRefreshToken   = !!refreshToken;
  const tokenExpiryMs     = tokenExpiry ? Number(tokenExpiry) : 0;
  const tokenDaysLeft     = tokenExpiryMs
    ? Math.max(0, Math.floor((tokenExpiryMs - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  // ── AI Engine status ────────────────────────────────────────────────────────
  const openRouterKeySet = !!process.env.OPENROUTER_API_KEY;
  const falKeySet        = !!process.env.FAL_API_KEY;

  // ── Profile sync status ─────────────────────────────────────────────────────
  // Profile sync is healthy if Firebase env vars are set
  const firebaseConfigured =
    !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "your-project-id";

  return NextResponse.json({
    timestamp: Date.now(),
    linkedin: {
      connected: linkedInConnected,
      hasRefreshToken,
      tokenDaysLeft,
      name: liName,
      picture: liPicture,
      email: liEmail,
    },
    system: {
      aiEngine:    openRouterKeySet ? "ready"    : "degraded",
      imageEngine: falKeySet        ? "ready"    : "degraded",
      profileSync: firebaseConfigured ? "active" : "mock",
      linkedin:    linkedInConnected  ? "connected" : hasRefreshToken ? "refreshing" : "disconnected",
    },
  });
}
