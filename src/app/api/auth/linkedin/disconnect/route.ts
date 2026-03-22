import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * GET /api/auth/linkedin/disconnect
 * Clears all LinkedIn cookies and redirects to settings.
 */
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  const liCookies = [
    "li_access_token",
    "li_refresh_token",
    "li_token_expiry",
    "li_user_sub",
    "li_user_name",
    "li_user_picture",
    "li_user_email",
  ];

  for (const name of liCookies) {
    cookieStore.set(name, "", { maxAge: 0, path: "/" });
  }

  return NextResponse.redirect(
    new URL("/api/auth/linkedin?returnTo=/dashboard/create/preview", req.url)
  );
}
