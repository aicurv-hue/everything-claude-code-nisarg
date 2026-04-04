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
}

export default function CampaignPostReview({ posts, frequencyDays, startDate, onContentChange, onSave }: Props) {
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
        <div key={post.campaign_position} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => setExpanded(expanded === post.campaign_position ? 0 : post.campaign_position)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0A66C2] text-white text-xs font-bold flex items-center justify-center shrink-0">
                {post.campaign_position}
              </span>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-800">Post {post.campaign_position}</p>
                {getPostDate(post.campaign_position) && (
                  <p className="text-[11px] text-slate-400">Scheduled: {getPostDate(post.campaign_position)}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!post.content && <span className="text-[10px] text-red-500 font-medium bg-red-50 px-2 py-0.5 rounded-full border border-red-200">Failed — needs regeneration</span>}
              {expanded === post.campaign_position ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>
          </button>

          {expanded === post.campaign_position && (
            <div className="border-t border-slate-100 p-5 space-y-3">
              <textarea
                value={post.content}
                onChange={e => onContentChange(post.campaign_position, e.target.value)}
                rows={8}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] resize-none leading-relaxed transition-all"
                placeholder="Post content..."
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">{post.content.length} characters · {post.content.split(/\s+/).filter(Boolean).length} words</span>
                <button
                  onClick={() => handleSave(post.campaign_position)}
                  disabled={saving === post.campaign_position}
                  className="px-4 py-1.5 bg-[#0A66C2] text-white text-xs font-medium rounded-lg hover:bg-[#0854a0] transition-all disabled:opacity-50"
                >
                  {saving === post.campaign_position ? "Saving..." : saved.has(post.campaign_position) ? "✓ Saved" : "Save Edits"}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
