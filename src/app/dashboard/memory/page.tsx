"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import Link from "next/link";
import {
  Brain, RefreshCw, Zap, Tag, Clock, TrendingUp, FileText,
  Sparkles, Trash2, Plus, X, Upload, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { PostMemory } from "@/lib/db/memory";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";

const MAX_SAMPLES = 10;
const MIN_CHARS   = 50;

interface MemoryStats {
  totalMemories: number;
  uniqueTopics: number;
  topKeywords: { kw: string; count: number }[];
  toneBreakdown: Record<string, number>;
  oldest: Date | null;
  newest: Date | null;
}

function safeDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(seconds: number): string {
  const diff = Date.now() - seconds * 1000;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const TONE_BADGE: Record<string, string> = {
  professional: "bg-blue-500/10 text-blue-400 border-blue-800/40",
  storytelling: "bg-violet-500/10 text-violet-400 border-violet-800/40",
  educational:  "bg-emerald-500/10 text-emerald-400 border-emerald-800/40",
  contrarian:   "bg-orange-50 text-orange-700 border-orange-200",
};

const TONE_BAR: Record<string, string> = {
  professional: "bg-blue-500/100",
  storytelling: "bg-violet-500/100",
  educational:  "bg-emerald-500/100",
  contrarian:   "bg-orange-500",
};

export default function MemoryPage() {
  const { user }                               = useAuth();
  const { segment, isIndividual, isCorporate, segmentReady } = useSegment();

  // ── Data ─────────────────────────────────────────────────────────────────
  const [samples,  setSamples]  = useState<PostMemory[]>([]);   // user_upload
  const [memories, setMemories] = useState<PostMemory[]>([]);   // auto
  const [stats, setStats]       = useState<MemoryStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Delete state ──────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // C3: Undo delete — holds a pending delete for 5 seconds before committing
  const [pendingDelete, setPendingDelete] = useState<{ id: string; type: "auto" | "user_upload" | "user_url"; label: string } | null>(null);
  const pendingDeleteTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Upload modal state ────────────────────────────────────────────────────
  const [showModal,    setShowModal]    = useState(false);
  const [pastedText,   setPastedText]   = useState("");
  const [uploading,    setUploading]    = useState(false);
  const [uploadMsg,    setUploadMsg]    = useState<{ type: "success" | "error" | "warn"; text: string } | null>(null);

  // ── Accent colours ────────────────────────────────────────────────────────
  const accentColor  = isCorporate ? "text-violet-400"  : "text-[var(--primary)]";
  const accentBg     = isCorporate ? "bg-violet-500/10 border-violet-800/40"  : "bg-blue-500/10 border-blue-800/40";
  const accentBar    = isCorporate ? "bg-violet-500/100"  : "bg-[var(--primary)]";
  const accentBadge  = isCorporate ? "bg-violet-500/10 text-violet-400 border-violet-800/40" : "bg-blue-500/10 text-blue-400 border-blue-800/40";
  const accentBorder = isCorporate ? "border-l-violet-500" : "border-l-[#0A66C2]";

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (silent = false) => {
    if (!segmentReady) return;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) { setSamples([]); setMemories([]); return; }
      const res  = await fetch(`/api/memory?segment=${segment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const all: PostMemory[] = (data.entries || []).sort(
        (a: PostMemory, b: PostMemory) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0)
      );

      const uploads = all.filter((m) => m.source === "user_upload" || m.source === "user_url");
      const auto    = all.filter((m) => m.source !== "user_upload" && m.source !== "user_url");
      setSamples(uploads);
      setMemories(auto);

      // Stats computed from auto-saved entries only (samples have no tone/topic/audience)
      const allKeywords = auto.flatMap((m) => m.keywords);
      const keywordFreq: Record<string, number> = {};
      for (const kw of allKeywords) keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
      const topKeywords = Object.entries(keywordFreq)
        .sort((a, b) => b[1] - a[1]).slice(0, 15)
        .map(([kw, count]) => ({ kw, count }));
      const toneBreakdown: Record<string, number> = {};
      for (const m of auto) toneBreakdown[m.tone] = (toneBreakdown[m.tone] || 0) + 1;
      const uniqueTopics = [...new Set(auto.map((m) => m.topic))];
      setStats({
        totalMemories: auto.length,
        uniqueTopics:  uniqueTopics.length,
        topKeywords,
        toneBreakdown,
        oldest: auto[auto.length - 1]?.created_at?.seconds ? new Date(auto[auto.length - 1].created_at.seconds * 1000) : null,
        newest: auto[0]?.created_at?.seconds               ? new Date(auto[0].created_at.seconds * 1000)               : null,
      });
    } catch (err) {
      console.error("Failed to load memory:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [segment, user, segmentReady]);

  const commitDelete = async (id: string, sourceType: "auto" | "user_upload" | "user_url") => {
    setDeletingId(id);
    try {
      const token = await getAuthToken();
      if (token) {
        await fetch("/api/memory", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
      }
      if (sourceType === "user_upload" || sourceType === "user_url") {
        setSamples((prev) => prev.filter((m) => m.id !== id));
      } else {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch { /* silent */ }
    finally { setDeletingId(null); setPendingDelete(null); }
  };

  // C3: Show undo toast, then commit after 5s
  const handleDelete = (id: string, sourceType: "auto" | "user_upload" | "user_url") => {
    const label = sourceType === "user_upload" ? "writing sample" : "memory entry";
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    setPendingDelete({ id, type: sourceType, label });
    pendingDeleteTimer.current = setTimeout(() => {
      commitDelete(id, sourceType);
    }, 5000);
  };

  const handleUndoDelete = () => {
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    setPendingDelete(null);
  };

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleUpload = async () => {
    const text = pastedText.trim();
    if (text.length < MIN_CHARS) {
      setUploadMsg({ type: "error", text: `Post must be at least ${MIN_CHARS} characters.` });
      return;
    }
    if (samples.length >= MAX_SAMPLES) {
      setUploadMsg({ type: "warn", text: `You already have ${MAX_SAMPLES} writing samples. Delete one before adding more.` });
      return;
    }

    setUploading(true);
    setUploadMsg(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res  = await fetch("/api/memory/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ posts: [text], segment }),
      });
      const data = await res.json();

      if (res.status === 409) {
        setUploadMsg({ type: "warn", text: data.error || "Sample limit reached. Delete one to add more." });
        return;
      }
      if (!res.ok || data.saved === 0) {
        setUploadMsg({ type: "error", text: "Could not analyse this post. Make sure it is a real LinkedIn post (50+ characters)." });
        return;
      }

      // Add the newly saved entry to local state immediately
      if (data.entries?.length > 0) {
        setSamples((prev) => [data.entries[0], ...prev]);
      }
      setUploadMsg({ type: "success", text: "Writing sample added! Cortex will use it from your next post." });
      setPastedText("");
      setTimeout(() => { setShowModal(false); setUploadMsg(null); }, 2000);
    } catch (err: any) {
      setUploadMsg({ type: "error", text: err?.message || "Upload failed. Please try again." });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => { load(); }, [load]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
          <Brain className="w-8 h-8 animate-pulse" />
          <p className="text-sm">Loading memory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in">

      {/* C3: Undo delete toast */}
      {pendingDelete && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-2xl text-sm font-medium animate-fade-in">
          <span>Removed {pendingDelete.label}</span>
          <button
            onClick={handleUndoDelete}
            className="px-3 py-1 rounded-lg bg-[var(--card)]/10 hover:bg-[var(--card)]/20 text-white text-xs font-semibold transition-all"
          >
            Undo
          </button>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Memory Bank</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {isIndividual ? "Personal" : "Corporate"} · What Cortex knows about your writing voice and past content
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="w-8 h-8 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--card-hover)] transition-all disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--text-muted)] ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <Link
            href="/dashboard/create"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-medium transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Post
          </Link>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1 — WRITING SAMPLES                                       */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${accentColor}`} />
              Writing Samples
              <span className="text-xs font-normal text-[var(--text-muted)] ml-1">
                ({samples.length} / {MAX_SAMPLES})
              </span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Paste real posts you wrote before using Cridl. Cortex uses these as your voice bible — making every post sound unmistakably like you.
            </p>
          </div>
          <button
            onClick={() => {
              if (samples.length >= MAX_SAMPLES) return;
              setPastedText("");
              setUploadMsg(null);
              setShowModal(true);
            }}
            disabled={samples.length >= MAX_SAMPLES}
            title={samples.length >= MAX_SAMPLES ? `Delete a sample to add more (max ${MAX_SAMPLES})` : "Add a writing sample"}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all
              ${samples.length >= MAX_SAMPLES
                ? "bg-[var(--toggle-bg)] text-[var(--text-muted)] border-[var(--border)] cursor-not-allowed"
                : `${accentBg} ${accentColor} hover:opacity-80`
              }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Sample
          </button>
        </div>

        {/* Cap warning */}
        {samples.length >= MAX_SAMPLES && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              You have reached the maximum of {MAX_SAMPLES} writing samples. Delete one to add a new post.
            </p>
          </div>
        )}

        {samples.length === 0 ? (
          <div className={`card p-8 text-center border-2 border-dashed ${isCorporate ? "border-violet-800/40" : "border-blue-800/40"}`}>
            <Sparkles className={`w-8 h-8 mx-auto mb-3 ${isCorporate ? "text-violet-300" : "text-blue-300"}`} />
            <p className="text-sm font-semibold text-[var(--foreground)] mb-1">No writing samples yet</p>
            <p className="text-xs text-[var(--text-muted)] mb-4 max-w-sm mx-auto leading-relaxed">
              Paste 3–5 of your best past LinkedIn posts. Cortex will analyse your sentence rhythm, vocabulary, and style to write posts that sound exactly like you.
            </p>
            <button
              onClick={() => { setPastedText(""); setUploadMsg(null); setShowModal(true); }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${accentBg} ${accentColor}`}
            >
              <Plus className="w-3.5 h-3.5" /> Add Your First Sample
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {samples.map((s, idx) => (
              <div key={s.id} className="card p-4 group relative hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${accentBg} ${accentColor}`}>
                      {idx + 1}
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-sub)]">Writing Sample</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {s.created_at?.seconds ? timeAgo(s.created_at.seconds) : "—"}
                    </span>
                    {s.id && (
                      <button
                        onClick={() => handleDelete(s.id!, s.source === "user_url" ? "user_url" : "user_upload")}
                        disabled={deletingId === s.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md hover:bg-red-500/10 flex items-center justify-center disabled:opacity-40"
                        title="Remove this writing sample"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Raw content preview */}
                {s.raw_content && (
                  <p className="text-xs text-[var(--text-sub)] leading-relaxed mb-3 line-clamp-3 italic">
                    "{s.raw_content.slice(0, 180)}{s.raw_content.length > 180 ? "…" : ""}"
                  </p>
                )}

                {/* Extracted data */}
                <div className="space-y-2">
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    <span className="font-medium text-[var(--foreground)]">Summary: </span>{s.summary}
                  </p>
                  {s.style_notes && (
                    <p className="text-[11px] text-[var(--text-muted)] italic">
                      <span className="font-medium not-italic text-[var(--text-muted)]">Voice: </span>{s.style_notes}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {s.keywords.slice(0, 6).map((kw) => (
                      <span key={kw} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${accentBadge}`}>
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2 — AUTO-SAVED HISTORY                                    */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)] flex items-center gap-2">
            <Brain className={`w-4 h-4 ${accentColor}`} />
            Auto-saved from Published Posts
            <span className="text-xs font-normal text-[var(--text-muted)] ml-1">({memories.length})</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Automatically built from every post that went live via Cridl. Cortex reads these to avoid repeating the same angles.
          </p>
        </div>

        {memories.length === 0 ? (
          <div className="card p-10 text-center border-2 border-dashed border-[var(--border)]">
            <Brain className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm font-semibold text-[var(--foreground)] mb-2">No published posts yet</p>
            <p className="text-xs text-[var(--text-muted)] mb-5 max-w-sm mx-auto">
              Publish your first post and Cortex will automatically save the topic, angle, and style fingerprint here.
            </p>
            <Link
              href="/dashboard/create"
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${accentBg} ${accentColor}`}
            >
              <Zap className="w-3.5 h-3.5" /> Generate First Post →
            </Link>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Posts in Memory", value: stats?.totalMemories ?? 0,         icon: Brain,    color: accentColor,      bg: accentBg.split(" ")[0] },
                { label: "Unique Topics",   value: stats?.uniqueTopics ?? 0,           icon: FileText, color: "text-blue-400",  bg: "bg-blue-500/10" },
                { label: "Top Keywords",    value: stats?.topKeywords.length ?? 0,     icon: Tag,      color: "text-emerald-400", bg: "bg-emerald-500/10" },
                { label: "Memory Since",    value: safeDate(stats?.oldest ?? null),    icon: Clock,    color: "text-[var(--text-muted)]", bg: "bg-[var(--toggle-bg)]", isDate: true },
              ].map((card) => (
                <div key={card.label} className="card p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--text-muted)] font-medium">{card.label}</p>
                    <p className={`font-bold mt-0.5 ${card.isDate ? "text-sm text-[var(--foreground)]" : "text-xl text-[var(--foreground)]"}`}>
                      {card.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Analytics panels */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Keyword frequency */}
              <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                    <Tag className={`w-3.5 h-3.5 ${accentColor}`} /> Top Keywords
                  </h3>
                  <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide font-medium">by frequency</span>
                </div>
                <div className="space-y-3">
                  {stats?.topKeywords.map(({ kw, count }, i) => (
                    <div key={kw}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--foreground)] font-medium capitalize">{kw}</span>
                        <span className="text-[var(--text-muted)]">{count}×</span>
                      </div>
                      <div className="h-1.5 w-full bg-[var(--toggle-bg)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${accentBar}`}
                          style={{ width: `${Math.round((count / (stats.topKeywords[0]?.count || 1)) * 100)}%`, opacity: 1 - i * 0.06 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tone breakdown */}
              <div className="card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <TrendingUp className={`w-3.5 h-3.5 ${accentColor}`} /> Tone Distribution
                </h3>
                <div className="space-y-3">
                  {stats && Object.entries(stats.toneBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([tone, count]) => {
                      const pct = Math.round((count / stats.totalMemories) * 100);
                      return (
                        <div key={tone}>
                          <div className="flex justify-between items-center mb-1">
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${TONE_BADGE[tone] || "bg-[var(--card-hover)] text-[var(--text-sub)] border-[var(--border)]"}`}>
                              {tone}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">{count} · {pct}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-[var(--toggle-bg)] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${TONE_BAR[tone] || "bg-slate-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* How memory works */}
              <div className={`card p-5 border-l-4 ${accentBorder} space-y-4`}>
                <h3 className={`text-sm font-semibold flex items-center gap-2 ${accentColor}`}>
                  <Brain className="w-3.5 h-3.5" /> How Cortex Uses This
                </h3>
                <div className="space-y-3">
                  {[
                    "Before writing, Cortex retrieves your 5 most relevant past entries based on your topic.",
                    "He reads the summaries AND your writing style to understand what has been covered and how you write.",
                    "He decides: deepen the same thread, or take a fresh dimension — always sounding like you.",
                    "He never invents personal facts. Only what's in your profile or the research is used.",
                    "After writing, he stores the angle, keywords, and your style fingerprint for next time.",
                  ].map((text, i) => (
                    <div key={i} className="flex gap-3">
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${accentBg}`}>
                        <span className={`text-[9px] font-bold ${accentColor}`}>{i + 1}</span>
                      </div>
                      <p className="text-xs text-[var(--text-sub)] leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Memory entries table */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--border-sub)] flex items-center justify-between bg-[var(--card-hover)]">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Auto-saved Entries</h3>
                <span className="text-[11px] text-[var(--text-muted)] font-medium">{memories.length} total · newest first</span>
              </div>
              <div className="divide-y divide-[var(--border-sub)]">
                {memories.map((m) => (
                  <div key={m.id} className="px-5 py-4 hover:bg-[var(--card-hover)] transition-colors group">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-sm font-medium text-[var(--foreground)] truncate max-w-sm">{m.topic}</span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${TONE_BADGE[m.tone] || "bg-[var(--card-hover)] text-[var(--text-muted)] border-[var(--border)]"}`}>
                            {m.tone}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] bg-[var(--toggle-bg)] px-2 py-0.5 rounded">
                            {m.audience}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--text-sub)] leading-relaxed mb-1.5">{m.summary}</p>
                        {m.style_notes && (
                          <p className="text-[11px] text-[var(--text-muted)] italic leading-relaxed mb-2">
                            Style: {m.style_notes}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                          {m.keywords.map((kw) => (
                            <span key={kw} className={`text-[11px] font-medium px-2 py-0.5 rounded border ${accentBadge}`}>
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {m.created_at?.seconds ? timeAgo(m.created_at.seconds) : "—"}
                        </p>
                        {m.id && (
                          <button
                            onClick={() => handleDelete(m.id!, "auto")}
                            disabled={deletingId === m.id}
                            className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md hover:bg-red-500/10 flex items-center justify-center disabled:opacity-40"
                            title="Remove this memory entry"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Upload Modal ──────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">

            {/* Modal header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--foreground)]">Add Writing Sample</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Paste a real LinkedIn post you wrote. Cortex will learn your voice, rhythm, and style.
                </p>
              </div>
              <button
                onClick={() => { setShowModal(false); setUploadMsg(null); }}
                className="w-7 h-7 rounded-lg hover:bg-[var(--toggle-bg)] flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
            </div>

            {/* Slot indicator */}
            <div className="flex items-center gap-2">
              {Array.from({ length: MAX_SAMPLES }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all ${i < samples.length ? accentBar : "bg-[var(--border)]"}`}
                />
              ))}
              <span className="text-[10px] text-[var(--text-muted)] shrink-0 ml-1">{samples.length}/{MAX_SAMPLES}</span>
            </div>

            {/* How to get your post text */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[var(--card-hover)] border border-[var(--border)] text-xs text-[var(--text-sub)] leading-relaxed">
              <span className="text-base leading-none mt-0.5">💡</span>
              <div className="space-y-1">
                <p className="font-semibold text-[var(--foreground)]">How to copy a LinkedIn post</p>
                <ol className="list-decimal list-inside space-y-0.5 text-[var(--text-muted)]">
                  <li>Open LinkedIn and find a post you wrote</li>
                  <li>Click <strong>…more</strong> to expand the full text</li>
                  <li>Select all the text and copy it (Ctrl+A / Cmd+A won&apos;t work — select manually)</li>
                  <li>Paste it in the box below</li>
                </ol>
                <p className="text-[var(--text-muted)] pt-0.5">Tip: add 3–5 of your top-performing posts for best results.</p>
              </div>
            </div>

            {/* Paste area */}
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide block mb-2">
                Paste your post
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste a LinkedIn post you wrote here. The more authentic the better — this teaches Cortex exactly how you write..."
                rows={8}
                className="w-full text-sm border border-[var(--border)] rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-800/40 text-[var(--foreground)] leading-relaxed placeholder:text-[var(--text-muted)]"
              />
              <div className="flex justify-between mt-1">
                <span className={`text-[10px] ${pastedText.trim().length < MIN_CHARS ? "text-amber-500" : "text-[var(--text-muted)]"}`}>
                  {pastedText.trim().length} characters {pastedText.trim().length < MIN_CHARS ? `(min ${MIN_CHARS})` : "✓"}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">Min {MIN_CHARS} characters required</span>
              </div>
            </div>

            {/* Status message */}
            {uploadMsg && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
                uploadMsg.type === "success" ? "bg-emerald-500/10 border border-emerald-800/40 text-green-800" :
                uploadMsg.type === "warn"    ? "bg-amber-500/10 border border-amber-200 text-amber-800" :
                                              "bg-red-500/10 border border-red-200 text-red-800"
              }`}>
                {uploadMsg.type === "success"
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                {uploadMsg.text}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowModal(false); setUploadMsg(null); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--card-hover)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || pastedText.trim().length < MIN_CHARS}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed
                  ${isCorporate ? "bg-violet-600 hover:bg-violet-700" : "bg-[var(--primary)] hover:opacity-90"}`}
              >
                {uploading ? (
                  <>
                    <Brain className="w-3.5 h-3.5 animate-pulse" />
                    Analysing your writing...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Add Sample
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
