/**
 * Shared admin authentication utility.
 * All /api/admin/* routes must call requireAdmin() before any logic.
 *
 * Two-layer check:
 *   1. Firebase ID token verified + email in ADMIN_EMAILS list
 *   2. X-Admin-Token header matches ADMIN_SECRET env var (if configured)
 *
 * Layer 2 means even a compromised admin session cannot call admin routes
 * without the secondary static secret.
 */

import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Simple in-process rate limiter: max 20 admin requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

/**
 * Returns the admin's email if authenticated, or null if not.
 * Also enforces IP-based rate limiting.
 */
export async function requireAdmin(req: NextRequest): Promise<string | null> {
  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip)) return null;

  // Layer 1: Firebase ID token + admin email
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken || !adminAuth) return null;
    const decoded = await adminAuth.verifyIdToken(idToken);
    const email = decoded.email?.toLowerCase() || "";
    if (!ADMIN_EMAILS.includes(email)) return null;

    // Layer 2: Optional secondary secret (ADMIN_SECRET env var)
    const adminSecret = process.env.ADMIN_SECRET;
    if (adminSecret) {
      const providedSecret = req.headers.get("x-admin-token") || "";
      if (providedSecret !== adminSecret) return null;
    }

    return email;
  } catch {
    return null;
  }
}
