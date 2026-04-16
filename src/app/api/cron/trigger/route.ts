/**
 * POST /api/cron/trigger
 *
 * Browser-callable trigger for the publish-due cron worker.
 * Accepts a Firebase ID token (user auth) so the schedule page can
 * kick the cron without exposing CRON_SECRET to the client.
 *
 * Any authenticated user can call this — it's safe because publish-due
 * only publishes posts that are genuinely due.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  if (!adminAuth) {
    return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
  }

  // Verify Firebase auth
  const authHeader = req.headers.get("authorization") || "";
  const firebaseToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!firebaseToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await adminAuth.verifyIdToken(firebaseToken);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  // Call publish-due from server-side (CRON_SECRET never leaves server)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
  const res = await fetch(`${baseUrl}/api/cron/publish-due`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
