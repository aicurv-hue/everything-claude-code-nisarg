"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Upload, CalendarDays, CheckCircle, AlertCircle, Clock, Plus } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { Post } from "@/lib/db/posts";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import ContentCalendar from "@/components/schedule/ContentCalendar";
import PostDetailDrawer from "@/components/schedule/PostDetailDrawer";

export default function SchedulePage() {
  const { user } = useAuth();
  const { segment, isCorporate, segmentReady } = useSegment();
  const router = useRouter();

  const [posts, setPosts]         = useState<Post[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]   = useState<Post | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user || !segmentReady) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) { setPosts([]); return; }
      const res = await fetch(`/api/posts?segment=${segment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPosts(data.posts || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [segment, user, segmentReady]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const trigger = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        await fetch("/api/cron/trigger", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        load(true);
      } catch { /* silent */ }
    };
    trigger();
    const id = setInterval(trigger, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [user, load]);

  const handleReschedule = async (postId: string, newDate: Date, tz: string) => {
    const token = await getAuthToken();
    if (!token) return;
    await fetch("/api/posts", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: postId, status: "scheduled", scheduled_at: newDate.toISOString(), schedule_timezone: tz }),
    });
    setSelected(null);
    load(true);
  };

  const handleDelete = async (postId: string) => {
    const token = await getAuthToken();
    if (!token) return;
    await fetch("/api/posts", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: postId }),
    });
    setSelected(null);
    load(true);
  };

  const handlePostNow = async (postId: string) => {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/posts/publish-now", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || "Publish failed");
    setTimeout(() => load(true), 1500);
  };

  const scheduled  = posts.filter((p) => p.status === "scheduled")
    .sort((a, b) => (a.scheduled_at?.seconds ?? 0) - (b.scheduled_at?.seconds ?? 0));
  const published  = posts.filter((p) => p.status === "published")
    .sort((a, b) => (b.published_at?.seconds ?? b.created_at?.seconds ?? 0) - (a.published_at?.seconds ?? a.created_at?.seconds ?? 0));
  const failed     = posts.filter((p) => p.status === "failed")
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
          <CalendarDays className="w-7 h-7 animate-pulse" />
          <p className="text-sm">Loading calendar…</p>
        </div>
      </div>
    );
  }

  const statItems = [
    { label: "Scheduled", value: scheduled.length, color: "#f59e0b", icon: Clock,
      help: "Posts waiting to be published at their scheduled time." },
    { label: "Published", value: published.length, color: "#10b981", icon: CheckCircle,
      help: "Posts successfully published to LinkedIn." },
    { label: "Failed",    value: failed.length,    color: "#ef4444", icon: AlertCircle,
      help: "Posts that failed to publish. Click to reschedule or retry." },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--foreground)]">Schedule</h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-[3px]">
            {isCorporate ? "Company page" : "Personal brand"} · content calendar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/schedule/bulk"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{ background: 'var(--card)', border: '1.5px solid var(--border)', color: 'var(--foreground)' }}
          >
            <Upload className="w-3.5 h-3.5" /> Bulk Upload
          </Link>
          <Link
            href="/dashboard/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-all"
            style={{ background: 'var(--primary)' }}
          >
            <Plus className="w-3.5 h-3.5" /> Schedule Post
          </Link>
        </div>
      </div>

      {/* Stat pills */}
      <div className="grid grid-cols-3 gap-3.5">
        {statItems.map((s) => (
          <div key={s.label} className="card flex items-center gap-3.5" style={{ padding: '16px 20px' }}>
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0"
              style={{ background: `${s.color}20` }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[var(--text-muted)] font-semibold uppercase tracking-[0.04em]">{s.label}</span>
                <HelpTooltip text={s.help} position="bottom" width="w-60" />
              </div>
              <div className="text-[26px] font-bold text-[var(--foreground)] leading-[1.1] mt-[2px]">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar or empty state */}
      {posts.length === 0 ? (
        <div className="space-y-4">
          <div className="card text-center" style={{ padding: '56px 24px', border: '2px dashed var(--border)' }}>
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-base font-semibold text-[var(--foreground)] mb-2">Your calendar is empty</p>
            <p className="text-sm text-[var(--text-muted)] mb-4 max-w-sm mx-auto">
              Schedule individual posts or upload a CSV to plan weeks of content at once.
            </p>
            <div className="flex items-center justify-center gap-3 mb-6">
              {[
                { label: "Scheduled", color: "#f59e0b" },
                { label: "Published", color: "#10b981" },
                { label: "Failed",    color: "#ef4444" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.color }} /> {l.label}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/dashboard/create"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--primary)' }}
              >
                <Plus className="w-3.5 h-3.5" /> Create & Schedule
              </Link>
              <Link
                href="/dashboard/schedule/bulk"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--card)', border: '1.5px solid var(--border)', color: 'var(--foreground)' }}
              >
                <Upload className="w-4 h-4" /> Bulk Upload CSV
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <ContentCalendar
          posts={posts}
          segment={segment as "individual" | "corporate"}
          onPostClick={setSelected}
        />
      )}

      <PostDetailDrawer
        post={selected}
        onClose={() => setSelected(null)}
        onReschedule={handleReschedule}
        onDelete={handleDelete}
        onPostNow={handlePostNow}
        segment={segment as "individual" | "corporate"}
      />
    </div>
  );
}
