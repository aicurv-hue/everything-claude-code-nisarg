import { NextRequest, NextResponse } from "next/server";

/**
 * Next.js middleware — runs at the edge before any route handler.
 *
 * Responsibilities:
 *   1. CORS: Reject cross-origin API requests from unauthorized origins
 *   2. Body size: Reject requests with Content-Length > limits (DoS prevention)
 */

// Origins allowed to call our API routes.
// Includes all known production/preview domains. Set CORS_ALLOWED_ORIGINS in Vercel
// env vars as comma-separated URLs to extend without a code change.
const HARDCODED_ORIGINS = [
  "https://app.cridl.com",
  "https://linkedin-automation-chi.vercel.app",
];
const ALLOWED_ORIGINS = new Set([
  ...HARDCODED_ORIGINS,
  ...(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
]);

// Body size limits per route pattern (in bytes)
const BODY_LIMITS: Array<{ pattern: RegExp; limit: number }> = [
  { pattern: /^\/api\/ai\//, limit: 1 * 1024 * 1024 },         // AI routes: 1 MB
  { pattern: /^\/api\/image\//, limit: 2 * 1024 * 1024 },      // Image routes: 2 MB
  { pattern: /^\/api\/auth\//, limit: 64 * 1024 },             // Auth routes: 64 KB
  { pattern: /^\/api\//, limit: 512 * 1024 },                   // All other API: 512 KB
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only apply to API routes
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // ── CORS check ────────────────────────────────────────────────────────────
  const origin = req.headers.get("origin");
  if (origin) {
    // Preflight OPTIONS request — respond with CORS headers
    if (req.method === "OPTIONS") {
      const res = new NextResponse(null, { status: 204 });
      if (ALLOWED_ORIGINS.has(origin)) {
        res.headers.set("Access-Control-Allow-Origin", origin);
        res.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
        res.headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,x-internal-secret,x-admin-token");
        res.headers.set("Access-Control-Max-Age", "86400");
      }
      return res;
    }

    // Non-preflight: block requests from unauthorized origins
    if (!ALLOWED_ORIGINS.has(origin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── Body size check ───────────────────────────────────────────────────────
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size)) {
      for (const { pattern, limit } of BODY_LIMITS) {
        if (pattern.test(pathname)) {
          if (size > limit) {
            return NextResponse.json(
              { error: `Request body too large (max ${Math.round(limit / 1024)} KB)` },
              { status: 413 }
            );
          }
          break;
        }
      }
    }
  }

  // Add CORS headers to all API responses for allowed origins
  const res = NextResponse.next();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
