/**
 * GET /api/admin/users/[uid]
 *
 * Full activity drill-down for a single user.
 * Returns: profile, recent posts, memory count, token status.
 * Admin-only — requires Firebase ID token from an admin email.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/utils/requireAdmin";
import { logAdminAction } from "@/lib/logging/audit";

function toIso(ts: any): string | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const adminEmail = await requireAdmin(req);
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  const { uid } = await params;
  logAdminAction("admin.users.view", adminEmail, uid);

  const [postsSnap, memoriesSnap, tokenDoc, profileDoc] = await Promise.all([
    adminDb.collection("posts")
      .where("user_id", "==", uid)
      .orderBy("created_at", "desc")
      .limit(20)
      .get(),
    adminDb.collection("post_memories").where("user_id", "==", uid).count().get(),
    adminDb.collection("tokens").doc(uid).get(),
    adminDb.collection("profiles").doc(uid).get(),
  ]);

  const recentPosts = postsSnap.docs.map(d => {
    const p = d.data();
    return {
      id:           d.id,
      topic:        (p.topic || p.content || "").slice(0, 80),
      status:       p.status,
      segment:      p.segment,
      createdAt:    toIso(p.created_at),
      scheduledAt:  toIso(p.scheduled_at),
      publishedAt:  toIso(p.published_at),
      failedReason: p.failed_reason || null,
      likes:        p.likes_count    || 0,
      comments:     p.comments_count || 0,
      linkedInPostId: p.linkedin_post_id || null,
    };
  });

  const token   = tokenDoc.exists ? tokenDoc.data()! : null;
  const profile = profileDoc.exists ? profileDoc.data()! : null;

  return NextResponse.json({
    profile: {
      name:          profile?.individual?.name    || profile?.corporate?.companyName || null,
      industry:      profile?.individual?.industry || profile?.corporate?.industry || null,
      role:          profile?.individual?.role    || null,
      website:       profile?.corporate?.website  || null,
    },
    recentPosts,
    memory: {
      entryCount: memoriesSnap.data().count,
    },
    token: {
      connected:     !!(token?.access_token),
      expiresAt:     token?.expires_at    ?? null,
      expired:       token?.expires_at ? token.expires_at < Date.now() : false,
      linkedInName:  token?.user_name  ?? null,
      linkedInEmail: token?.user_email ?? null,
    },
  });
}
