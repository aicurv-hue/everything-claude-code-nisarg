/**
 * Admin-only API routes for user management.
 * Protected by Firebase ID token + admin email list check.
 * Uses Firebase Admin SDK.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken || !adminAuth) return false;
    const decoded = await adminAuth.verifyIdToken(idToken);
    return ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || "");
  } catch { return false; }
}

/** GET /api/admin/users — list all users with aggregated stats (2 Firestore reads, not N) */
export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminAuth || !adminDb) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  try {
    const now = Date.now();

    // Fetch all posts + all tokens in 2 reads — no per-user loops
    const [listResult, postsSnap, tokensSnap, betaSnap] = await Promise.all([
      adminAuth.listUsers(1000),
      adminDb.collection("posts").get(),
      adminDb.collection("tokens").get(),
      adminDb.collection("beta_access").where("approved", "==", true).get(),
    ]);

    // Build per-user post stats map
    const postsByUser = new Map<string, {
      total: number; drafts: number; scheduled: number;
      published: number; failed: number;
      lastPostAt: number; totalLikes: number; totalComments: number;
      segments: Set<string>;
    }>();

    for (const doc of postsSnap.docs) {
      const p = doc.data();
      const uid = p.user_id as string;
      if (!uid) continue;
      if (!postsByUser.has(uid)) {
        postsByUser.set(uid, { total: 0, drafts: 0, scheduled: 0, published: 0, failed: 0, lastPostAt: 0, totalLikes: 0, totalComments: 0, segments: new Set() });
      }
      const s = postsByUser.get(uid)!;
      s.total++;
      if (p.status === "draft")      s.drafts++;
      if (p.status === "scheduled")  s.scheduled++;
      if (p.status === "published")  s.published++;
      if (p.status === "failed")     s.failed++;
      if (p.segment) s.segments.add(p.segment);
      s.totalLikes    += p.likes_count    || 0;
      s.totalComments += p.comments_count || 0;
      const secs = p.created_at?.seconds ?? p.created_at?._seconds ?? 0;
      if (secs * 1000 > s.lastPostAt) s.lastPostAt = secs * 1000;
    }

    // Build beta access set
    const approvedEmails = new Set(
      betaSnap.docs.map(d => (d.data().email as string).toLowerCase())
    );

    // Build token map
    const tokenByUid = new Map<string, any>();
    for (const doc of tokensSnap.docs) {
      tokenByUid.set(doc.id, doc.data());
    }

    const users = listResult.users.map((u) => {
      const stats   = postsByUser.get(u.uid);
      const token   = tokenByUid.get(u.uid);
      const segSet  = stats?.segments ?? new Set<string>();
      const segment = segSet.size === 0 ? "none"
        : segSet.size > 1 ? "both"
        : (segSet.values().next().value as string);

      return {
        uid:            u.uid,
        email:          u.email || "",
        displayName:    u.displayName || "",
        photoURL:       u.photoURL || "",
        createdAt:      u.metadata.creationTime,
        lastSignIn:     u.metadata.lastSignInTime,
        disabled:       u.disabled,
        // Posts
        postCount:      stats?.total     ?? 0,
        draftCount:     stats?.drafts    ?? 0,
        scheduledCount: stats?.scheduled ?? 0,
        publishedCount: stats?.published ?? 0,
        failedCount:    stats?.failed    ?? 0,
        lastPostAt:     stats?.lastPostAt ? new Date(stats.lastPostAt).toISOString() : null,
        segment,
        // Engagement
        totalLikes:     stats?.totalLikes    ?? 0,
        totalComments:  stats?.totalComments ?? 0,
        // Token
        linkedInConnected: !!(token?.access_token),
        tokenExpiresAt:    token?.expires_at    ?? null,
        tokenExpired:      token?.expires_at ? token.expires_at < now : false,
        linkedInName:      token?.user_name  ?? null,
        linkedInEmail:     token?.user_email ?? null,
        betaApproved:      approvedEmails.has((u.email || "").toLowerCase()),
      };
    });

    // Sort: most recently signed in first
    users.sort((a, b) => new Date(b.lastSignIn || 0).getTime() - new Date(a.lastSignIn || 0).getTime());

    return NextResponse.json({ users });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** PATCH /api/admin/users — enable/disable a user */
export async function PATCH(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminAuth) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  const { uid, disabled } = await req.json();
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  await adminAuth.updateUser(uid, { disabled });
  return NextResponse.json({ success: true });
}

/** DELETE /api/admin/users — permanently delete a user and all their Firestore data */
export async function DELETE(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminAuth || !adminDb) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  const { uid } = await req.json();
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const collections = ["posts", "post_memories", "tokens", "schedule_suggestions"];
  for (const col of collections) {
    const snap = await adminDb.collection(col).where("user_id", "==", uid).get();
    if (snap.docs.length > 0) {
      const batch = adminDb.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
  await adminDb.collection("profiles").doc(uid).delete().catch(() => {});
  await adminDb.collection("tokens").doc(uid).delete().catch(() => {});
  await adminAuth.deleteUser(uid);

  return NextResponse.json({ success: true });
}
