/**
 * GET /api/analytics
 *
 * Returns aggregated post activity data for the authenticated user.
 * Pure Firestore aggregation — no AI credits consumed.
 * Note: LinkedIn Partner API required for engagement data (likes/comments) —
 * not available. All metrics here are based on post volume/timing only.
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

  const startOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const startOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();

  // ── Overview ──────────────────────────────────────────────────────────────
  const thisMonth = posts.filter(p => toMs(p.published_at) >= startOfThisMonth).length;
  const lastMonth = posts.filter(p => {
    const ms = toMs(p.published_at);
    return ms >= startOfLastMonth && ms < startOfThisMonth;
  }).length;

  // ── Hour of day (0–23) ────────────────────────────────────────────────────
  const hourBuckets: number[] = Array(24).fill(0);
  posts.forEach(p => {
    const ms = toMs(p.published_at);
    if (!ms) return;
    hourBuckets[new Date(ms).getHours()]++;
  });
  const byHour = hourBuckets.map((count, hour) => ({ hour, count }));

  // ── Day of week (0=Mon … 6=Sun) ───────────────────────────────────────────
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayBuckets: number[] = Array(7).fill(0);
  posts.forEach(p => {
    const ms = toMs(p.published_at);
    if (!ms) return;
    const d = (new Date(ms).getDay() + 6) % 7; // Sun=0 → Mon=0
    dayBuckets[d]++;
  });
  const byDayOfWeek = dayBuckets.map((count, i) => ({ day: i, label: DAY_LABELS[i], count }));

  // ── Tone distribution ─────────────────────────────────────────────────────
  const toneBuckets: Record<string, number> = {};
  posts.forEach(p => {
    const tone = p.tone || "other";
    toneBuckets[tone] = (toneBuckets[tone] || 0) + 1;
  });
  const byTone = Object.entries(toneBuckets)
    .map(([tone, count]) => ({ tone, count }))
    .sort((a, b) => b.count - a.count);

  // ── Post length distribution ──────────────────────────────────────────────
  const lengthBuckets: Record<string, number> = { short: 0, medium: 0, long: 0 };
  posts.forEach(p => {
    const len = p.length || (
      (p.content?.length || 0) < 500 ? "short" :
      (p.content?.length || 0) < 1200 ? "medium" : "long"
    );
    lengthBuckets[len] = (lengthBuckets[len] || 0) + 1;
  });
  const byLength = Object.entries(lengthBuckets).map(([length, count]) => ({ length, count }));

  // ── Weekly growth (last 8 weeks) ──────────────────────────────────────────
  const weeks: { label: string; startMs: number; endMs: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() - i * 7);
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

  // ── Recent 5 posts (most recently published) ──────────────────────────────
  const recentPosts = [...posts]
    .sort((a, b) => toMs(b.published_at) - toMs(a.published_at))
    .slice(0, 5)
    .map(p => ({
      id: p.id,
      topic: p.topic || "Untitled",
      tone: p.tone || "—",
      segment: p.segment || "individual",
      publishedAt: toMs(p.published_at),
    }));

  // ── Best posting time (by post count) ────────────────────────────────────
  const bestHour = byHour.filter(h => h.count >= 1).sort((a, b) => b.count - a.count)[0];
  const bestDay  = byDayOfWeek.filter(d => d.count >= 1).sort((a, b) => b.count - a.count)[0];

  return NextResponse.json({
    empty: false,
    overview: { totalPosts: posts.length, thisMonth, lastMonth },
    byHour,
    byDayOfWeek,
    byTone,
    byLength,
    weeklyGrowth,
    recentPosts,
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
