"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart3, Send, CheckCircle, Clock, TrendingUp,
  FileText, RefreshCw, Linkedin, Zap, Image, AlertTriangle,
  Wifi, WifiOff, Activity, User, Building2, Calendar, X, Plus
} from "lucide-react";
import { Post } from "@/lib/db/posts";
import { UserProfile } from "@/lib/db/profiles";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { auth as firebaseAuth } from "@/lib/firebase";
import { getIdToken } from "firebase/auth";

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
  ready: "#10b981",
  active: "#2563eb",
  connected: "#10b981",
  refreshing: "#f59e0b",
  mock: "#f59e0b",
  degraded: "#ef4444",
  disconnected: "#ef4444",
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

function Badge({ label, color }: { label: string; color: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    blue:   { bg: '#1e3a5f', text: '#60a5fa' },
    green:  { bg: '#14301f', text: '#34d399' },
    amber:  { bg: '#2d2010', text: '#fbbf24' },
    red:    { bg: '#2d1010', text: '#f87171' },
    gray:   { bg: '#1e2130', text: '#6b7280' },
  };
  const c = colors[color] || colors.gray;
  return (
    <span
      className="text-[11px] font-semibold px-2 py-[3px] rounded-full tracking-[0.02em] whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}
    >
      {label}
    </span>
  );
}

export default function DashboardHomePage() {
  const { user } = useAuth();
  const { segment, isIndividual, isCorporate, segmentReady } = useSegment();
  const searchParams = useSearchParams();
  const [welcomeDismissed, setWelcomeDismissed] = useState(true);
  const welcomePlan = searchParams.get("plan") || "Pro";

  useEffect(() => {
    const isWelcome = searchParams.get("welcome") === "true";
    const alreadyDismissed = sessionStorage.getItem("cridl_welcome_dismissed") === "1";
    setWelcomeDismissed(!isWelcome || alreadyDismissed);
  }, [searchParams]);

  const dismissWelcome = () => {
    sessionStorage.setItem("cridl_welcome_dismissed", "1");
    setWelcomeDismissed(true);
  };

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

  const loadAll = useCallback(async (silent = false) => {
    if (!user || !segmentReady) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = firebaseAuth?.currentUser ? await getIdToken(firebaseAuth.currentUser) : null;

      const [dashData, serverStats] = await Promise.all([
        fetch(`/api/dashboard/data?segment=${segment}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()),
        fetch("/api/dashboard/stats", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((r) => r.json()),
      ]);

      if (dashData.error) throw new Error(dashData.error);

      setStats(dashData.stats);
      setProfile(dashData.profile);
      setAllPosts(dashData.allPosts || []);
      setRecent(
        (dashData.posts || [])
          .sort((a: Post, b: Post) => {
            const ts = (p: Post) => p.published_at?.seconds ?? p.created_at?.seconds ?? 0;
            return ts(b) - ts(a);
          })
          .slice(0, 6)
      );
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
  }, [user, segment, segmentReady]);

  useEffect(() => { if (user && segmentReady) loadAll(); }, [user, segment, segmentReady, loadAll]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("linkedin_connected") === "true") {
      window.history.replaceState({}, "", window.location.pathname);
      if (user) loadAll(true);
    }
  }, [user]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "linkedin_connected" && user) loadAll(true);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [user]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="h-7 w-32 skeleton" />
            <div className="h-4 w-48 skeleton" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="h-4 w-24 skeleton" />
              <div className="h-9 w-16 skeleton" />
              <div className="h-3 w-32 skeleton" />
            </div>
          ))}
        </div>
        <div className="card p-5 space-y-4">
          <div className="h-5 w-28 skeleton" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[5px] w-full skeleton rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)] mb-1">Dashboard failed to load</p>
            <p className="text-xs text-[var(--text-muted)]">{error}</p>
          </div>
          <button
            onClick={() => { setError(""); setLoading(true); loadAll(); }}
            className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const statCards = stats ? [
    {
      label: "Total Generated",
      value: stats.total,
      icon: "bar",
      color: "#2563eb",
      sub: `${stats.drafts} drafts · ${stats.failed} failed`,
    },
    {
      label: "Live on LinkedIn",
      value: stats.published,
      icon: "send",
      color: "#10b981",
      sub: stats.published > 0 ? "Confirmed published" : "No posts published yet",
    },
    {
      label: "Published This Week",
      value: stats.lastWeek,
      icon: "calendar",
      color: "#f59e0b",
      sub: stats.lastWeek > 0 ? "Posts this week" : "No posts this week",
    },
  ] : [];

  const IconMap: Record<string, React.FC<{ className?: string }>> = {
    bar: BarChart3, send: Send, calendar: Calendar,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">

      {/* Welcome banner */}
      {!welcomeDismissed && (
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-[14px]"
          style={{ background: '#14301f', border: '1px solid #1a4028' }}>
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="flex-1 text-sm text-emerald-300">
            You&apos;re on the <strong>{welcomePlan}</strong> plan — your 14-day free trial has started.
          </p>
          <button onClick={dismissWelcome} className="text-emerald-500 hover:text-emerald-300 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--foreground)]">Dashboard</h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-[3px]">
            {isIndividual ? "Personal branding workspace" : "Company page workspace"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated > 0 && (
            <span className="text-[12px] text-[var(--text-muted)]">{timeAgo(lastUpdated)}</span>
          )}
          <button
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/dashboard/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-all"
            style={{ background: 'var(--primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Create Post
          </Link>
        </div>
      </div>

      {/* Profile banner */}
      {(() => {
        const seg      = isIndividual ? profile?.individual : profile?.corporate;
        const dispName = seg?.name || (isIndividual ? "Your Name" : "Company Name");
        const dispRole = seg?.roleOrIndustry || (isIndividual ? "Add your role in Settings" : "Add your industry in Settings");

        return (
          <div className="card flex items-center justify-between" style={{ padding: '16px 20px' }}>
            <div className="flex items-center gap-3">
              {isIndividual && linkedin?.connected && linkedin.picture ? (
                <img src={linkedin.picture} alt={linkedin.name}
                  className="w-10 h-10 rounded-full border-2 border-[var(--border)] shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `linear-gradient(135deg, var(--primary)cc, var(--primary))` }}>
                  <span className="text-white text-sm font-semibold">
                    {dispName.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                  </span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[14px] text-[var(--foreground)]">{dispName}</span>
                  <Badge label={isCorporate ? "Corporate" : "Individual"} color="gray" />
                </div>
                <div className="text-[12px] text-[var(--text-muted)] mt-[2px]">{dispRole}</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {linkedin?.connected ? (
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="w-[7px] h-[7px] rounded-full bg-emerald-500 inline-block" />
                    <span className="text-[12px] font-semibold text-emerald-400">LinkedIn Connected</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-[2px]">
                    {linkedin.email}{linkedin.tokenDaysLeft > 0 ? ` · Token valid ${linkedin.tokenDaysLeft}d` : ""}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const url = `/api/auth/linkedin?returnTo=/dashboard/settings&uid=${encodeURIComponent(user?.uid || "")}`;
                    const popup = window.open(url, "linkedin-oauth", "width=620,height=720,scrollbars=yes,resizable=yes");
                    if (!popup || popup.closed || typeof popup.closed === "undefined") window.location.href = url;
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-sub)] transition-all"
                  style={{ background: 'var(--card)', border: '1.5px solid var(--border)' }}
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  Connect LinkedIn
                </button>
              )}
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: '#0a66c2' }}>
                <Linkedin className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((stat, i) => {
          const StatIcon = IconMap[stat.icon];
          return (
            <div key={i} className="card flex items-start justify-between" style={{ padding: '20px 24px' }}>
              <div>
                <div className="text-[11px] text-[var(--text-muted)] font-semibold tracking-[0.05em] uppercase mb-2">{stat.label}</div>
                <div className="text-[34px] font-bold text-[var(--foreground)] leading-none">{stat.value}</div>
                <div className="text-[12px] text-[var(--text-muted)] mt-1.5">{stat.sub}</div>
              </div>
              <div className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: `${stat.color}20` }}>
                {StatIcon && <span style={{ color: stat.color }}><StatIcon className="w-[18px] h-[18px]" /></span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Post Breakdown + System Status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px' }}>
        {/* Post Breakdown */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-[14px] font-semibold text-[var(--foreground)]">Post Breakdown</h3>
            <Badge label="Live Data" color="green" />
          </div>
          {stats && stats.total > 0 ? (
            <div className="pt-1">
              {[
                { label: "Published & Live", count: stats.published, color: "#10b981" },
                { label: "Drafts", count: stats.drafts, color: "#2563eb" },
                { label: "Scheduled", count: stats.scheduled, color: "#f59e0b" },
                { label: "Failed", count: stats.failed, color: "#ef4444" },
              ].map((row) => (
                <div key={row.label} className="py-3.5" style={{ borderBottom: '1px solid var(--border-sub)' }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[13px] text-[var(--text-sub)] font-medium">{row.label}</span>
                    <span className="text-[13px] font-semibold text-[var(--foreground)]">{row.count}</span>
                  </div>
                  <div className="h-[5px] rounded-full" style={{ background: 'var(--progress-bg)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: stats.total > 0 ? `${Math.min((row.count / stats.total) * 100, 100)}%` : "0%",
                        background: row.color,
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Posting-as footer */}
              <div className="mt-4 rounded-lg flex items-center justify-between"
                style={{ padding: '12px 14px', background: 'var(--info-bg)', border: '1px solid var(--info-border)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `linear-gradient(135deg, var(--primary)cc, var(--primary))` }}>
                    <span className="text-white text-[9px] font-semibold">
                      {((isIndividual ? profile?.individual?.name : profile?.corporate?.name) || "U")
                        .split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    Posting as{" "}
                    <strong className="text-[var(--foreground)]">
                      {(isIndividual ? profile?.individual?.name : profile?.corporate?.name)
                        || (isIndividual ? "You" : "Your Company")}
                    </strong>
                  </span>
                </div>
                <Link href="/dashboard/settings"
                  className="text-[12px] text-[var(--text-muted)] font-medium hover:text-[var(--foreground)] transition-colors">
                  Edit profile →
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
              <TrendingUp className="w-9 h-9 text-[var(--text-muted)]" />
              <p className="text-sm font-medium text-[var(--text-sub)]">No posts yet</p>
              <p className="text-xs text-[var(--text-muted)]">Generate your first post to see data here.</p>
              <Link href="/dashboard/create" className="mt-1 px-4 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ background: 'var(--primary)', color: '#fff' }}>
                Create First Post →
              </Link>
            </div>
          )}
        </div>

        {/* System Status */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 className="text-[14px] font-semibold text-[var(--foreground)] mb-4">System Status</h3>

          <div className="flex items-center gap-2.5 mb-[18px]">
            {isIndividual && linkedin?.connected && linkedin.picture ? (
              <img src={linkedin.picture} alt={linkedin.name} className="w-9 h-9 rounded-full" />
            ) : (
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                style={{ background: `linear-gradient(135deg, var(--primary)cc, var(--primary))` }}>
                <span className="text-white text-xs font-semibold">
                  {((isIndividual ? profile?.individual?.name : profile?.corporate?.name) || "U")
                    .split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                </span>
              </div>
            )}
            <div>
              <div className="text-[13px] font-semibold text-[var(--foreground)]">
                {(isIndividual ? profile?.individual?.name : profile?.corporate?.name)
                  || (isIndividual ? "Individual Account" : "Corporate Account")}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {(isIndividual ? profile?.individual?.roleOrIndustry : profile?.corporate?.roleOrIndustry)
                  || (linkedin?.connected ? linkedin.email : "No profile set up yet")}
              </div>
            </div>
          </div>

          <div className="text-[10px] font-bold text-[var(--text-muted)] tracking-[0.08em] uppercase mb-2.5">Live Status</div>
          {system && [
            { label: "Cridl Cortex",  key: system.aiEngine,    color: STATUS_COLOR[system.aiEngine] },
            { label: "Image Engine",  key: system.imageEngine,  color: STATUS_COLOR[system.imageEngine] },
            { label: "Profile Sync",  key: system.profileSync,  color: STATUS_COLOR[system.profileSync] },
            { label: "LinkedIn",      key: system.linkedin,     color: STATUS_COLOR[system.linkedin] },
          ].map((s) => (
            <div key={s.label} className="flex justify-between items-center py-2"
              style={{ borderBottom: '1px solid var(--border-sub)' }}>
              <span className="text-[12px] text-[var(--text-sub)]">{s.label}</span>
              <div className="flex items-center gap-[5px]">
                <span className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: s.color }} />
                <span className="text-[11px] font-semibold" style={{ color: s.color }}>{STATUS_LABEL[s.key]}</span>
              </div>
            </div>
          ))}

          {system?.linkedin === "disconnected" && (
            <button
              onClick={() => {
                const url = `/api/auth/linkedin?returnTo=/dashboard/settings&uid=${encodeURIComponent(user?.uid || "")}`;
                const w = 600, h = 700;
                const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
                const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
                const popup = window.open(url, "linkedin_oauth", `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`);
                if (!popup || popup.closed) window.location.href = url;
              }}
              className="flex items-center justify-center gap-2 w-full py-2 mt-4 rounded-lg text-xs font-medium transition-all"
              style={{ background: '#0a66c220', color: '#60a5fa', border: '1px solid #1e3a5f' }}
            >
              <Linkedin className="w-3.5 h-3.5" />
              Connect LinkedIn
            </button>
          )}

          {stats && stats.failed > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg mt-4"
              style={{ background: '#2d1010', border: '1px solid #3d1515' }}>
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-red-400">{stats.failed} post{stats.failed > 1 ? "s" : ""} failed</p>
                <Link href="/dashboard/drafts" className="text-[11px] text-red-500 hover:underline">View in Drafts →</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
