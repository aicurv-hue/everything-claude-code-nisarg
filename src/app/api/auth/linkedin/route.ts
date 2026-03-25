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

  const clientId   = process.env.LINKEDIN_CLIENT_ID!;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI!;

  const scope = [
    "openid",
    "profile",
    "email",
    "w_member_social",       // post on behalf of personal profile
    "w_organization_social", // post on behalf of company page
    "r_organization_social", // read company page posts
  ].join(" ");

  // Embed returnTo + Firebase UID in state for CSRF protection + user identification
  const state = `${Math.random().toString(36).substring(2)}|${encodeURIComponent(returnTo)}|${encodeURIComponent(firebaseUid)}`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
  });

  const linkedInAuthUrl = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  return NextResponse.redirect(linkedInAuthUrl);
}
