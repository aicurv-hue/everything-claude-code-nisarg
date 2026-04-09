"use client";

import { useEffect, useState } from "react";
import { TrendingUp, BarChart3, Star, Calendar, Clock } from "lucide-react";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Overview {
  totalPosts: number;
  thisMonth: number;
  lastMonth: number;
}
interface HourPoint   { hour: number; count: number }
interface DayPoint    { day: number; label: string; count: number }
interface TonePoint   { tone: string; count: number }
interface LengthPoint { length: string; count: number }
interface WeekPoint   { label: string; count: number }
interface RecentPost  { id: string; topic: string; tone: string; segment: string; publishedAt: number }

interface AnalyticsData {
  empty: boolean;
  overview: Overview;
  byHour: HourPoint[];
  byDayOfWeek: DayPoint[];
  byTone: TonePoint[];
  byLength: LengthPoint[];
  weeklyGrowth: WeekPoint[];
  recentPosts: RecentPost[];
  recommendation: { bestHourLabel: string | null; bestDayLabel: string | null };
}

// ── Mini bar chart ────────────────────────────────────────────────────────────

function BarChart({
  data,
  labelKey,
  valueKey,
  highlightIndex,
  color = "#0A66C2",
}: {
  data: Record<string, any>[];
  labelKey: string;
  valueKey: string;
  highlightIndex?: number;
  color?: string;
}) {
  const values = data.map(d => d[valueKey] as number);
  const max    = Math.max(...values, 1);

  return (
    <div className="flex items-end gap-0.5 h-28 w-full">
      {data.map((d, i) => {
        const pct  = max > 0 ? (d[valueKey] / max) * 100 : 0;
        const isHi = i === highlightIndex;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${d[labelKey]}: ${d[valueKey]}`}>
            <div
              className="w-full rounded-t transition-all duration-300 min-h-[2px]"
              style={{
                height: `${Math.max(pct, 2)}%`,
                background: isHi ? "#F59E0B" : color,
                opacity: pct === 0 ? 0.2 : 1,
              }}
            />
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
              {d[labelKey]}: {d[valueKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#0A66C2]/10 flex items-center justify-center text-[#0A66C2]">{icon}</div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="text-[#0A66C2]">{icon}</div>
        <h2 className="font-semibold text-slate-800 text-sm">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [data, setData]       = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const token = await getAuthToken();
        const res = await fetch("/api/analytics", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load analytics");
        setData(json);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  if (!data || data.empty) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No published posts yet</p>
          <p className="text-slate-400 text-sm mt-1">Publish your first post to see analytics here.</p>
        </div>
      </div>
    );
  }

  const { overview, byHour, byDayOfWeek, byTone, byLength, weeklyGrowth, recentPosts, recommendation } = data;

  const bestHourIdx = byHour.some(h => h.count > 0)
    ? byHour.reduce((best, h, i) => h.count > byHour[best].count ? i : best, 0)
    : undefined;
  const bestDayIdx = byDayOfWeek.reduce((best, d, i) => d.count > byDayOfWeek[best].count ? i : best, 0);

  const monthDelta = overview.lastMonth > 0
    ? Math.round(((overview.thisMonth - overview.lastMonth) / overview.lastMonth) * 100)
    : overview.thisMonth > 0 ? 100 : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500 mt-0.5">Post activity across your LinkedIn account</p>
      </div>

      {/* ── Overview stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Total Posts Published"
          value={overview.totalPosts}
        />
        <StatCard
          icon={<Calendar className="w-4 h-4" />}
          label="This Month"
          value={overview.thisMonth}
          sub={overview.lastMonth > 0 ? `${monthDelta > 0 ? "+" : ""}${monthDelta}% vs last month` : undefined}
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Last Month"
          value={overview.lastMonth}
          sub="Published posts"
        />
      </div>

      {/* ── Best time recommendation ── */}
      {(recommendation.bestHourLabel || recommendation.bestDayLabel) && (
        <div className="bg-gradient-to-r from-[#0A66C2]/10 to-indigo-50 border border-[#0A66C2]/20 rounded-xl p-4 mb-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#0A66C2]/20 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-[#0A66C2]" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#0A66C2] uppercase tracking-wider mb-0.5">Your Most Active Posting Time</p>
            <p className="text-sm font-semibold text-slate-800">
              {[recommendation.bestDayLabel, recommendation.bestHourLabel].filter(Boolean).join(" at ")}
              {" "}— based on your historical posting patterns
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* ── Hour of Day chart ── */}
        <Section title="Hour of Day — Posts Published" icon={<Clock className="w-4 h-4" />}>
          <BarChart
            data={byHour}
            labelKey="hour"
            valueKey="count"
            highlightIndex={bestHourIdx}
            color="#0A66C2"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Yellow bar = most-posted hour: <strong className="text-slate-600">{recommendation.bestHourLabel ?? "—"}</strong>
          </p>
        </Section>

        {/* ── Day of Week chart ── */}
        <Section title="Day of Week — Posts Published" icon={<Calendar className="w-4 h-4" />}>
          <BarChart
            data={byDayOfWeek}
            labelKey="label"
            valueKey="count"
            highlightIndex={bestDayIdx}
            color="#0A66C2"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            {byDayOfWeek.map(d => <span key={d.day}>{d.label}</span>)}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Most active day: <strong className="text-slate-600">{recommendation.bestDayLabel ?? "—"}</strong>
          </p>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* ── Tone distribution ── */}
        <Section title="Tone Distribution" icon={<Star className="w-4 h-4" />}>
          <div className="space-y-2">
            {byTone.map((t, i) => {
              const max = Math.max(...byTone.map(x => x.count), 1);
              return (
                <div key={t.tone}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-slate-600 capitalize">{t.tone}</span>
                    <span className="text-slate-400">{t.count} posts</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${max > 0 ? (t.count / max) * 100 : 0}%`,
                        background: i === 0 ? "#0A66C2" : "#93c5fd",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Post Length distribution ── */}
        <Section title="Post Length Distribution" icon={<BarChart3 className="w-4 h-4" />}>
          <div className="space-y-2">
            {byLength.map((l) => {
              const max = Math.max(...byLength.map(x => x.count), 1);
              return (
                <div key={l.length}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-slate-600 capitalize">{l.length}</span>
                    <span className="text-slate-400">{l.count} posts</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${max > 0 ? (l.count / max) * 100 : 0}%`,
                        background: "#0A66C2",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Weekly Growth ── */}
        <Section title="Posts per Week (last 8 weeks)" icon={<TrendingUp className="w-4 h-4" />}>
          <BarChart
            data={weeklyGrowth}
            labelKey="label"
            valueKey="count"
            color="#0A66C2"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 overflow-hidden">
            <span>{weeklyGrowth[0]?.label}</span>
            <span>{weeklyGrowth[weeklyGrowth.length - 1]?.label}</span>
          </div>
        </Section>
      </div>

      {/* ── Recent Posts ── */}
      <Section title="Recent Published Posts" icon={<Star className="w-4 h-4" />}>
        {recentPosts.length === 0 ? (
          <p className="text-sm text-slate-400">No published posts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs text-slate-400 font-medium pb-2 pr-4">#</th>
                  <th className="text-left text-xs text-slate-400 font-medium pb-2 pr-4">Topic</th>
                  <th className="text-left text-xs text-slate-400 font-medium pb-2 pr-4">Tone</th>
                  <th className="text-left text-xs text-slate-400 font-medium pb-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.map((p, i) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-4">
                      <span className="w-5 h-5 rounded-full bg-[#0A66C2]/10 text-[#0A66C2] text-[10px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-slate-700 text-xs truncate max-w-[240px] block">{p.topic}</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize">{p.tone}</span>
                    </td>
                    <td className="py-2 text-xs text-slate-400">
                      {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
