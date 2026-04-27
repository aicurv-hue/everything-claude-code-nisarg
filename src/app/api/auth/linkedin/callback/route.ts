import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Edge Runtime — no timeout limit on Vercel Hobby plan
export const runtime = "edge";

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
  const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

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

  // Validate state: must match the httpOnly cookie set during initiation (CSRF protection)
  const cookieStore = await cookies();
  const storedState = cookieStore.get("li_oauth_state")?.value || "";
  cookieStore.delete("li_oauth_state"); // consume — one-time use
  if (!rawState || !storedState || rawState !== storedState || stateParts.length < 2 || !/^[0-9a-f]{32}$/i.test(stateParts[0])) {
    console.error("[linkedin/callback] State mismatch or invalid — possible CSRF attempt");
    return oauthResponse(request.url, null, "OAuth state invalid — please try again");
  }

  if (error || !code) {
    const reason = searchParams.get("error_description") || error || "Unknown error";
    return oauthResponse(request.url, null, reason);
  }

  // Trim env vars — strip whitespace AND literal \n that Vercel sometimes injects
  const clean = (v: string | undefined) => (v || "").trim().replace(/\\n/g, "").replace(/\n/g, "");
  const clientId     = clean(process.env.LINKEDIN_CLIENT_ID);
  const clientSecret = clean(process.env.LINKEDIN_CLIENT_SECRET);
  const redirectUri  = clean(process.env.LINKEDIN_REDIRECT_URI);

  // ── Step 1: Exchange code for tokens ──────────────────────────────────────
  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error("[linkedin/callback] Token exchange failed:", errText);
    let reason = "token_exchange_failed";
    try {
      const errJson = JSON.parse(errText);
      reason = errJson.error_description || errJson.error || reason;
    } catch {}
    return oauthResponse(request.url, null, reason);
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

  // ── Step 3b: Persist tokens to DB via internal Node.js route ─────────────────
  // Edge Runtime cannot use Firebase client SDK reliably — delegate to /api/tokens/save
  // (Node.js runtime + Admin SDK). MUST be awaited — Edge terminates on response,
  // so fire-and-forget gets killed before the Firestore write completes.
  if (firebaseUid) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.url.split("/api/")[0];
    try {
      const saveRes = await fetch(`${appUrl}/api/tokens/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {}),
        },
        body: JSON.stringify({
          user_id:            firebaseUid,
          access_token:       accessToken,
          refresh_token:      refreshToken ?? null,
          user_sub:           linkedInSub,
          user_name:          linkedInName,
          user_email:         linkedInEmail,
          user_picture:       linkedInPicture,
          expires_at:         Date.now() + expiresIn * 1000,
          refresh_expires_at: refreshToken ? Date.now() + refreshExpiresIn * 1000 : null,
        }),
      });
      if (!saveRes.ok) {
        console.error("[linkedin/callback] Token DB save returned", saveRes.status, await saveRes.text());
      } else {
        console.log(`[linkedin/callback] Token saved for user ${firebaseUid}`);
      }
    } catch (err) {
      console.error("[linkedin/callback] Token DB save failed:", err);
    }
  } else {
    console.warn("[linkedin/callback] No Firebase UID in state — token not persisted. User must include uid= in OAuth link.");
  }

  // ── Step 4: Return to where they came from ───────────────────────────────
  const destination = returnTo.startsWith("/") ? returnTo : "/dashboard/settings";
  return oauthResponse(request.url, destination, null);
}

/**
 * Returns an HTML response that works for both popup and full-redirect OAuth flows.
 *
 * Popup flow  → posts a postMessage to window.opener, then closes the popup.
 *               The main window stays alive (Firebase auth is never lost).
 * Full-redirect → falls back to window.location.replace (legacy behaviour,
 *               e.g. <a href> links on other pages).
 *
 * Using HTML instead of NextResponse.redirect prevents Firebase auth loss on
 * mobile / privacy browsers where a full-page cross-origin redirect can wipe
 * IndexedDB before the app rehydrates.
 */
function oauthResponse(requestUrl: string, destination: string | null, errorMsg: string | null): NextResponse {
  const base = new URL(requestUrl).origin;
  const successPath = destination ?? "/dashboard/settings";
  const successUrl  = `${base}${successPath}?linkedin_connected=true`;
  const errorUrl    = `${base}/dashboard/settings?linkedin_error=${encodeURIComponent(errorMsg ?? "Unknown error")}`;

  const redirectUrl = errorMsg ? errorUrl : successUrl;
  const message     = errorMsg
    ? JSON.stringify({ type: "linkedin_error",     message: errorMsg })
    : JSON.stringify({ type: "linkedin_connected" });
  const origin      = JSON.stringify(base);
  const safeUrl     = JSON.stringify(redirectUrl);

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>LinkedIn OAuth</title></head>
<body>
<p style="font-family:sans-serif;padding:24px;color:#666">Connecting your LinkedIn account&hellip;</p>
<script>
(function () {
  var msg = ${message};
  var url = ${safeUrl};
  var org = ${origin};
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(msg, org);
      window.close();
      return;
    }
  } catch (_) {}
  window.location.replace(url);
})();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
