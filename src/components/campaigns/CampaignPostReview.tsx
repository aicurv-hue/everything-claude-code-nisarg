"use client";
import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface PostDraft {
  id: string;
  campaign_position: number;
  content: string;
}

interface Props {
  posts: PostDraft[];
  frequencyDays: number;
  startDate?: Date;
  onContentChange: (position: number, content: string) => void;
  onSave: (position: number) => Promise<void>;
  autoSavingPositions?: Set<number>;
  autoSavedPositions?: Set<number>;
}

export default function CampaignPostReview({ posts, frequencyDays, startDate, onContentChange, onSave, autoSavingPositions, autoSavedPositions }: Props) {
  const [expanded, setExpanded] = useState<number>(1);
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const handleSave = async (pos: number) => {
    setSaving(pos);
    await onSave(pos);
    setSaving(null);
    setSaved(prev => new Set(prev).add(pos));
    setTimeout(() => setSaved(prev => { const s = new Set(prev); s.delete(pos); return s; }), 2000);
  };

  const getPostDate = (position: number) => {
    if (!startDate) return null;
    const d = new Date(startDate.getTime() + (position - 1) * frequencyDays * 86400000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <div key={post.campaign_position} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
          <button
            onClick={() => setExpanded(expanded === post.campaign_position ? 0 : post.campaign_position)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--card-hover)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-[var(--primary)] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {post.campaign_position}
              </span>
              <div className="text-left">
                <p className="text-sm font-medium text-[var(--foreground)]">Post {post.campaign_position}</p>
                {getPostDate(post.campaign_position) && (
                  <p className="text-[11px] text-[var(--text-muted)]">Scheduled: {getPostDate(post.campaign_position)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!post.content && <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-200">Failed — needs regeneration</span>}
              {expanded === post.campaign_position ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
            </div>
          </button>

          {expanded === post.campaign_position && (
            <div className="border-t border-[var(--border-sub)] p-5 space-y-3">
              <textarea
                value={post.content}
                onChange={e => onContentChange(post.campaign_position, e.target.value)}
                rows={8}
                className="w-full bg-[var(--card-hover)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] resize-none leading-relaxed transition-all"
                placeholder="Post content..."
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[var(--text-muted)]">{post.content.length} characters · {post.content.split(/\s+/).filter(Boolean).length} words</span>
                <div className="flex items-center gap-2">
                  {(autoSavingPositions?.has(post.campaign_position)) && (
                    <span className="text-[10px] text-[var(--text-muted)] italic">Saving...</span>
                  )}
                  {(!autoSavingPositions?.has(post.campaign_position) && autoSavedPositions?.has(post.campaign_position)) && (
                    <span className="text-[10px] text-emerald-400 font-medium">✓ Saved</span>
                  )}
                  <button
                    onClick={() => handleSave(post.campaign_position)}
                    disabled={saving === post.campaign_position}
                    className="px-4 py-1.5 bg-[var(--primary)] text-white text-xs font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {saving === post.campaign_position ? "Saving..." : saved.has(post.campaign_position) ? "✓ Saved" : "Save Edits"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
