import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Edge Runtime — reads only cookies + env vars, no Node.js modules needed
export const runtime = "edge";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

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

  const openRouterKeySet  = !!process.env.OPENROUTER_API_KEY;
  const falKeySet         = !!process.env.FAL_API_KEY;
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
        name: liName,
        picture: liPicture,
        email: liEmail,
      },
      system: {
        aiEngine:    openRouterKeySet    ? "ready"       : "degraded",
        imageEngine: falKeySet           ? "ready"       : "degraded",
        profileSync: firebaseConfigured  ? "active"      : "mock",
        linkedin:    linkedInConnected   ? "connected"   : hasRefreshToken ? "refreshing" : "disconnected",
      },
    },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
