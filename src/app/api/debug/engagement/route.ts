/**
 * GET /api/debug/engagement
 * Admin-only diagnostic — tests LinkedIn engagement API on the most recent published post.
 * Returns raw LinkedIn responses so we can see exactly what's failing.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const LI_VERSION = "202504";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(e => e.trim());

export async function GET(req: NextRequest) {
  try {
  // Auth — admin only
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!adminAuth || !adminDb) return NextResponse.json({ error: "Server not configured" }, { status: 503 });

  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7)).catch(() => null);
  if (!decoded || !ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || "")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  // Get published posts — no orderBy to avoid missing index errors
  const snap = await adminDb.collection("posts")
    .where("status", "==", "published")
    .limit(50)
    .get();

  const posts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
  // Sort by published_at descending in JS
  posts.sort((a, b) => (b.published_at?.seconds || 0) - (a.published_at?.seconds || 0));
  const post = posts.find(p => p.linkedin_post_id);

  if (!post) return NextResponse.json({ error: "No published posts with linkedin_post_id found" });

  // Get the user's token
  const tokenSnap = await adminDb.collection("tokens").doc(post.user_id).get();
  const tokenData = tokenSnap.exists ? tokenSnap.data() : null;
  if (!tokenData?.access_token) return NextResponse.json({ error: "No access token for post owner" });

  const accessToken = tokenData.access_token;
  const postUrn = post.linkedin_post_id;
  const encoded = encodeURIComponent(postUrn);

  // Test 1: /v2/socialActions
  let socialActionsResult: any = {};
  try {
    const r = await fetch(`https://api.linkedin.com/v2/socialActions/${encoded}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    const text = await r.text();
    socialActionsResult = { status: r.status, body: tryParse(text) };
  } catch (e: any) {
    socialActionsResult = { error: e.message };
  }

  // Test reactions with multiple API versions — find which one works
  const reactionVersions = ["202505", "202504", "202502", "202412", "202604"];
  const reactionsResults: Record<string, any> = {};
  for (const ver of reactionVersions) {
    try {
      const r = await fetch(`https://api.linkedin.com/rest/reactions?q=entity&entity=${encoded}&count=0`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": ver,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      });
      const text = await r.text();
      reactionsResults[`reactions_${ver}`] = { status: r.status, body: tryParse(text) };
      if (r.ok) break; // stop as soon as one works
    } catch (e: any) {
      reactionsResults[`reactions_${ver}`] = { error: (e as any).message };
    }
  }

  // Test socialActions v2 with version header (our first test was missing it)
  let socialActionsWithVersion: any = {};
  try {
    const r = await fetch(`https://api.linkedin.com/v2/socialActions/${encoded}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "LinkedIn-Version": "202505",
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });
    const text = await r.text();
    socialActionsWithVersion = { status: r.status, body: tryParse(text) };
  } catch (e: any) {
    socialActionsWithVersion = { error: (e as any).message };
  }

  return NextResponse.json({
    post: {
      id: post.id,
      linkedin_post_id: postUrn,
      encoded_urn: encoded,
      current_likes: post.likes_count ?? 0,
      current_comments: post.comments_count ?? 0,
      engagement_synced_at: post.engagement_synced_at
        ? new Date(post.engagement_synced_at).toISOString()
        : null,
    },
    token: {
      expires_at: tokenData.expires_at
        ? new Date(tokenData.expires_at).toISOString()
        : "unknown",
      has_refresh_token: !!tokenData.refresh_token,
    },
    tests: {
      socialActions_v2_no_version: socialActionsResult,
      socialActions_v2_with_version: socialActionsWithVersion,
      ...reactionsResults,
    },
  });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}

function tryParse(text: string): any {
  try { return JSON.parse(text); } catch { return text; }
}
