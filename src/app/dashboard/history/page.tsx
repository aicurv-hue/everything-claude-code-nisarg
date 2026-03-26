"use client";

import React, { useEffect, useState } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { useRouter } from "next/navigation";
import { FileText, Clock, ChevronRight, Search, Linkedin, ThumbsUp, MessageCircle, RefreshCw, AlertTriangle } from "lucide-react";
import { Post } from "@/lib/db/posts";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";

type StatusFilter = "all" | "published" | "draft" | "failed";

function safeDate(seconds?: number): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function safeTime(seconds?: number): string {
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(seconds: number): string {
  const diff = Date.now() - seconds * 1000;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return safeDate(seconds);
}

const STATUS_BADGE: Record<string, string> = {
  published: "bg-green-50 text-green-700 border-green-200",
  draft:     "bg-blue-50 text-blue-700 border-blue-200",
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
};

const STATUS_ICON: Record<string, string> = {
  published: "bg-green-50 text-green-600",
  draft:     "bg-blue-50 text-blue-600",
  scheduled: "bg-amber-50 text-amber-600",
  failed:    "bg-red-50 text-red-600",
};

export default function HistoryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { segment, isIndividual, isCorporate } = useSegment();
  const [posts, setPosts]               = useState<Post[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [retrying, setRetrying]         = useState<string | null>(null);
  const [retryingAll, setRetryingAll]   = useState(false);

  const accentTab = isCorporate
    ? "bg-violet-50 border-violet-300 text-violet-700"
    : "bg-blue-50 border-blue-300 text-[#0A66C2]";

  useEffect(() => {
    async function loadHistory() {
      setIsLoading(true);
      try {
        const token = await getAuthToken();
        if (!token) { setPosts([]); return; }
        const res = await fetch(`/api/posts?segment=${segment}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setPosts(data.posts || []);
      } catch (error) {
        console.error("Error loading history:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadHistory();
  }, [segment, user]);

  const filtered = posts.filter((p) => {
    const matchesSearch =
      p.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleRetry = async (post: Post) => {
    if (!post.id || retrying) return;
    setRetrying(post.id);
    try {
      const token = await getAuthToken();
      if (!token) return;
      // Reset to scheduled with publish time = 1 minute from now
      const newTime = new Date(Date.now() + 60_000).toISOString();
      await fetch("/api/posts", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id, status: "scheduled", scheduled_at: newTime, failed_reason: null }),
      });
      setPosts(prev => prev.map(p => p.id === post.id
        ? { ...p, status: "scheduled", failed_reason: undefined }
        : p
      ));
    } finally {
      setRetrying(null);
    }
  };

  const handleRetryAll = async () => {
    const failedPosts = posts.filter(p => p.status === "failed");
    if (!failedPosts.length || retryingAll) return;
    setRetryingAll(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const newTime = new Date(Date.now() + 60_000).toISOString();
      await Promise.all(failedPosts.map(p =>
        fetch("/api/posts", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id: p.id, status: "scheduled", scheduled_at: newTime }),
        })
      ));
      setPosts(prev => prev.map(p =>
        p.status === "failed" ? { ...p, status: "scheduled", failed_reason: undefined } : p
      ));
    } finally {
      setRetryingAll(false);
    }
  };

  const counts = {
    all:       posts.length,
    published: posts.filter((p) => p.status === "published").length,
    draft:     posts.filter((p) => p.status === "draft").length,
    failed:    posts.filter((p) => p.status === "failed").length,
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6 animate-fade-in">

      {/* Retry All banner */}
      {counts.failed > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              {counts.failed} post{counts.failed > 1 ? "s" : ""} failed to publish.
              <span className="font-normal text-red-500 ml-1">Make sure LinkedIn is reconnected in Settings, then retry.</span>
            </p>
          </div>
          <button
            onClick={handleRetryAll}
            disabled={retryingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${retryingAll ? "animate-spin" : ""}`} />
            {retryingAll ? "Retrying…" : `Retry All (${counts.failed})`}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">History</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isIndividual ? "Personal brand" : "Company page"} · {counts.all} total posts
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search posts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all w-64"
          />
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "published", "draft", "failed"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              statusFilter === s
                ? s === "published" ? "bg-green-50 border-green-300 text-green-700"
                  : s === "failed"  ? "bg-red-50 border-red-300 text-red-600"
                  : s === "draft"   ? "bg-blue-50 border-blue-300 text-[#0A66C2]"
                  : accentTab
                : "bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="ml-1.5 opacity-60">{counts[s as keyof typeof counts] ?? counts.all}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
              <th className="px-5 py-3">Post Topic</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Created</th>
              <th className="px-5 py-3">Published</th>
              <th className="px-5 py-3">Tone</th>
              <th className="px-5 py-3">Engagement</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-5 py-4"><div className="h-3.5 w-48 bg-slate-100 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-3.5 w-16 bg-slate-100 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-3.5 w-16 bg-slate-100 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-3.5 w-16 bg-slate-100 rounded" /></td>
                  <td className="px-5 py-4"><div className="h-3.5 w-8 bg-slate-100 rounded ml-auto" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center text-slate-400 text-sm">
                  {searchTerm || statusFilter !== "all"
                    ? "No results found for your filters."
                    : "No history yet. Start by generating content!"}
                </td>
              </tr>
            ) : (
              filtered.map((post) => (
                <tr
                  key={post.id}
                  onClick={() => post.status === "draft" && post.id && router.push(`/dashboard/drafts/${post.id}/edit`)}
                  className={`hover:bg-slate-50 transition-colors group ${post.status === "draft" ? "cursor-pointer" : "cursor-default"}`}
                >
                  {/* Topic */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${STATUS_ICON[post.status] || STATUS_ICON.draft}`}>
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-slate-800 group-hover:text-[#0A66C2] transition-colors line-clamp-1 max-w-xs block">
                          {post.topic}
                        </span>
                        {post.linkedin_post_id && (
                          <span className="flex items-center gap-1 text-[11px] text-[#0A66C2] font-medium mt-0.5">
                            <Linkedin className="w-2.5 h-2.5" /> Live on LinkedIn
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border capitalize ${STATUS_BADGE[post.status] || STATUS_BADGE.draft}`}>
                      {post.status}
                    </span>
                    {post.status === "failed" && post.failed_reason && (
                      <div className="flex items-start gap-1 mt-1.5 max-w-[200px]">
                        <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-red-500 leading-tight">{post.failed_reason}</p>
                      </div>
                    )}
                  </td>

                  {/* Created */}
                  <td className="px-5 py-4">
                    <p className="text-sm text-slate-700">{safeDate(post.created_at?.seconds)}</p>
                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />{safeTime(post.created_at?.seconds)}
                    </p>
                  </td>

                  {/* Published */}
                  <td className="px-5 py-4">
                    {post.status === "published" && post.published_at?.seconds ? (
                      <div>
                        <p className="text-sm text-green-600 font-medium">{safeDate(post.published_at.seconds)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(post.published_at.seconds)}</p>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                  </td>

                  {/* Tone */}
                  <td className="px-5 py-4">
                    <span className="text-xs text-slate-500 capitalize">{post.tone}</span>
                  </td>

                  {/* Engagement */}
                  <td className="px-5 py-4">
                    {post.status === "published" ? (
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                          <ThumbsUp className="w-3.5 h-3.5 text-[#0A66C2]" />
                          {post.likes_count ?? "—"}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                          <MessageCircle className="w-3.5 h-3.5 text-slate-400" />
                          {post.comments_count ?? "—"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-sm">—</span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-5 py-4 text-right">
                    {post.status === "draft" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); post.id && router.push(`/dashboard/drafts/${post.id}/edit`); }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all"
                        title="Edit draft"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    {post.status === "failed" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRetry(post); }}
                        disabled={retrying === post.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-[11px] font-semibold transition-all disabled:opacity-50 ml-auto"
                        title="Reset to scheduled and retry publishing"
                      >
                        <RefreshCw className={`w-3 h-3 ${retrying === post.id ? "animate-spin" : ""}`} />
                        {retrying === post.id ? "Retrying…" : "Retry"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
