import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const TOKEN_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // Refresh if < 7 days remaining

/**
 * GET /api/linkedin/status
 *
 * Returns LinkedIn connection status.
 * If the access_token is near expiry and a refresh_token exists,
 * silently refreshes it so the user never has to re-authenticate.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken    = cookieStore.get("li_access_token")?.value;
  const refreshToken   = cookieStore.get("li_refresh_token")?.value;
  const tokenExpiry    = cookieStore.get("li_token_expiry")?.value;
  const name           = cookieStore.get("li_user_name")?.value    || "";
  const picture        = cookieStore.get("li_user_picture")?.value || "";
  const email          = cookieStore.get("li_user_email")?.value   || "";

  // No access token at all
  if (!accessToken) {
    // But we have a refresh token — silently refresh in background
    if (refreshToken) {
      try {
        const origin = new URL(req.url).origin;
        await fetch(`${origin}/api/auth/linkedin/refresh`, { method: "POST" });
        // After refresh, re-read cookies
        const refreshed = cookieStore.get("li_access_token")?.value;
        if (refreshed) {
          return NextResponse.json({ connected: true, name, picture, email, refreshed: true });
        }
      } catch {
        // Silent fail
      }
    }
    return NextResponse.json({ connected: false });
  }

  // Token exists — check if it's near expiry and auto-refresh
  if (refreshToken && tokenExpiry) {
    const expiryMs = Number(tokenExpiry);
    const timeLeft = expiryMs - Date.now();

    if (timeLeft < TOKEN_REFRESH_THRESHOLD_MS) {
      try {
        const origin = new URL(req.url).origin;
        await fetch(`${origin}/api/auth/linkedin/refresh`, { method: "POST" });
        console.log("[linkedin/status] Proactive token refresh triggered.");
      } catch {
        // Silent fail — still return connected with existing token
      }
    }
  }

  return NextResponse.json({
    connected: true,
    name,
    picture,
    email,
    organizationId: process.env.LINKEDIN_ORGANIZATION_ID || null,
    organizationUrn: process.env.LINKEDIN_ORGANIZATION_ID
      ? `urn:li:organization:${process.env.LINKEDIN_ORGANIZATION_ID}`
      : null,
  });
}
