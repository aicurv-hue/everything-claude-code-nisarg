"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth";
import { useSegment } from "@/lib/context/segment";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { useRouter } from "next/navigation";
import { Rocket, Plus, Trash2, ChevronRight } from "lucide-react";
import type { Campaign } from "@/lib/db/campaigns";

const STATUS_CONFIG = {
  draft:     { label: "Draft",     color: "bg-[var(--toggle-bg)] text-[var(--text-sub)] border-[var(--border)]" },
  active:    { label: "Active",    color: "bg-emerald-500/10 text-emerald-400 border-emerald-800/40" },
  paused:    { label: "Paused",    color: "bg-amber-500/10 text-amber-400 border-amber-200" },
  completed: { label: "Completed", color: "bg-blue-500/10 text-blue-400 border-blue-800/40" },
};

export default function CampaignsPage() {
  const { user } = useAuth();
  const { segment, segmentReady } = useSegment();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    if (!user || !segmentReady) return;
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/campaigns?segment=${segment}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user, segment, segmentReady]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this campaign and all its posts?")) return;
    setDeleting(id);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { alert("Failed to delete campaign. Please try again."); return; }
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch { alert("Failed to delete campaign. Please try again."); }
    finally { setDeleting(null); }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div className="h-8 w-40 skeleton rounded-lg" />
          <div className="h-10 w-36 skeleton rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-40 skeleton rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Campaigns</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Multi-post drip sequences for your LinkedIn strategy</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/campaigns/new")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Campaign
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
            <Rocket className="w-8 h-8 text-[var(--primary)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">No campaigns yet</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6 max-w-sm mx-auto">
            Create your first campaign — a series of LinkedIn posts all focused on one topic, automatically scheduled over time.
          </p>
          <button
            onClick={() => router.push("/dashboard/campaigns/new")}
            className="px-6 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90 transition-all"
          >
            Create Your First Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(c => {
            const st = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
            return (
              <div
                key={c.id}
                onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                className="card p-5 cursor-pointer hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                  <button
                    onClick={e => handleDelete(c.id!, e)}
                    disabled={deleting === c.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--text-muted)] hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h3 className="font-semibold text-[var(--foreground)] text-sm mb-1 line-clamp-1">{c.name}</h3>
                <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-4 leading-relaxed">{c.topic}</p>
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>{c.post_count} posts · every {c.frequency_days}d</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
