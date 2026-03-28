"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import Link from "next/link";
import { Brain, RefreshCw, Zap, Tag, Clock, TrendingUp, FileText, Sparkles, Trash2 } from "lucide-react";
import { PostMemory } from "@/lib/db/memory";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";

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
  professional: "bg-blue-50 text-blue-700 border-blue-200",
  storytelling: "bg-violet-50 text-violet-700 border-violet-200",
  educational:  "bg-green-50 text-green-700 border-green-200",
  contrarian:   "bg-orange-50 text-orange-700 border-orange-200",
};

const TONE_BAR: Record<string, string> = {
  professional: "bg-blue-500",
  storytelling: "bg-violet-500",
  educational:  "bg-green-500",
  contrarian:   "bg-orange-500",
};

export default function MemoryPage() {
  const { user } = useAuth();
  const { segment, isIndividual, isCorporate } = useSegment();
  const [memories, setMemories] = useState<PostMemory[]>([]);
  const [stats, setStats]       = useState<MemoryStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const accentColor = isCorporate ? "text-violet-600" : "text-[#0A66C2]";
  const accentBg    = isCorporate ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200";
  const accentBar   = isCorporate ? "bg-violet-500" : "bg-[#0A66C2]";
  const accentBadge = isCorporate ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await getAuthToken();
      if (!token) { setMemories([]); return; }
      const res = await fetch(`/api/memory?segment=${segment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const mems: PostMemory[] = (data.entries || []).sort(
        (a: PostMemory, b: PostMemory) =>
          (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0)
      );
      setMemories(mems);

      // Compute stats client-side from the fetched entries
      const allKeywords = mems.flatMap((m) => m.keywords);
      const keywordFreq: Record<string, number> = {};
      for (const kw of allKeywords) keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
      const topKeywords = Object.entries(keywordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([kw, count]) => ({ kw, count }));

      const toneBreakdown: Record<string, number> = {};
      for (const m of mems) toneBreakdown[m.tone] = (toneBreakdown[m.tone] || 0) + 1;

      const uniqueTopics = [...new Set(mems.map((m) => m.topic))];

      setStats({
        totalMemories: mems.length,
        uniqueTopics: uniqueTopics.length,
        topKeywords,
        toneBreakdown,
        oldest: mems[mems.length - 1]?.created_at?.seconds ? new Date(mems[mems.length - 1].created_at.seconds * 1000) : null,
        newest: mems[0]?.created_at?.seconds ? new Date(mems[0].created_at.seconds * 1000) : null,
      });
    } catch (err) {
      console.error("Failed to load memory:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [segment, user]);

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this memory entry? Neel will no longer reference it.")) return;
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
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // silent
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Memory Bank</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isIndividual ? "Personal" : "Corporate"} · What Neel remembers about your past content
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
            href="/dashboard/create"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-medium transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Post
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Brain className="w-8 h-8 animate-pulse" />
            <p className="text-sm">Loading memory...</p>
          </div>
        </div>
      ) : memories.length === 0 ? (
        <div className="card p-14 text-center border-2 border-dashed border-slate-200">
          <Brain className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-base font-semibold text-slate-700 mb-2">Memory is empty</p>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Generate your first post and Neel will automatically remember the topic, angle, and keywords — making every future post smarter.
          </p>
          <Link
            href="/dashboard/create"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${accentBg} ${accentColor}`}
          >
            <Zap className="w-4 h-4" /> Generate First Post →
          </Link>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Posts in Memory", value: stats?.totalMemories ?? 0, icon: Brain, color: accentColor, bg: accentBg.split(' ')[0] },
              { label: "Unique Topics",   value: stats?.uniqueTopics ?? 0,  icon: FileText, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Top Keywords",    value: stats?.topKeywords.length ?? 0, icon: Tag, color: "text-green-600", bg: "bg-green-50" },
              { label: "Memory Since",    value: safeDate(stats?.oldest ?? null), icon: Clock, color: "text-slate-500", bg: "bg-slate-100", isDate: true },
            ].map((card) => (
              <div key={card.label} className="card p-4 flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                  <card.icon className={`w-4.5 h-4.5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium">{card.label}</p>
                  <p className={`font-bold mt-0.5 ${card.isDate ? "text-sm text-slate-700" : "text-xl text-slate-900"}`}>
                    {card.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Keyword frequency */}
            <div className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Tag className={`w-3.5 h-3.5 ${accentColor}`} /> Top Keywords
                </h3>
                <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">by frequency</span>
              </div>
              <div className="space-y-3">
                {stats?.topKeywords.map(({ kw, count }, i) => (
                  <div key={kw}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-700 font-medium capitalize">{kw}</span>
                      <span className="text-slate-400">{count}×</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${accentBar}`}
                        style={{ width: `${Math.round((count / (stats.topKeywords[0]?.count || 1)) * 100)}%`, opacity: 1 - i * 0.06 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tone breakdown */}
            <div className="card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
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
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${TONE_BADGE[tone] || "bg-slate-50 text-slate-600 border-slate-200"}`}>
                            {tone}
                          </span>
                          <span className="text-xs text-slate-400">{count} · {pct}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
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
            <div className={`card p-5 border-l-4 ${isCorporate ? "border-l-violet-500" : "border-l-[#0A66C2]"} space-y-4`}>
              <h3 className={`text-sm font-semibold flex items-center gap-2 ${accentColor}`}>
                <Brain className="w-3.5 h-3.5" /> How Neel Uses This
              </h3>
              <div className="space-y-3">
                {[
                  "Before writing, Neel retrieves the 5 most relevant past entries based on your topic.",
                  "He reads the summaries AND your writing style to understand what has been covered and how you write.",
                  "He decides: deepen the same thread, or take a fresh dimension — always sounding like you.",
                  "He never invents personal facts. Only what's in your profile or the research is used.",
                  "After writing, he stores the angle, keywords, and your style fingerprint for next time.",
                ].map((text, i) => (
                  <div key={i} className="flex gap-3">
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${accentBg}`}>
                      <span className={`text-[9px] font-bold ${accentColor}`}>{i + 1}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Memory entries table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-800">Memory Entries</h3>
              <span className="text-[11px] text-slate-400 font-medium">{memories.length} total · newest first</span>
            </div>
            <div className="divide-y divide-slate-50">
              {memories.map((m) => (
                <div key={m.id} className="px-5 py-4 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-sm font-medium text-slate-800 truncate max-w-sm">
                          {m.topic}
                        </span>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded border capitalize ${TONE_BADGE[m.tone] || "bg-slate-50 text-slate-500 border-slate-200"}`}>
                          {m.tone}
                        </span>
                        <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                          {m.audience}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed mb-1.5">{m.summary}</p>
                      {m.style_notes && (
                        <p className="text-[11px] text-slate-400 italic leading-relaxed mb-2">
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
                      <p className="text-[11px] text-slate-400">
                        {m.created_at?.seconds ? timeAgo(m.created_at.seconds) : "—"}
                      </p>
                      {m.id && (
                        <button
                          onClick={() => handleDelete(m.id!)}
                          disabled={deletingId === m.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md hover:bg-red-50 flex items-center justify-center disabled:opacity-40"
                          title="Remove this memory"
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
  );
}
