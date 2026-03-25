import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { tokenService } from "@/lib/db/tokens";

const COOKIE_OPTS_PRIVATE = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge,
  path: "/",
  sameSite: "lax" as const,
});

const COOKIE_OPTS_PUBLIC = (maxAge: number) => ({
  httpOnly: false,
  maxAge,
  path: "/",
  sameSite: "lax" as const,
});

/**
 * Fetches LinkedIn userinfo with a hard timeout so network issues never crash the callback.
 */
async function fetchLinkedInProfile(accessToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timeout);
    console.warn("[linkedin/callback] userinfo fetch timed out or failed — continuing without profile");
    return null;
  }
}

/**
 * GET /api/auth/linkedin/callback
 *
 * LinkedIn OAuth callback. Exchanges code for tokens, stores them in
 * long-lived cookies (refresh_token valid 365 days), then redirects.
 *
 * After this, users NEVER need to log in again — the refresh_token
 * silently renews the access_token in the background.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Parse returnTo + Firebase UID from state (format: "randomString|encodedReturnTo|encodedUid")
  const rawState = searchParams.get("state") || "";
  const stateParts = rawState.split("|");
  const returnTo    = stateParts[1] ? decodeURIComponent(stateParts[1]) : "/dashboard/create/preview";
  const firebaseUid = stateParts[2] ? decodeURIComponent(stateParts[2]) : "";

  if (error || !code) {
    const reason = searchParams.get("error_description") || error || "Unknown error";
    return NextResponse.redirect(
      new URL(`/dashboard/settings?linkedin_error=${encodeURIComponent(reason)}`, request.url)
    );
  }

  // ── Step 1: Exchange code for tokens ──────────────────────────────────────
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[linkedin/callback] Token exchange failed:", errText);
    return NextResponse.redirect(
      new URL("/dashboard/settings?linkedin_error=token_exchange_failed", request.url)
    );
  }

  const tokenData = await tokenRes.json();
  const accessToken: string = tokenData.access_token;
  const expiresIn: number = tokenData.expires_in || 5184000;         // ~60 days
  const refreshToken: string | undefined = tokenData.refresh_token;
  const refreshExpiresIn: number = tokenData.refresh_token_expires_in || 31536000; // ~365 days

  // ── Step 2: Fetch profile (non-blocking — timeout safe) ───────────────────
  const profile = await fetchLinkedInProfile(accessToken);
  const linkedInSub     = profile?.sub      || "";
  const linkedInName    = profile?.name     || "";
  const linkedInEmail   = profile?.email    || "";
  const linkedInPicture = profile?.picture  || "";

  // ── Step 3: Store all tokens in cookies ───────────────────────────────────
  const cookieStore = await cookies();

  // Access token — 60 days
  cookieStore.set("li_access_token", accessToken, COOKIE_OPTS_PRIVATE(expiresIn));
  cookieStore.set("li_token_expiry", String(Date.now() + expiresIn * 1000), COOKIE_OPTS_PUBLIC(expiresIn));

  // Refresh token — 365 days (permanent login)
  if (refreshToken) {
    cookieStore.set("li_refresh_token", refreshToken, COOKIE_OPTS_PRIVATE(refreshExpiresIn));
  }

  // User identity
  cookieStore.set("li_user_sub",     linkedInSub,     COOKIE_OPTS_PRIVATE(refreshExpiresIn));
  cookieStore.set("li_user_name",    linkedInName,    COOKIE_OPTS_PUBLIC(refreshExpiresIn));
  cookieStore.set("li_user_picture", linkedInPicture, COOKIE_OPTS_PUBLIC(refreshExpiresIn));
  cookieStore.set("li_user_email",   linkedInEmail,   COOKIE_OPTS_PUBLIC(refreshExpiresIn));

  // ── Step 3b: Persist tokens to DB so the scheduled-post worker can use them ─
  await tokenService.save({
    user_id:            firebaseUid,
    access_token:       accessToken,
    refresh_token:      refreshToken,
    user_sub:           linkedInSub,
    user_name:          linkedInName,
    user_email:         linkedInEmail,
    user_picture:       linkedInPicture,
    expires_at:         Date.now() + expiresIn * 1000,
    refresh_expires_at: refreshToken ? Date.now() + refreshExpiresIn * 1000 : undefined,
  }).catch(err => console.warn("[linkedin/callback] Token DB save failed (non-critical):", err));

  // ── Step 4: Redirect back to where they came from ─────────────────────────
  const destination = returnTo.startsWith("/") ? returnTo : "/dashboard/create/preview";
  const finalUrl = new URL(`${destination}?linkedin_connected=true`, request.url);

  // If this was opened as a popup (returnTo is /dashboard/settings),
  // return a self-closing page instead of a redirect so the popup closes
  // and the opener window refreshes its LinkedIn status automatically.
  if (destination === "/dashboard/settings") {
    return new Response(
      `<!DOCTYPE html><html><head><title>Connected</title></head><body>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: "linkedin_connected" }, window.location.origin);
          window.close();
        } else {
          window.location.href = "${finalUrl.toString()}";
        }
      </script>
      <p style="font-family:sans-serif;text-align:center;margin-top:40px;color:#0A66C2">
        ✅ LinkedIn connected! Closing window...
      </p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return NextResponse.redirect(finalUrl);
}
