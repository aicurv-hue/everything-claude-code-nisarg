"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Sparkles, Trash2, PenSquare, Archive } from "lucide-react";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface Idea {
  id?: string;
  title: string;
  description?: string;
  pillar?: string;
  suggestedTone?: string;
  suggestedAudience?: string;
  source: "manual" | "ai_suggested";
  status: "active" | "used" | "archived";
}

const TONE_COLORS: Record<string, string> = {
  professional: "bg-blue-500/20 text-blue-400",
  storytelling: "bg-amber-500/20 text-amber-400",
  educational: "bg-emerald-500/20 text-emerald-400",
  contrarian: "bg-red-500/20 text-red-400",
};

export default function IdeaBankPage() {
  const { segment } = useSegment();
  const { user } = useAuth();
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "ai_suggested" | "manual" | "used">("active");
  const [addTitle, setAddTitle] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchIdeas = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getAuthToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch(`/api/ideas?segment=${segment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIdeas(data.ideas || []);
    } catch (err) {
      console.error("[ideas] fetch failed", err);
      setError("Failed to load ideas. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [user, segment]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ segment, count: 10 }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as any).error || `HTTP ${res.status}`);
      }
      await fetchIdeas();
    } catch (err: any) {
      console.error("[ideas] generate failed", err);
      setError(err.message || "AI generation failed. Make sure your profile is filled in.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdd() {
    if (!addTitle.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: addTitle.trim(), segment, source: "manual" }),
      });
      if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
      setAddTitle("");
      setShowAdd(false);
      await fetchIdeas();
    } catch (err: any) {
      console.error("[ideas] add failed", err);
      setError(err.message || "Failed to save idea.");
    } finally {
      setAdding(false);
    }
  }

  async function handleUse(idea: Idea) {
    if (idea.id) {
      const token = await getAuthToken();
      await fetch("/api/ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: idea.id, status: "used" }),
      });
    }
    const fullTopic = idea.description ? `${idea.title}\n${idea.description}` : idea.title;
    const params = new URLSearchParams({ idea: idea.id || "", title: fullTopic });
    if (idea.suggestedTone) params.set("tone", idea.suggestedTone);
    if (idea.suggestedAudience) params.set("audience", idea.suggestedAudience);
    router.push(`/dashboard/create?${params.toString()}`);
  }

  async function handleArchive(id: string) {
    const token = await getAuthToken();
    await fetch("/api/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status: "archived" }),
    });
    await fetchIdeas();
  }

  async function handleDelete(id: string) {
    const token = await getAuthToken();
    await fetch(`/api/ideas?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchIdeas();
  }

  const filtered = ideas.filter((i) => {
    if (filter === "all") return true;
    if (filter === "active") return i.status === "active";
    if (filter === "used") return i.status === "used";
    if (filter === "ai_suggested") return i.source === "ai_suggested" && i.status === "active";
    if (filter === "manual") return i.source === "manual" && i.status === "active";
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--foreground)] flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            Idea Bank
          </h1>
          <p className="text-[13px] text-[var(--text-muted)] mt-1">Save and organize content ideas. Convert to posts with one click.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-2 text-[13px] font-medium border border-[var(--border)] rounded-lg bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors"
          >
            + Add Idea
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-2 text-[13px] font-semibold bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? "Generating..." : "AI Suggestions"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-800/40 text-red-400 text-sm">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="font-bold hover:opacity-70">×</button>
        </div>
      )}

      {/* Add idea inline */}
      {showAdd && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !adding && handleAdd()}
            placeholder="Type your content idea..."
            className="flex-1 px-3 py-2 text-sm bg-[var(--input)] border border-[var(--input-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={adding || !addTitle.trim()}
            className="px-4 py-2 text-sm font-semibold bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {adding ? "Saving..." : "Save"}
          </button>
          <button onClick={() => { setShowAdd(false); setAddTitle(""); setError(null); }} className="px-3 py-2 text-sm text-[var(--text-sub)] hover:text-[var(--foreground)]">
            Cancel
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 mb-4">
        {(["active", "all", "ai_suggested", "manual", "used"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === f ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] text-[var(--text-sub)] border border-[var(--border)] hover:bg-[var(--card-hover)]"
            }`}
          >
            {f === "active" ? "Active" : f === "all" ? "All" : f === "ai_suggested" ? "AI" : f === "manual" ? "Manual" : "Used"}
          </button>
        ))}
      </div>

      {/* Ideas grid */}
      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading ideas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Lightbulb className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[var(--text-sub)] text-sm">No ideas yet. Add one manually or get AI suggestions from your profile.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((idea) => (
            <div
              key={idea.id}
              className={`card p-4 transition-colors ${
                idea.status === "used" ? "opacity-50" : "hover:bg-[var(--card-hover)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--foreground)] leading-snug">{idea.title}</h3>
                <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  idea.source === "ai_suggested" ? "bg-violet-500/20 text-violet-400" : "bg-[var(--border)] text-[var(--text-sub)]"
                }`}>
                  {idea.source === "ai_suggested" ? "AI" : "Manual"}
                </span>
              </div>

              {idea.description && (
                <div className="mt-1.5">
                  <p className={`text-xs text-[var(--text-sub)] ${idea.id && expandedIds.has(idea.id) ? "" : "line-clamp-2"}`}>{idea.description}</p>
                  {idea.description.length > 100 && (
                    <button
                      onClick={() => {
                        if (!idea.id) return;
                        setExpandedIds((prev) => {
                          const next = new Set(prev);
                          next.has(idea.id!) ? next.delete(idea.id!) : next.add(idea.id!);
                          return next;
                        });
                      }}
                      className="text-[10px] text-[var(--primary)] hover:underline mt-0.5"
                    >
                      {idea.id && expandedIds.has(idea.id) ? "Show less" : "View more"}
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {idea.pillar && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400">{idea.pillar}</span>
                )}
                {idea.suggestedTone && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TONE_COLORS[idea.suggestedTone] || "bg-[var(--border)] text-[var(--text-sub)]"}`}>
                    {idea.suggestedTone}
                  </span>
                )}
              </div>

              {idea.status === "active" && (
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-[var(--border)]">
                  <button
                    onClick={() => handleUse(idea)}
                    className="flex-1 py-1.5 text-xs font-semibold bg-[var(--primary)] text-white rounded-lg hover:opacity-90 flex items-center justify-center gap-1 transition-colors"
                  >
                    <PenSquare className="w-3 h-3" />
                    Use This Idea
                  </button>
                  <button
                    onClick={() => idea.id && handleArchive(idea.id)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-sub)] rounded-lg hover:bg-[var(--border)]/50 transition-colors"
                    title="Archive"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => idea.id && handleDelete(idea.id)}
                    className="p-1.5 text-[var(--text-muted)] hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {idea.status === "used" && (
                <div className="mt-3 pt-3 border-t border-[var(--border)]">
                  <span className="text-[10px] text-[var(--text-muted)]">Used</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
