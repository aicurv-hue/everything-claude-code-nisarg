"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { useRouter } from "next/navigation";
import {
  FileText, Clock, ChevronRight, Search, Linkedin, RefreshCw,
  AlertTriangle, Send, Trash2, X, ChevronLeft, Copy, Check,
  Image as ImageIcon, BookOpen, Users, AlignLeft, MessageSquare,
  Calendar, Tag, Sparkles, ExternalLink,
} from "lucide-react";
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

function safeDateFull(seconds?: number): string {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "long", year: "numeric",
  }) + " · " + new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  published: "text-emerald-400 border-emerald-800/40",
  draft:     "text-blue-400 border-blue-800/40",
  scheduled: "text-amber-400 border-amber-800/40",
  failed:    "text-red-400 border-red-800/40",
};

const STATUS_ICON: Record<string, string> = {
  published: "text-emerald-400",
  draft:     "text-blue-400",
  scheduled: "text-amber-400",
  failed:    "text-red-400",
};

// ── Post Detail Modal ─────────────────────────────────────────────────────────

function PostDetailModal({
  post,
  posts,
  currentIndex,
  onNavigate,
  onClose,
  onDelete,
  onRetry,
  onRepost,
}: {
  post: Post;
  posts: Post[];
  currentIndex: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
  onDelete: (post: Post) => Promise<void>;
  onRetry: (post: Post) => Promise<void>;
  onRepost: (post: Post) => Promise<void>;
}) {
  const [copied, setCopied] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<"retry" | "repost" | "delete" | null>(null);
  const [repostResult, setRepostResult] = useState<"success" | "error" | null>(null);
  const [mobileTab, setMobileTab] = useState<"input" | "output">("output");

  // Close on Escape, navigate on arrow keys
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentIndex > 0) onNavigate(currentIndex - 1);
      if (e.key === "ArrowRight" && currentIndex < posts.length - 1) onNavigate(currentIndex + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIndex, posts.length, onClose, onNavigate]);

  // Reset repost result when post changes
  useEffect(() => { setRepostResult(null); setCopied(false); setResearchOpen(false); setMobileTab("output"); }, [post.id]);

  const copyContent = () => {
    navigator.clipboard.writeText(post.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${post.topic}"? This cannot be undone.`)) return;
    setActionLoading("delete");
    await onDelete(post);
    setActionLoading(null);
    onClose();
  };

  const handleRetry = async () => {
    setActionLoading("retry");
    await onRetry(post);
    setActionLoading(null);
  };

  const handleRepost = async () => {
    setActionLoading("repost");
    await onRepost(post);
    setActionLoading(null);
    setRepostResult("success");
  };

  const createdSecs   = post.created_at?.seconds;
  const publishedSecs = post.published_at?.seconds;
  const scheduledSecs = post.scheduled_at?.seconds;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-3xl h-[100dvh] md:h-[88vh] bg-[var(--card)] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border-sub)] shrink-0">
          {/* Nav arrows */}
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="p-1.5 rounded-lg hover:bg-[var(--toggle-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title="Previous post (←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-[var(--text-muted)] font-medium w-14 text-center tabular-nums">
            {currentIndex + 1} / {posts.length}
          </span>
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            disabled={currentIndex === posts.length - 1}
            className="p-1.5 rounded-lg hover:bg-[var(--toggle-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title="Next post (→)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0 ml-1">
            <h2 className="text-sm font-semibold text-[var(--foreground)] truncate">{post.topic}</h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {post.segment === "corporate" ? "Company page" : "Personal profile"} ·{" "}
              <span className={`font-medium capitalize ${
                post.status === "published" ? "text-emerald-400" :
                post.status === "failed"    ? "text-red-500" :
                post.status === "scheduled" ? "text-amber-400" : "text-blue-400"
              }`}>{post.status}</span>
            </p>
          </div>

          {/* Status badge */}
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border capitalize shrink-0 ${STATUS_BADGE[post.status] || STATUS_BADGE.draft}`}>
            {post.status}
          </span>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--toggle-bg)] text-[var(--text-muted)] hover:text-[var(--text-sub)] transition-all"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Mobile tab switcher ── */}
        <div className="flex md:hidden border-b border-[var(--border-sub)] shrink-0">
          <button
            onClick={() => setMobileTab("output")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${mobileTab === "output" ? "text-[var(--primary)] border-b-2 border-[#0A66C2]" : "text-[var(--text-muted)]"}`}
          >
            AI Output
          </button>
          <button
            onClick={() => setMobileTab("input")}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${mobileTab === "input" ? "text-[var(--primary)] border-b-2 border-[#0A66C2]" : "text-[var(--text-muted)]"}`}
          >
            Your Input
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-[var(--border-sub)] min-h-0">

            {/* LEFT — Inputs */}
            <div className={`p-5 space-y-4 ${mobileTab === "input" ? "block" : "hidden"} md:block`}>
              <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Your Input</p>

              {/* Topic */}
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Tag className="w-3.5 h-3.5 text-[var(--primary)]" />
                </div>
                <div>
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-0.5">Topic</p>
                  <p className="text-sm text-[var(--foreground)] font-medium leading-snug">{post.topic || "—"}</p>
                </div>
              </div>

              {/* Tone + Length row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--card-hover)] rounded-xl p-3 border border-[var(--border-sub)]">
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">Tone</p>
                  <p className="text-sm text-[var(--foreground)] capitalize font-medium">{post.tone || "—"}</p>
                </div>
                <div className="bg-[var(--card-hover)] rounded-xl p-3 border border-[var(--border-sub)]">
                  <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">Length</p>
                  <p className="text-sm text-[var(--foreground)] capitalize font-medium">{post.length || "—"}</p>
                </div>
              </div>

              {/* Audience */}
              {post.audience && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Users className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-0.5">Audience</p>
                    <p className="text-sm text-[var(--foreground)] leading-snug">{post.audience}</p>
                  </div>
                </div>
              )}

              {/* Custom instructions */}
              {post.custom_instructions && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-0.5">Custom Instructions</p>
                    <p className="text-sm text-[var(--foreground)] leading-snug">{post.custom_instructions}</p>
                  </div>
                </div>
              )}

              {/* Research data (collapsible) */}
              {post.research_data && (
                <div className="border border-[var(--border-sub)] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setResearchOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-[var(--card-hover)] hover:bg-[var(--toggle-bg)] transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      <span className="text-[11px] font-semibold text-[var(--text-muted)]">AI Research Data</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${researchOpen ? "rotate-90" : ""}`} />
                  </button>
                  {researchOpen && (
                    <div className="px-3 py-3 text-[11px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                      {typeof post.research_data === "string"
                        ? post.research_data
                        : JSON.stringify(post.research_data, null, 2)}
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="border-t border-[var(--border-sub)] pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide">Created</span>
                    <p className="text-xs text-[var(--text-sub)]">{safeDateFull(createdSecs)}</p>
                  </div>
                </div>
                {post.status === "published" && publishedSecs && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-green-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide">Published</span>
                      <p className="text-xs text-emerald-400 font-medium">{safeDateFull(publishedSecs)}</p>
                    </div>
                  </div>
                )}
                {post.status === "scheduled" && scheduledSecs && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide">Scheduled for</span>
                      <p className="text-xs text-amber-400 font-medium">{safeDateFull(scheduledSecs)}</p>
                    </div>
                  </div>
                )}
                {post.status === "failed" && post.failed_reason && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide">Failure Reason</span>
                      <p className="text-xs text-red-500 leading-snug">{post.failed_reason}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT — Output */}
            <div className={`p-5 space-y-4 ${mobileTab === "output" ? "block" : "hidden"} md:block`}>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">AI Output</p>
                <button
                  onClick={copyContent}
                  className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors"
                  title="Copy post content"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Image */}
              {post.image_url && (
                <div className="rounded-xl overflow-hidden border border-[var(--border-sub)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={post.image_url} alt="Post image" className="w-full h-44 object-cover" />
                  {post.image_hook && (
                    <div className="px-3 py-2 bg-[var(--card-hover)] border-t border-[var(--border-sub)]">
                      <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-0.5">Image Hook</p>
                      <p className="text-xs text-[var(--text-sub)] italic">"{post.image_hook}"</p>
                    </div>
                  )}
                </div>
              )}
              {!post.image_url && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--card-hover)] border border-[var(--border-sub)]">
                  <ImageIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <span className="text-[11px] text-[var(--text-muted)]">No image</span>
                </div>
              )}

              {/* Post content */}
              <div className="bg-[var(--card-hover)] rounded-xl border border-[var(--border-sub)] p-3 overflow-y-auto" style={{ minHeight: "12rem", maxHeight: "40vh" }}>
                <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{post.content}</p>
              </div>

              {/* Live LinkedIn link */}
              {post.linkedin_post_id && (
                <a
                  href={`https://www.linkedin.com/feed/update/${post.linkedin_post_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--primary)]/5 border border-[#0A66C2]/20 hover:bg-[var(--primary)]/10 transition-colors group"
                >
                  <Linkedin className="w-4 h-4 text-[var(--primary)] shrink-0" />
                  <span className="text-xs text-[var(--primary)] font-medium flex-1">View live post on LinkedIn</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--primary)]/50 group-hover:text-[var(--primary)] transition-colors" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[var(--border-sub)] bg-[var(--card-hover)] shrink-0">
          <div className="flex items-center gap-2">
            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={actionLoading === "delete"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-200 text-[var(--text-muted)] hover:text-red-500 text-xs font-medium transition-all disabled:opacity-40"
            >
              {actionLoading === "delete"
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Trash2 className="w-3.5 h-3.5" />}
              Delete
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Retry failed */}
            {post.status === "failed" && (
              <button
                onClick={handleRetry}
                disabled={actionLoading === "retry"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-200 text-red-400 text-xs font-semibold transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === "retry" ? "animate-spin" : ""}`} />
                {actionLoading === "retry" ? "Retrying…" : "Retry Now"}
              </button>
            )}

            {/* Repost published */}
            {post.status === "published" && (
              <button
                onClick={handleRepost}
                disabled={actionLoading === "repost" || repostResult === "success"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50 ${
                  repostResult === "success"
                    ? "bg-emerald-500/10 border-emerald-800/40 text-emerald-400"
                    : "bg-[var(--primary)]/5 hover:bg-[var(--primary)]/10 border-[#0A66C2]/20 text-[var(--primary)]"
                }`}
              >
                {actionLoading === "repost" ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Posting…</>
                ) : repostResult === "success" ? (
                  <><Check className="w-3.5 h-3.5" /> Reposted!</>
                ) : (
                  <><Send className="w-3.5 h-3.5" /> Repost to LinkedIn</>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[var(--border)] hover:bg-[var(--card-hover)] text-[var(--text-sub)] text-xs font-medium transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { segment, isIndividual, isCorporate, segmentReady } = useSegment();
  const [posts, setPosts]               = useState<Post[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [searchTerm, setSearchTerm]     = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [retrying, setRetrying]         = useState<string | null>(null);
  const [retryingAll, setRetryingAll]   = useState(false);
  const [reposting, setReposting]       = useState<string | null>(null);
  const [repostStatus, setRepostStatus] = useState<Record<string, "success" | "error">>({});
  const [repostIds, setRepostIds]       = useState<Record<string, string>>({});
  const [deleting, setDeleting]         = useState<string | null>(null);

  // Modal state
  const [modalPost, setModalPost]   = useState<Post | null>(null);
  const [modalIndex, setModalIndex] = useState<number>(0);

  // C2: Pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(0);

  const accentTab = isCorporate
    ? "bg-violet-500/10 border-violet-800/40 text-violet-400"
    : "bg-blue-500/10 border-blue-800/40 text-[var(--primary)]";

  useEffect(() => {
    if (!user || !segmentReady) return;
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
  }, [segment, user, segmentReady]);

  const sortSecs = (p: Post) => {
    if (p.status === "published") return p.published_at?.seconds ?? p.created_at?.seconds ?? 0;
    if (p.status === "scheduled") return p.scheduled_at?.seconds ?? p.created_at?.seconds ?? 0;
    return p.created_at?.seconds ?? 0;
  };

  const filtered = posts
    .filter((p) => {
      const matchesSearch =
        p.topic.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.content.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => sortSecs(b) - sortSecs(a));

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [searchTerm, statusFilter, segment]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const openModal = (post: Post, index: number) => {
    setModalPost(post);
    setModalIndex(index);
  };

  const closeModal = () => setModalPost(null);

  const navigateModal = useCallback((index: number) => {
    if (index < 0 || index >= filtered.length) return;
    setModalPost(filtered[index]);
    setModalIndex(index);
  }, [filtered]);

  const handleRetry = async (post: Post) => {
    if (!post.id || retrying) return;
    setRetrying(post.id);
    try {
      const token = await getAuthToken();
      if (!token) return;
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

  const handleRepost = async (post: Post) => {
    if (!post.id || reposting) return;
    setReposting(post.id);
    setRepostStatus(prev => { const n = { ...prev }; delete n[post.id!]; return n; });
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          content: post.content,
          imageUrl: post.image_url || null,
          segment: post.segment || segment,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRepostStatus(prev => ({ ...prev, [post.id!]: "success" }));
        if (data.postId && data.postId !== "unknown") {
          setRepostIds(prev => ({ ...prev, [post.id!]: data.postId }));
        }
      } else {
        setRepostStatus(prev => ({ ...prev, [post.id!]: "error" }));
        console.error("[Repost] failed:", data.error);
      }
    } catch {
      setRepostStatus(prev => ({ ...prev, [post.id!]: "error" }));
    } finally {
      setReposting(null);
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

  const handleDelete = async (post: Post) => {
    if (!post.id || deleting) return;
    if (!confirm(`Delete "${post.topic}"? This cannot be undone.`)) return;
    setDeleting(post.id);
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch("/api/posts", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: post.id }),
      });
      setPosts(prev => prev.filter(p => p.id !== post.id));
    } finally {
      setDeleting(null);
    }
  };

  const counts = {
    all:       posts.length,
    published: posts.filter((p) => p.status === "published").length,
    draft:     posts.filter((p) => p.status === "draft").length,
    failed:    posts.filter((p) => p.status === "failed").length,
  };

  return (
    <>
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6 animate-fade-in">

        {/* Retry All banner */}
        {counts.failed > 0 && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-400 font-medium">
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
            <h1 className="text-2xl font-bold text-[var(--foreground)]">History</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {isIndividual ? "Personal brand" : "Company page"} · {counts.all} total posts
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search posts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[var(--card)] border border-[var(--border)] rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all w-64"
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
                  ? s === "published" ? "bg-emerald-500/10 border-emerald-800/40 text-emerald-400"
                    : s === "failed"  ? "bg-red-500/10 border-red-800/40 text-red-400"
                    : s === "draft"   ? "bg-blue-500/10 border-blue-800/40 text-[var(--primary)]"
                    : accentTab
                  : "bg-[var(--card)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-[var(--border)]"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              <span className="ml-1.5 opacity-60">{counts[s as keyof typeof counts] ?? counts.all}</span>
            </button>
          ))}
        </div>

        {/* ── Mobile card list (hidden on md+) ── */}
        <div className="md:hidden space-y-3">
          {isLoading ? (
            [1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)
          ) : filtered.length === 0 ? (
            <div className="card px-5 py-12 text-center text-[var(--text-muted)] text-sm">
              {searchTerm || statusFilter !== "all" ? "No results for your filters." : "No history yet. Start by generating content!"}
            </div>
          ) : paginated.map((post, idx) => (
            <div
              key={post.id}
              onClick={() => openModal(post, page * PAGE_SIZE + idx)}
              className="card px-4 py-3.5 flex items-center gap-3 active:bg-[var(--card-hover)] transition-colors cursor-pointer"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${STATUS_ICON[post.status] || STATUS_ICON.draft}`}>
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--foreground)] line-clamp-1">{post.topic}</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {safeDate(post.created_at?.seconds)} · <span className="capitalize">{post.tone}</span>
                </p>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${STATUS_BADGE[post.status] || STATUS_BADGE.draft}`}>
                  {post.status}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop table (hidden on mobile) ── */}
        <div className="hidden md:block card overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border-sub)] bg-[var(--card-hover)] text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-semibold">
                <th className="px-5 py-3">Post Topic</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Published</th>
                <th className="px-5 py-3">Tone</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-sub)]">
              {isLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="h-3.5 w-48 bg-[var(--toggle-bg)] rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-16 bg-[var(--toggle-bg)] rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-24 bg-[var(--toggle-bg)] rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-24 bg-[var(--toggle-bg)] rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-16 bg-[var(--toggle-bg)] rounded" /></td>
                    <td className="px-5 py-4"><div className="h-3.5 w-8 bg-[var(--toggle-bg)] rounded ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-[var(--text-muted)] text-sm">
                    {searchTerm || statusFilter !== "all"
                      ? "No results found for your filters."
                      : "No history yet. Start by generating content!"}
                  </td>
                </tr>
              ) : (
                paginated.map((post, idx) => (
                  <tr
                    key={post.id}
                    onClick={() => openModal(post, page * PAGE_SIZE + idx)}
                    className="hover:bg-[var(--card-hover)] transition-colors group cursor-pointer"
                  >
                    {/* Topic */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${STATUS_ICON[post.status] || STATUS_ICON.draft}`}>
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors line-clamp-1 max-w-xs block">
                            {post.topic}
                          </span>
                          {post.linkedin_post_id && (
                            <a
                              href={`https://www.linkedin.com/feed/update/${post.linkedin_post_id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-[11px] text-[var(--primary)] font-medium mt-0.5 hover:underline"
                            >
                              <Linkedin className="w-2.5 h-2.5" /> Live on LinkedIn ↗
                            </a>
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
                      <p className="text-sm text-[var(--foreground)]">{safeDate(post.created_at?.seconds)}</p>
                      <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />{safeTime(post.created_at?.seconds)}
                      </p>
                    </td>

                    {/* Published */}
                    <td className="px-5 py-4">
                      {post.status === "published" && post.published_at?.seconds ? (
                        <div>
                          <p className="text-sm text-emerald-400 font-medium">{safeDate(post.published_at.seconds)}</p>
                          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{timeAgo(post.published_at.seconds)}</p>
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)] text-sm">—</span>
                      )}
                    </td>

                    {/* Tone */}
                    <td className="px-5 py-4">
                      <span className="text-xs text-[var(--text-muted)] capitalize">{post.tone}</span>
                    </td>

                    {/* Action */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {post.status === "failed" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRetry(post); }}
                            disabled={retrying === post.id}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-200 text-red-400 text-[11px] font-semibold transition-all disabled:opacity-50"
                            title="Reset to scheduled and retry publishing"
                          >
                            <RefreshCw className={`w-3 h-3 ${retrying === post.id ? "animate-spin" : ""}`} />
                            {retrying === post.id ? "Retrying…" : "Retry"}
                          </button>
                        )}
                        {post.status === "published" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRepost(post); }}
                            disabled={reposting === post.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all disabled:opacity-50 ${
                              repostStatus[post.id!] === "success"
                                ? "bg-emerald-500/10 border-emerald-800/40 text-emerald-400"
                                : repostStatus[post.id!] === "error"
                                ? "bg-red-500/10 border-red-200 text-red-400"
                                : "bg-[var(--card-hover)] hover:bg-blue-500/10 border-[var(--border)] hover:border-[#0A66C2] text-[var(--text-muted)] hover:text-[var(--primary)]"
                            }`}
                            title="Repost this to LinkedIn now"
                          >
                            {reposting === post.id ? (
                              <><RefreshCw className="w-3 h-3 animate-spin" /> Posting…</>
                            ) : repostStatus[post.id!] === "success" ? (
                              repostIds[post.id!] ? (
                                <a
                                  href={`https://www.linkedin.com/feed/update/${repostIds[post.id!]}/`}
                                  target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1"
                                ><Send className="w-3 h-3" /> Posted! ↗</a>
                              ) : (
                                <><Send className="w-3 h-3" /> Posted!</>
                              )
                            ) : repostStatus[post.id!] === "error" ? (
                              <><AlertTriangle className="w-3 h-3" /> Failed</>
                            ) : (
                              <><Send className="w-3 h-3" /> Repost</>
                            )}
                          </button>
                        )}
                        {/* View detail hint */}
                        <div className="p-1.5 rounded-lg text-[var(--text-muted)] group-hover:text-[var(--text-muted)] transition-colors" title="Click row to view full details">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                        {/* Delete */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(post); }}
                          disabled={deleting === post.id}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-500 transition-all disabled:opacity-40"
                          title="Delete post"
                        >
                          {deleting === post.id
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* C2: Pagination controls */}
        {totalPages > 1 && !isLoading && (
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] text-[var(--text-muted)]">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} posts
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--card-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>
              <span className="text-xs text-[var(--text-muted)]">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--card-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Hint */}
        {filtered.length > 0 && !isLoading && (
          <p className="text-center text-[11px] text-[var(--text-muted)]">
            Click any row to see the full input, AI output, and image · Use ← → keys to navigate
          </p>
        )}
      </div>

      {/* Post Detail Modal */}
      {modalPost && (
        <PostDetailModal
          post={modalPost}
          posts={filtered}
          currentIndex={modalIndex}
          onNavigate={navigateModal}
          onClose={closeModal}
          onDelete={async (p) => { await handleDelete(p); }}
          onRetry={async (p) => { await handleRetry(p); }}
          onRepost={async (p) => { await handleRepost(p); }}
        />
      )}
    </>
  );
}
