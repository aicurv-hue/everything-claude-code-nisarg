import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/utils/requireAdmin";

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminAuth || !adminDb) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  try {
    const now = Date.now();
    const sevenDaysAgo  = new Date(now - 7  * 86400_000);
    const thirtyDaysAgo = new Date(now - 30 * 86400_000);
    const twentyFourHoursAgo = now - 86400_000;
    const twentyFourHoursFromNow = now + 86400_000;
    const fortyEightHoursFromNow = now + 2 * 86400_000;

    // ── Parallel reads — all collection-level, no per-user loops ─────────────
    const [usersResult, postsSnap, tokensSnap] = await Promise.all([
      adminAuth.listUsers(1000),
      adminDb.collection("posts").get(),
      adminDb.collection("tokens").get(),
    ]);

    // ── User growth ───────────────────────────────────────────────────────────
    const allUsers = usersResult.users;
    const totalUsers = allUsers.length;
    const newUsersLast7d  = allUsers.filter(u => new Date(u.metadata.creationTime) >= sevenDaysAgo).length;
    const newUsersLast30d = allUsers.filter(u => new Date(u.metadata.creationTime) >= thirtyDaysAgo).length;

    // ── Posts aggregation (one batch, reduce in memory) ───────────────────────
    const allPosts = postsSnap.docs.map(d => d.data());
    const totalPosts      = allPosts.length;
    const drafts          = allPosts.filter(p => p.status === "draft").length;
    const scheduledPosts  = allPosts.filter(p => p.status === "scheduled").length;
    const publishedPosts  = allPosts.filter(p => p.status === "published").length;
    const failedPosts        = allPosts.filter(p => p.status === "failed").length;
    const failedPostsLast24h = allPosts.filter(p => {
      if (p.status !== "failed") return false;
      const secs = p.updated_at?.seconds ?? p.updated_at?._seconds ?? p.created_at?.seconds ?? 0;
      return secs * 1000 >= twentyFourHoursAgo;
    }).length;
    const individualPosts = allPosts.filter(p => p.segment === "individual").length;
    const corporatePosts  = allPosts.filter(p => p.segment === "corporate").length;

    // Weekly / monthly velocity
    const postsLast7d  = allPosts.filter(p => {
      const secs = p.created_at?.seconds ?? p.created_at?._seconds ?? 0;
      return secs * 1000 >= sevenDaysAgo.getTime();
    }).length;
    const postsLast30d = allPosts.filter(p => {
      const secs = p.created_at?.seconds ?? p.created_at?._seconds ?? 0;
      return secs * 1000 >= thirtyDaysAgo.getTime();
    }).length;

    // Engagement totals
    let totalLikes = 0, totalComments = 0;
    for (const p of allPosts) {
      totalLikes    += p.likes_count    || 0;
      totalComments += p.comments_count || 0;
    }

    // ── Activation: users who have ever created at least one post ────────────
    const usersWithPosts = new Set(allPosts.map(p => p.user_id).filter(Boolean));
    const activatedUsers  = usersWithPosts.size;
    const activationRate  = totalUsers > 0 ? Math.round((activatedUsers / totalUsers) * 1000) / 10 : 0;

    // ── LinkedIn tokens ───────────────────────────────────────────────────────
    const allTokens = tokensSnap.docs.map(d => d.data());
    const linkedInConnected       = allTokens.filter(t => !!t.access_token).length;
    const linkedInConnectionRate  = totalUsers > 0 ? Math.round((linkedInConnected / totalUsers) * 1000) / 10 : 0;
    const tokenExpiredCount       = allTokens.filter(t => t.expires_at && t.expires_at < now).length;
    const tokenExpiringIn24h      = allTokens.filter(t => t.expires_at && t.expires_at >= now && t.expires_at < twentyFourHoursFromNow).length;
    const tokenExpiringIn48h      = allTokens.filter(t => t.expires_at && t.expires_at >= now && t.expires_at < fortyEightHoursFromNow).length;

    return NextResponse.json({
      // Growth
      totalUsers,
      newUsersLast7d,
      newUsersLast30d,
      // Activation
      activatedUsers,
      activationRate,
      // LinkedIn
      linkedInConnected,
      linkedInConnectionRate,
      tokenExpiredCount,
      tokenExpiringIn24h,
      tokenExpiringIn48h,
      // Content volume
      totalPosts,
      drafts,
      scheduledPosts,
      publishedPosts,
      failedPosts,
      // Segments
      individualPosts,
      corporatePosts,
      // Velocity
      postsLast7d,
      postsLast30d,
      // Engagement
      totalLikes,
      totalComments,
      // System health
      failedPostsLast24h,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
