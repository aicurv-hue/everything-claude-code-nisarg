"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Sparkles, Trash2, PenSquare, Archive, Filter } from "lucide-react";
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
  const [filter, setFilter] = useState<"all" | "active" | "ai_suggested" | "manual" | "used">("active");
  const [addTitle, setAddTitle] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const fetchIdeas = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/ideas?segment=${segment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setIdeas(data.ideas || []);
    } catch (err) {
      console.error("[ideas] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [user, segment]);

  useEffect(() => { fetchIdeas(); }, [fetchIdeas]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const token = await getAuthToken();
      await fetch("/api/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ segment, count: 10 }),
      });
      await fetchIdeas();
    } catch (err) {
      console.error("[ideas] generate failed", err);
    } finally {
      setGenerating(false);
    }
  }

  async function handleAdd() {
    if (!addTitle.trim()) return;
    const token = await getAuthToken();
    await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: addTitle.trim(), segment, source: "manual" }),
    });
    setAddTitle("");
    setShowAdd(false);
    await fetchIdeas();
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
    const params = new URLSearchParams({ idea: idea.id || "", title: idea.title });
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            Idea Bank
          </h1>
          <p className="text-sm text-gray-500 mt-1">Save and organize content ideas. Convert to posts with one click.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            + Add Idea
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-2 text-sm font-semibold bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {generating ? "Generating..." : "AI Suggestions"}
          </button>
        </div>
      </div>

      {/* Add idea inline */}
      {showAdd && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={addTitle}
            onChange={(e) => setAddTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Type your content idea..."
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30"
            autoFocus
          />
          <button onClick={handleAdd} className="px-4 py-2 text-sm font-semibold bg-[var(--primary)] text-white rounded-lg hover:opacity-90">
            Save
          </button>
          <button onClick={() => { setShowAdd(false); setAddTitle(""); }} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">
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
              filter === f ? "bg-[var(--primary)] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f === "active" ? "Active" : f === "all" ? "All" : f === "ai_suggested" ? "AI" : f === "manual" ? "Manual" : "Used"}
          </button>
        ))}
      </div>

      {/* Ideas grid */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading ideas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Lightbulb className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No ideas yet. Add one manually or get AI suggestions from your profile.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((idea) => (
            <div
              key={idea.id}
              className={`rounded-xl border p-4 transition-colors ${
                idea.status === "used" ? "border-gray-100 bg-gray-50 opacity-60" : "border-gray-200 bg-[var(--card)] hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 leading-snug">{idea.title}</h3>
                <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  idea.source === "ai_suggested" ? "bg-violet-500/20 text-violet-400" : "bg-gray-100 text-gray-600"
                }`}>
                  {idea.source === "ai_suggested" ? "AI" : "Manual"}
                </span>
              </div>

              {idea.description && (
                <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{idea.description}</p>
              )}

              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {idea.pillar && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{idea.pillar}</span>
                )}
                {idea.suggestedTone && (
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TONE_COLORS[idea.suggestedTone] || "bg-gray-100 text-gray-600"}`}>
                    {idea.suggestedTone}
                  </span>
                )}
              </div>

              {idea.status === "active" && (
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => handleUse(idea)}
                    className="flex-1 py-1.5 text-xs font-semibold bg-[var(--primary)] text-white rounded-lg hover:opacity-90 flex items-center justify-center gap-1 transition-colors"
                  >
                    <PenSquare className="w-3 h-3" />
                    Use This Idea
                  </button>
                  <button
                    onClick={() => idea.id && handleArchive(idea.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                    title="Archive"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => idea.id && handleDelete(idea.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {idea.status === "used" && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-[10px] text-gray-400">Used</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
