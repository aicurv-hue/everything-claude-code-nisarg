/**
 * POST /api/engagement/sync
 *
 * Force-syncs engagement (likes + comments) for all published posts
 * belonging to the authenticated user. Returns raw LinkedIn API responses
 * for debugging.
 *
 * Auth: Firebase ID token in Authorization header.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const LI_VERSION = "202604";

function withTimeout(ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(id) };
}

export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!adminDb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  // Get LinkedIn token
  const tokenSnap = await adminDb.collection("tokens").doc(uid).get();
  if (!tokenSnap.exists) {
    return NextResponse.json({ error: "LinkedIn not connected" }, { status: 400 });
  }
  const accessToken: string = tokenSnap.data()!.access_token;

  // Get all published posts for this user
  const snap = await adminDb.collection("posts")
    .where("user_id", "==", uid)
    .where("status", "==", "published")
    .get();

  const posts = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as any))
    .filter(p => !!p.linkedin_post_id);

  if (posts.length === 0) {
    return NextResponse.json({ message: "No published posts with LinkedIn IDs found", posts: [] });
  }

  const results: any[] = [];

  for (const post of posts) {
    const postUrn = post.linkedin_post_id;
    const encoded = encodeURIComponent(postUrn);
    const result: any = { post_id: post.id, linkedin_post_id: postUrn, encoded };

    // Try reactions (likes)
    try {
      const { signal: s1, clear: c1 } = withTimeout(10_000);
      const likesRes = await fetch(
        `https://api.linkedin.com/rest/reactions?q=entity&entity=${encoded}&count=0`,
        {
          signal: s1,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": LI_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );
      c1();
      const likesBody = await likesRes.text();
      result.likes_status = likesRes.status;
      result.likes_raw = likesBody;
      if (likesRes.ok) {
        const likesData = JSON.parse(likesBody);
        result.likes_count = likesData.paging?.total ?? likesData.total ?? 0;
      }
    } catch (e: any) {
      result.likes_error = e?.message;
    }

    // Try comments
    try {
      const { signal: s2, clear: c2 } = withTimeout(10_000);
      const commentsRes = await fetch(
        `https://api.linkedin.com/rest/comments?q=comments&commentUrn=${encoded}&count=0`,
        {
          signal: s2,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "LinkedIn-Version": LI_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );
      c2();
      const commentsBody = await commentsRes.text();
      result.comments_status = commentsRes.status;
      result.comments_raw = commentsBody;
      if (commentsRes.ok) {
        const commentsData = JSON.parse(commentsBody);
        result.comments_count = commentsData.paging?.total ?? commentsData.total ?? 0;
      }
    } catch (e: any) {
      result.comments_error = e?.message;
    }

    // If both succeeded, update Firestore
    if (result.likes_count != null && result.comments_count != null) {
      await adminDb.collection("posts").doc(post.id).update({
        likes_count: result.likes_count,
        comments_count: result.comments_count,
        engagement_synced_at: Date.now(),
        updated_at: FieldValue.serverTimestamp(),
      }).catch(() => {});
      result.saved = true;
    } else {
      result.saved = false;
    }

    results.push(result);
  }

  return NextResponse.json({ synced: results.length, results });
}
