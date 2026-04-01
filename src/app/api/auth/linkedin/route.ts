import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/linkedin?returnTo=/dashboard/create/preview
 *
 * Redirects the user to LinkedIn's OAuth 2.0 authorization page.
 * Passes `returnTo` in the state so the callback redirects them
 * back to exactly where they were after connecting.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get("returnTo") || "/dashboard/create/preview";
  const firebaseUid = searchParams.get("uid") || "";

  const clientId   = (process.env.LINKEDIN_CLIENT_ID   || "").trim();
  const redirectUri = (process.env.LINKEDIN_REDIRECT_URI || "").trim();

  const scope = [
    "openid",
    "profile",
    "email",
    "w_member_social",       // post on behalf of personal profile
    // r_member_social requires LinkedIn Partner approval — blocks the consent screen
  ].join(" ");

  // Embed returnTo + Firebase UID in state for CSRF protection + user identification
  // Use cryptographically secure random — Math.random() is predictable
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const randomPart  = Array.from(randomBytes).map(b => b.toString(16).padStart(2, "0")).join("");
  const state = `${randomPart}|${encodeURIComponent(returnTo)}|${encodeURIComponent(firebaseUid)}`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
  });

  const linkedInAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  const response = NextResponse.redirect(linkedInAuthUrl);

  // Store state in httpOnly cookie so callback can verify CSRF
  response.cookies.set("li_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600, // 10 minutes — enough for any OAuth flow
    path: "/",
    sameSite: "lax",
  });

  return response;
}
