/**
 * GET /api/analytics
 *
 * Returns aggregated post performance data for the authenticated user.
 * Pure Firestore aggregation — no AI credits consumed.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function toMs(val: any): number {
  if (!val) return 0;
  if (val.seconds) return val.seconds * 1000;
  if (val instanceof Date) return val.getTime();
  if (typeof val === "string") return new Date(val).getTime();
  return 0;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }

  let userId: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    userId = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Fetch all published posts for this user
  const snap = await adminDb.collection("posts")
    .where("user_id", "==", userId)
    .where("status", "==", "published")
    .get();

  const posts = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

  if (posts.length === 0) {
    return NextResponse.json({ empty: true });
  }

  const now = Date.now();
  const startOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const startOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();

  // ── Overview ──────────────────────────────────────────────────────────────
  const totalLikes    = posts.reduce((s, p) => s + (p.likes_count    || 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments_count || 0), 0);
  const avgEngagement = posts.length ? +((totalLikes + totalComments) / posts.length).toFixed(1) : 0;

  const bestPost = [...posts].sort((a, b) =>
    ((b.likes_count || 0) + (b.comments_count || 0)) - ((a.likes_count || 0) + (a.comments_count || 0))
  )[0];

  const thisMonth = posts.filter(p => toMs(p.published_at) >= startOfThisMonth).length;
  const lastMonth = posts.filter(p => {
    const ms = toMs(p.published_at);
    return ms >= startOfLastMonth && ms < startOfThisMonth;
  }).length;

  // ── Hour of day (0–23) ────────────────────────────────────────────────────
  const hourBuckets: { count: number; totalEng: number }[] = Array.from({ length: 24 }, () => ({ count: 0, totalEng: 0 }));
  posts.forEach(p => {
    const ms = toMs(p.published_at);
    if (!ms) return;
    const h = new Date(ms).getHours();
    hourBuckets[h].count++;
    hourBuckets[h].totalEng += (p.likes_count || 0) + (p.comments_count || 0);
  });
  const byHour = hourBuckets.map((b, h) => ({
    hour: h,
    count: b.count,
    avgEngagement: b.count ? +(b.totalEng / b.count).toFixed(1) : 0,
  }));

  // ── Day of week (0=Mon … 6=Sun) ───────────────────────────────────────────
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayBuckets: { count: number; totalEng: number }[] = Array.from({ length: 7 }, () => ({ count: 0, totalEng: 0 }));
  posts.forEach(p => {
    const ms = toMs(p.published_at);
    if (!ms) return;
    const d = (new Date(ms).getDay() + 6) % 7; // convert Sun=0 to Mon=0
    dayBuckets[d].count++;
    dayBuckets[d].totalEng += (p.likes_count || 0) + (p.comments_count || 0);
  });
  const byDayOfWeek = dayBuckets.map((b, i) => ({
    day: i,
    label: DAY_LABELS[i],
    count: b.count,
    avgEngagement: b.count ? +(b.totalEng / b.count).toFixed(1) : 0,
  }));

  // ── Tone vs engagement ────────────────────────────────────────────────────
  const toneBuckets: Record<string, { count: number; totalEng: number }> = {};
  posts.forEach(p => {
    const tone = p.tone || "other";
    if (!toneBuckets[tone]) toneBuckets[tone] = { count: 0, totalEng: 0 };
    toneBuckets[tone].count++;
    toneBuckets[tone].totalEng += (p.likes_count || 0) + (p.comments_count || 0);
  });
  const byTone = Object.entries(toneBuckets).map(([tone, b]) => ({
    tone,
    count: b.count,
    avgEngagement: b.count ? +(b.totalEng / b.count).toFixed(1) : 0,
  })).sort((a, b) => b.avgEngagement - a.avgEngagement);

  // ── Post length vs engagement ─────────────────────────────────────────────
  const lengthBuckets: Record<string, { count: number; totalEng: number }> = {
    short: { count: 0, totalEng: 0 },
    medium: { count: 0, totalEng: 0 },
    long: { count: 0, totalEng: 0 },
  };
  posts.forEach(p => {
    const len = p.length || (
      (p.content?.length || 0) < 500 ? "short" :
      (p.content?.length || 0) < 1200 ? "medium" : "long"
    );
    if (!lengthBuckets[len]) lengthBuckets[len] = { count: 0, totalEng: 0 };
    lengthBuckets[len].count++;
    lengthBuckets[len].totalEng += (p.likes_count || 0) + (p.comments_count || 0);
  });
  const byLength = Object.entries(lengthBuckets).map(([length, b]) => ({
    length,
    count: b.count,
    avgEngagement: b.count ? +(b.totalEng / b.count).toFixed(1) : 0,
  }));

  // ── Weekly growth (last 8 weeks) ──────────────────────────────────────────
  const weeks: { label: string; startMs: number; endMs: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() - i * 7); // start of each week (Sun)
    d.setHours(0, 0, 0, 0);
    const startMs = d.getTime();
    const endMs = startMs + 7 * 24 * 60 * 60 * 1000;
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    weeks.push({ label, startMs, endMs });
  }
  const weeklyGrowth = weeks.map(w => ({
    label: w.label,
    count: posts.filter(p => {
      const ms = toMs(p.published_at);
      return ms >= w.startMs && ms < w.endMs;
    }).length,
  }));

  // ── Top 5 posts ───────────────────────────────────────────────────────────
  const topPosts = [...posts]
    .sort((a, b) =>
      ((b.likes_count || 0) + (b.comments_count || 0)) - ((a.likes_count || 0) + (a.comments_count || 0))
    )
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      topic: p.topic || "Untitled",
      tone: p.tone || "—",
      segment: p.segment || "individual",
      publishedAt: toMs(p.published_at),
      likes: p.likes_count || 0,
      comments: p.comments_count || 0,
    }));

  // ── Best posting time recommendation ─────────────────────────────────────
  const hasEngagement = totalLikes + totalComments > 0;
  // If engagement data exists, rank by avg engagement; otherwise rank by post count (most-posted hour)
  const bestHour = hasEngagement
    ? byHour.filter(h => h.count >= 2).sort((a, b) => b.avgEngagement - a.avgEngagement)[0]
    : byHour.filter(h => h.count >= 1).sort((a, b) => b.count - a.count)[0];
  const bestDay = hasEngagement
    ? byDayOfWeek.filter(d => d.count >= 2).sort((a, b) => b.avgEngagement - a.avgEngagement)[0]
    : byDayOfWeek.filter(d => d.count >= 1).sort((a, b) => b.count - a.count)[0];

  return NextResponse.json({
    empty: false,
    overview: {
      totalPosts: posts.length,
      totalLikes,
      totalComments,
      avgEngagement,
      bestPost: bestPost ? {
        id: bestPost.id,
        topic: bestPost.topic || "Untitled",
        likes: bestPost.likes_count || 0,
        comments: bestPost.comments_count || 0,
        publishedAt: toMs(bestPost.published_at),
      } : null,
      thisMonth,
      lastMonth,
    },
    byHour,
    byDayOfWeek,
    byTone,
    byLength,
    weeklyGrowth,
    topPosts,
    recommendation: {
      bestHourLabel: bestHour ? formatHour(bestHour.hour) : null,
      bestDayLabel: bestDay?.label || null,
    },
  });
}

function formatHour(h: number): string {
  const suffix = h < 12 ? "AM" : "PM";
  const h12    = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${suffix}`;
}
