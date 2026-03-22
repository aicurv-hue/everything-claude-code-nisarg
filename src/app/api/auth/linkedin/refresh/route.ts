import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/auth/linkedin/refresh
 *
 * Silently exchanges the refresh_token for a new access_token.
 * Called automatically by the status check when the token is near expiry.
 * Users never see this — it happens in the background.
 */
export async function POST(_req: NextRequest) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("li_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token found. User must re-authenticate." }, { status: 401 });
  }

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[linkedin/refresh] Token refresh failed:", errText);
    // Clear stale cookies so the UI shows "disconnected"
    cookieStore.delete("li_access_token");
    cookieStore.delete("li_refresh_token");
    cookieStore.delete("li_token_expiry");
    return NextResponse.json({ error: "Token refresh failed. Please reconnect LinkedIn." }, { status: 401 });
  }

  const tokenData = await tokenRes.json();
  const newAccessToken: string = tokenData.access_token;
  const expiresIn: number = tokenData.expires_in || 5184000;
  const newRefreshToken: string | undefined = tokenData.refresh_token;
  const refreshExpiresIn: number = tokenData.refresh_token_expires_in || 31536000;

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax" as const,
  };

  cookieStore.set("li_access_token", newAccessToken, { ...cookieOpts, maxAge: expiresIn });
  cookieStore.set("li_token_expiry", String(Date.now() + expiresIn * 1000), {
    httpOnly: false, maxAge: expiresIn, path: "/", sameSite: "lax",
  });

  if (newRefreshToken) {
    cookieStore.set("li_refresh_token", newRefreshToken, { ...cookieOpts, maxAge: refreshExpiresIn });
  }

  console.log("[linkedin/refresh] Token refreshed successfully.");
  return NextResponse.json({ success: true, expiresIn });
}
