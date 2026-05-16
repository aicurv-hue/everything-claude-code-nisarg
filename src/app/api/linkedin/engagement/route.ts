/**
 * POST /api/linkedin/engagement
 *
 * Fetches likes + comments counts for a list of LinkedIn post URNs.
 * Called by the cron worker hourly for posts published in the last 30 days.
 *
 * LinkedIn API used: GET /v2/socialActions/{encodedPostUrn}
 * Returns: { likeCount, commentCount }
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const LI_VERSION = "202604";
const TIMEOUT_MS = 10_000;

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

async function fetchEngagement(
  accessToken: string,
  postUrn: string
): Promise<{ likes: number; comments: number } | null> {
  try {
    const encoded = encodeURIComponent(postUrn);
    const { signal, clear } = withTimeout(TIMEOUT_MS);
    const res = await fetch(`https://api.linkedin.com/v2/socialActions/${encoded}`, {
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": LI_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    clear();
    if (!res.ok) {
      console.warn(`[engagement] Failed for ${postUrn}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    return {
      likes:    data.likesSummary?.totalLikes    ?? data.likeCount    ?? 0,
      comments: data.commentsSummary?.totalFirstLevelComments ?? data.commentCount ?? 0,
    };
  } catch (err: any) {
    console.warn(`[engagement] Exception for ${postUrn}:`, err?.message);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { postUrns } = await req.json() as { postUrns: string[]; userId?: string };
  if (!Array.isArray(postUrns) || postUrns.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // Get access token — Firestore only (keyed by Firebase UID from auth header)
  let accessToken: string | null = null;

  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ") && adminDb) {
    try {
      const { adminAuth } = await import("@/lib/firebase-admin");
      if (adminAuth) {
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
        const tokenSnap = await adminDb.collection("tokens").doc(decoded.uid).get().catch(() => null);
        const tokenRecord = tokenSnap?.exists ? tokenSnap.data() : null;
        if (tokenRecord?.access_token) accessToken = tokenRecord.access_token;
      }
    } catch {}
  }

  if (!accessToken) {
    return NextResponse.json({ error: "No LinkedIn token" }, { status: 401 });
  }

  // Fetch engagement for each URN (sequential to respect rate limits)
  const results: Array<{ urn: string; likes: number; comments: number }> = [];
  for (const urn of postUrns.slice(0, 20)) {
    const data = await fetchEngagement(accessToken, urn);
    if (data) results.push({ urn, ...data });
  }

  return NextResponse.json({ results });
}
