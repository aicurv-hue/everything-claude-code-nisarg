"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  BarChart3, Send, CheckCircle, Clock, TrendingUp,
  FileText, RefreshCw, Linkedin, Zap, Image, AlertTriangle,
  Wifi, WifiOff, Activity, User, Building2, ThumbsUp, MessageCircle
} from "lucide-react";
import { Post } from "@/lib/db/posts";
import { UserProfile } from "@/lib/db/profiles";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";

interface SystemStatus {
  aiEngine: "ready" | "degraded";
  imageEngine: "ready" | "degraded";
  profileSync: "active" | "mock";
  linkedin: "connected" | "refreshing" | "disconnected";
}

interface LinkedInInfo {
  connected: boolean;
  hasRefreshToken: boolean;
  tokenDaysLeft: number;
  name: string;
  picture: string;
  email: string;
}

interface DashboardStats {
  total: number;
  published: number;
  drafts: number;
  scheduled: number;
  failed: number;
  lastWeek: number;
}

const STATUS_COLOR: Record<string, string> = {
  ready: "text-green-600",
  active: "text-green-600",
  connected: "text-green-600",
  refreshing: "text-amber-500",
  mock: "text-amber-500",
  degraded: "text-red-500",
  disconnected: "text-red-500",
};

const STATUS_DOT: Record<string, string> = {
  ready: "bg-green-500",
  active: "bg-green-500",
  connected: "bg-green-500",
  refreshing: "bg-amber-500 animate-pulse",
  mock: "bg-amber-500",
  degraded: "bg-red-500",
  disconnected: "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  active: "Active",
  connected: "Connected",
  refreshing: "Auto-refreshing",
  mock: "Mock Mode",
  degraded: "Degraded",
  disconnected: "Disconnected",
};

function formatDate(post: Post): string {
  const secs = post.published_at?.seconds || post.created_at?.seconds;
  if (!secs) return "—";
  return new Date(secs * 1000).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

const STATUS_BADGE: Record<string, string> = {
  published: "bg-green-50 text-green-700 border-green-200",
  draft:     "bg-blue-50 text-blue-700 border-blue-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
};

const STATUS_ICON_BG: Record<string, string> = {
  published: "bg-green-50 text-green-600",
  draft:     "bg-blue-50 text-blue-600",
  scheduled: "bg-amber-50 text-amber-600",
  failed:    "bg-red-50 text-red-600",
};

export default function DashboardHomePage() {
  const { user } = useAuth();
  const { segment, isIndividual, isCorporate } = useSegment();
  const [stats, setStats]         = useState<DashboardStats | null>(null);
  const [system, setSystem]       = useState<SystemStatus | null>(null);
  const [linkedin, setLinkedIn]   = useState<LinkedInInfo | null>(null);
  const [recentPosts, setRecent]  = useState<Post[]>([]);
  const [allPosts, setAllPosts]   = useState<Post[]>([]);
  const [profile, setProfile]     = useState<UserProfile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const accentColor = isCorporate ? "text-violet-600" : "text-[#0A66C2]";
  const accentBg    = isCorporate ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200";

  const loadAll = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const { auth: firebaseAuth } = await import("@/lib/firebase");
      const token = await firebaseAuth?.currentUser?.getIdToken();

      const [dashData, serverStats] = await Promise.all([
        fetch(`/api/dashboard/data?segment=${segment}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
        fetch("/api/dashboard/stats").then((r) => r.json()),
      ]);

      if (dashData.error) throw new Error(dashData.error);

      setStats(dashData.stats);
      setProfile(dashData.profile);
      setAllPosts(dashData.allPosts || []);
      setRecent((dashData.posts || []).slice(0, 6));
      setSystem(serverStats.system);
      setLinkedIn(serverStats.linkedin);
      setLastUpdated(serverStats.timestamp);
    } catch (err: any) {
      console.error("Dashboard load failed:", err);
      setError(err?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, segment]);

  useEffect(() => { if (user) loadAll(); }, [user, segment, loadAll]);
  useEffect(() => {
    const interval = setInterval(() => loadAll(true), 30_000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const totalLikes    = allPosts.reduce((s, p) => s + (p.likes_count    ?? 0), 0);
  const totalComments = allPosts.reduce((s, p) => s + (p.comments_count ?? 0), 0);
  const totalEngagement = totalLikes + totalComments;

  const statCards = stats ? [
    {
      label: "Total Generated",
      value: stats.total,
      icon: BarChart3,
      color: "text-blue-600",
      bg: "bg-blue-50",
      sub: `${stats.drafts} drafts · ${stats.failed} failed`,
    },
    {
      label: "Live on LinkedIn",
      value: stats.published,
      icon: Send,
      color: "text-green-600",
      bg: "bg-green-50",
      sub: stats.published > 0 ? "Confirmed published" : "No posts published yet",
    },
    {
      label: "Total Engagement",
      value: totalEngagement,
      icon: ThumbsUp,
      color: "text-rose-600",
      bg: "bg-rose-50",
      sub: `${totalLikes} likes · ${totalComments} comments`,
    },
  ] : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Activity className="w-7 h-7 animate-pulse" />
          <p className="text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-1">Dashboard failed to load</p>
            <p className="text-xs text-slate-500">{error}</p>
          </div>
          <button
            onClick={() => { setError(""); setLoading(true); loadAll(); }}
            className="px-4 py-2 bg-[#0A66C2] text-white text-sm font-medium rounded-lg hover:bg-[#0854a0] transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isIndividual ? "Personal branding workspace" : "Company page workspace"}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {lastUpdated > 0 && (
            <span className="text-xs text-slate-400">{timeAgo(lastUpdated)}</span>
          )}
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/dashboard/create"
            className="px-4 py-2 bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-medium rounded-lg transition-all"
          >
            + Create Post
          </Link>
        </div>
      </div>

      {/* Active Account Banner */}
      {(() => {
        const seg      = isIndividual ? profile?.individual : profile?.corporate;
        const dispName = seg?.name || (isIndividual ? "Your Name" : "Company Name");
        const dispRole = seg?.roleOrIndustry || (isIndividual ? "Add your role in Settings" : "Add your industry in Settings");
        const hasName  = !!seg?.name;

        return (
          <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl border ${
            isCorporate
              ? "bg-violet-50 border-violet-200"
              : "bg-blue-50 border-blue-200"
          }`}>
            {/* Avatar / Icon */}
            {isIndividual && linkedin?.connected && linkedin.picture ? (
              <img
                src={linkedin.picture}
                alt={linkedin.name}
                className="w-11 h-11 rounded-full border-2 border-white shadow-sm shrink-0"
              />
            ) : (
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                isCorporate
                  ? "bg-violet-100 border-violet-200"
                  : "bg-blue-100 border-blue-200"
              }`}>
                {isCorporate
                  ? <Building2 className="w-5 h-5 text-violet-600" />
                  : <User className="w-5 h-5 text-[#0A66C2]" />
                }
              </div>
            )}

            {/* Name + role */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-bold ${isCorporate ? "text-violet-900" : "text-slate-900"}`}>
                  {dispName}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                  isCorporate
                    ? "bg-violet-100 text-violet-700 border-violet-200"
                    : "bg-blue-100 text-[#0A66C2] border-blue-200"
                }`}>
                  {isCorporate ? "Corporate" : "Individual"}
                </span>
              </div>
              <p className={`text-xs mt-0.5 truncate ${hasName ? "text-slate-500" : "text-slate-400 italic"}`}>
                {dispRole}
              </p>
            </div>

            {/* LinkedIn connection badge */}
            <div className="shrink-0 text-right">
              {linkedin?.connected ? (
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] font-semibold text-green-700">LinkedIn Connected</span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                    {linkedin.email}
                  </span>
                  {linkedin.tokenDaysLeft > 0 && (
                    <span className="text-[10px] text-slate-400">
                      Token valid {linkedin.tokenDaysLeft}d{linkedin.hasRefreshToken ? " · auto-renews" : ""}
                    </span>
                  )}
                </div>
              ) : (
                <a
                  href="/api/auth/linkedin?returnTo=/dashboard"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    isCorporate
                      ? "bg-violet-100 border-violet-300 text-violet-700 hover:bg-violet-200"
                      : "bg-white border-[#0A66C2]/30 text-[#0A66C2] hover:bg-blue-50"
                  }`}
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  Connect LinkedIn
                </a>
              )}
            </div>

            {/* Settings shortcut */}
            {!hasName && (
              <Link
                href="/dashboard/settings"
                className="shrink-0 text-[11px] text-slate-400 hover:text-slate-700 underline underline-offset-2 transition-colors"
              >
                Set up profile →
              </Link>
            )}
          </div>
        );
      })()}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {statCards.map((stat, i) => (
          <div key={i} className="card p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{stat.value}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Post Breakdown */}
        <div className="lg:col-span-2 card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Post Breakdown</h3>
            <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Live Data</span>
          </div>
          {stats && stats.total > 0 ? (
            <div className="space-y-4">
              {[
                { label: "Published & Live", count: stats.published, color: "bg-green-500", total: stats.total },
                { label: "Drafts", count: stats.drafts, color: "bg-blue-500", total: stats.total },
                { label: "Scheduled", count: stats.scheduled, color: "bg-amber-500", total: stats.total },
                { label: "Failed", count: stats.failed, color: "bg-red-400", total: stats.total },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-600">{row.label}</span>
                    <span className="font-semibold text-slate-900">{row.count}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${row.color} rounded-full transition-all duration-700`}
                      style={{ width: row.total > 0 ? `${Math.round((row.count / row.total) * 100)}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}

              {/* Posting-as footer */}
              <div className={`pt-4 border-t border-slate-100 flex items-center gap-2.5 ${accentBg} -mx-6 px-6 -mb-5 py-3 rounded-b-xl border-t`}>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                  isCorporate ? "bg-violet-100" : "bg-blue-100"
                }`}>
                  {isCorporate
                    ? <Building2 className="w-3 h-3 text-violet-600" />
                    : <User className="w-3 h-3 text-[#0A66C2]" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-600">
                    Posting as{" "}
                    <span className={`font-semibold ${accentColor}`}>
                      {(isIndividual ? profile?.individual?.name : profile?.corporate?.name)
                        || (isIndividual ? "You (Individual)" : "Your Company")}
                    </span>
                  </p>
                  {!linkedin?.connected && (
                    <p className="text-[10px] text-slate-400">LinkedIn not connected — save to drafts only</p>
                  )}
                </div>
                <Link
                  href="/dashboard/settings"
                  className={`text-[10px] font-medium ${accentColor} hover:underline shrink-0`}
                >
                  Edit profile
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <TrendingUp className="w-9 h-9 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">No posts yet</p>
              <p className="text-xs text-slate-400">Generate your first post to see data here.</p>
              <Link href="/dashboard/create" className="mt-1 px-4 py-2 rounded-lg bg-blue-50 text-[#0A66C2] text-xs font-medium hover:bg-blue-100 transition-all border border-blue-200">
                Create First Post →
              </Link>
            </div>
          )}
        </div>

        {/* System Status */}
        <div className="card p-6 space-y-5">
          <h3 className="font-semibold text-slate-900">System Status</h3>

          {/* Active account identity */}
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            {isIndividual && linkedin?.connected && linkedin.picture ? (
              <img src={linkedin.picture} alt={linkedin.name} className="w-9 h-9 rounded-full" />
            ) : (
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                isCorporate ? "bg-violet-100" : "bg-blue-100"
              }`}>
                {isCorporate
                  ? <Building2 className="w-4 h-4 text-violet-600" />
                  : <User className="w-4 h-4 text-[#0A66C2]" />
                }
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {(isIndividual ? profile?.individual?.name : profile?.corporate?.name)
                  || (isIndividual ? "Individual Account" : "Corporate Account")}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {(isIndividual ? profile?.individual?.roleOrIndustry : profile?.corporate?.roleOrIndustry)
                  || (linkedin?.connected ? linkedin.email : "No profile set up yet")}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Live Status</p>
            {system && [
              { label: "AI Engine (Neel)", key: system.aiEngine, icon: Zap },
              { label: "Image Engine", key: system.imageEngine, icon: Image },
              { label: "Profile Sync", key: system.profileSync, icon: Activity },
              { label: "LinkedIn", key: system.linkedin, icon: system.linkedin === "connected" ? Wifi : WifiOff },
            ].map((s) => (
              <div key={s.label} className="flex justify-between items-center">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <s.icon className="w-3.5 h-3.5" />
                  {s.label}
                </span>
                <span className={`text-xs font-medium ${STATUS_COLOR[s.key]} flex items-center gap-1.5`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s.key]}`} />
                  {STATUS_LABEL[s.key]}
                </span>
              </div>
            ))}
          </div>

          {system?.linkedin === "disconnected" && (
            <a
              href="/api/auth/linkedin?returnTo=/dashboard"
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[#0A66C2]/10 hover:bg-[#0A66C2]/15 text-[#0A66C2] text-xs font-medium transition-all border border-[#0A66C2]/20"
            >
              <Linkedin className="w-3.5 h-3.5" />
              Connect LinkedIn
            </a>
          )}

          {stats && stats.failed > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-600">{stats.failed} post{stats.failed > 1 ? "s" : ""} failed</p>
                <Link href="/dashboard/drafts" className="text-[11px] text-red-500 hover:underline">View in Drafts →</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Recent Activity</h3>
          <Link href="/dashboard/history" className="text-xs text-[#0A66C2] hover:underline font-medium">
            View All →
          </Link>
        </div>
        <div className="divide-y divide-slate-50">
          {recentPosts.length > 0 ? recentPosts.map((post) => (
            <div key={post.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${STATUS_ICON_BG[post.status] || STATUS_ICON_BG.draft}`}>
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 group-hover:text-[#0A66C2] transition-colors line-clamp-1 max-w-md">
                    {post.topic}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400">{post.tone}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDate(post)}
                    </span>
                    {post.linkedin_post_id && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-[11px] text-[#0A66C2] font-medium flex items-center gap-1">
                          <Linkedin className="w-2.5 h-2.5" /> Live
                        </span>
                      </>
                    )}
                    {post.status === "published" && (post.likes_count != null || post.comments_count != null) && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <ThumbsUp className="w-3 h-3 text-[#0A66C2]" />{post.likes_count ?? 0}
                        </span>
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <MessageCircle className="w-3 h-3 text-slate-400" />{post.comments_count ?? 0}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${STATUS_BADGE[post.status] || STATUS_BADGE.draft}`}>
                {post.status}
              </span>
            </div>
          )) : (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-400 mb-2">No activity yet.</p>
              <Link href="/dashboard/create" className="text-[#0A66C2] text-sm font-medium hover:underline">
                Generate your first post →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
