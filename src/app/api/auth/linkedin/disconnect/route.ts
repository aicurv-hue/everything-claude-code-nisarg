import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * POST /api/auth/linkedin/disconnect
 * Clears all LinkedIn cookies — called via fetch() from Settings UI.
 */
export async function POST(req: NextRequest) {
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

  return NextResponse.json({ disconnected: true });
}

// Also support GET for backwards-compat (redirects to settings)
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const liCookies = ["li_access_token","li_refresh_token","li_token_expiry","li_user_sub","li_user_name","li_user_picture","li_user_email"];
  for (const name of liCookies) cookieStore.set(name, "", { maxAge: 0, path: "/" });
  return NextResponse.redirect(new URL("/dashboard/settings", req.url));
}
