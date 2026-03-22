"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Upload, CalendarDays, CheckCircle, AlertCircle, Clock, Info } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { postService, Post } from "@/lib/db/posts";
import { useSegment } from "@/lib/context/segment";
import ContentCalendar from "@/components/schedule/ContentCalendar";
import PostDetailDrawer from "@/components/schedule/PostDetailDrawer";

export default function SchedulePage() {
  const { segment, isCorporate } = useSegment();
  const router = useRouter();

  const [posts, setPosts]         = useState<Post[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected]   = useState<Post | null>(null);

  const accentColor = isCorporate ? "text-violet-600" : "text-[#0A66C2]";
  const accentBg    = isCorporate ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const all = await postService.getAll("demo-user");
      setPosts(all.filter((p) => p.segment === segment));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [segment]);

  useEffect(() => { load(); }, [load]);

  const handleReschedule = async (postId: string, newDate: Date, tz: string) => {
    await postService.reschedulePost(postId, newDate, tz);
    setSelected(null);
    load(true);
  };

  const handleDelete = async (postId: string) => {
    await postService.deletePost(postId);
    setSelected(null);
    load(true);
  };

  const scheduled  = posts.filter((p) => p.status === "scheduled");
  const published  = posts.filter((p) => p.status === "published");
  const failed     = posts.filter((p) => p.status === "failed");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <CalendarDays className="w-7 h-7 animate-pulse" />
          <p className="text-sm">Loading calendar…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isCorporate ? "Company page" : "Personal brand"} · content calendar
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/dashboard/schedule/bulk"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-all"
            title="Upload a CSV with up to 500 posts — each with its own topic, tone, and scheduled time"
          >
            <Upload className="w-4 h-4" /> Bulk Upload
          </Link>
          <Link
            href="/dashboard/create"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-sm font-semibold text-white transition-all"
          >
            + Schedule Post
          </Link>
        </div>
      </div>

      {/* Stat summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Scheduled",  count: scheduled.length,  icon: Clock,         color: "text-amber-600",  bg: "bg-amber-50",  border: "border-amber-200",
            help: "Posts waiting to be published at their scheduled time. Once connected to LinkedIn, they will post automatically." },
          { label: "Published",  count: published.length,  icon: CheckCircle,   color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",
            help: "Posts that were successfully published to LinkedIn." },
          { label: "Failed",     count: failed.length,     icon: AlertCircle,   color: "text-red-500",    bg: "bg-red-50",    border: "border-red-200",
            help: "Posts that failed to publish — usually due to an expired LinkedIn token or connection issue. Click the post to reschedule or retry." },
        ].map((s) => (
          <div key={s.label} className={`card p-4 flex items-center gap-3 border ${s.border}`}>
            <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] text-slate-400 font-medium">{s.label}</p>
                <HelpTooltip text={s.help} position="bottom" width="w-60" />
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {posts.length === 0 ? (
        <div className="space-y-4">
          <div className="card p-14 text-center border-2 border-dashed border-slate-200">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-base font-semibold text-slate-700 mb-2">Your calendar is empty</p>
            <p className="text-sm text-slate-400 mb-2 max-w-sm mx-auto">
              Schedule individual posts or upload a CSV to plan weeks of content at once.
            </p>
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Amber = scheduled
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Green = published
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Red = failed
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link
                href="/dashboard/create"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${accentBg} ${accentColor}`}
              >
                + Create & Schedule a Post
              </Link>
              <Link
                href="/dashboard/schedule/bulk"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
              >
                <Upload className="w-4 h-4" /> Bulk Upload CSV
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4 flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-[#0A66C2]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-0.5">Single post</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">Create a post → on the preview page, click "Schedule" → pick a date & time. AI will suggest the best times based on your history.</p>
              </div>
            </div>
            <div className="card p-4 flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-0.5">Bulk CSV upload</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">Download the template, fill in up to 500 rows (topic, tone, date), upload the file. All posts land in your calendar instantly.</p>
              </div>
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

      {/* Post detail drawer */}
      <PostDetailDrawer
        post={selected}
        onClose={() => setSelected(null)}
        onReschedule={handleReschedule}
        onDelete={handleDelete}
        segment={segment as "individual" | "corporate"}
      />
    </div>
  );
}
