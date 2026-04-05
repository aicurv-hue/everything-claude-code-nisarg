"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { ArrowLeft, Pause, Play, Trash2, Zap } from "lucide-react";
import CampaignTimeline from "@/components/campaigns/CampaignTimeline";
import CampaignPostDrawer from "@/components/campaigns/CampaignPostDrawer";
import type { Campaign } from "@/lib/db/campaigns";

export default function CampaignDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any | null>(null);

  // Activate modal state
  const [showActivateModal, setShowActivateModal] = useState(false);
  const [activateDate, setActivateDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/campaigns/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (res.ok) {
        setCampaign(data.campaign);
        setPosts(data.posts || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user, id]);

  const handlePauseResume = async () => {
    if (!campaign) return;
    setActionLoading(true);
    try {
      const token = await getAuthToken();
      const newStatus = campaign.status === "active" ? "paused" : "active";
      const res = await fetch("/api/campaigns", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) { alert("Failed to update campaign status. Please try again."); return; }
      setCampaign(prev => prev ? { ...prev, status: newStatus } : prev);
    } catch { alert("Failed to update campaign status. Please try again."); }
    finally { setActionLoading(false); }
  };

  const handlePostSaved = (postId: string, updates: Record<string, any>) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p));
    setSelectedPost(null);
  };

  const handleActivate = async () => {
    if (!campaign) return;
    setActivating(true);
    setActivateError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/campaigns/${id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ start_date: new Date(activateDate).toISOString(), timezone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || "Activation failed");
      setCampaign(prev => prev ? { ...prev, status: "active" } : prev);
      setShowActivateModal(false);
    } catch (err: any) {
      setActivateError(err.message || "Activation failed. Try again.");
    } finally {
      setActivating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this campaign and all its posts?")) return;
    setActionLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/campaigns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) { alert("Failed to delete campaign. Please try again."); return; }
      router.push("/dashboard/campaigns");
    } catch { alert("Failed to delete campaign. Please try again."); }
    finally { setActionLoading(false); }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="h-8 w-48 skeleton rounded-lg mb-4" />
        <div className="h-64 skeleton rounded-xl" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <p className="text-slate-500">Campaign not found.</p>
        <button onClick={() => router.push("/dashboard/campaigns")} className="mt-4 text-sm text-[#0A66C2] hover:underline">&larr; Back to Campaigns</button>
      </div>
    );
  }

  const published = posts.filter(p => p.status === "published").length;
  const scheduled = posts.filter(p => p.status === "scheduled").length;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.push("/dashboard/campaigns")} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors mt-0.5">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">{campaign.name}</h1>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{campaign.topic}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {campaign.status === "draft" && (
            <button
              onClick={() => setShowActivateModal(true)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 bg-green-50 text-xs font-medium text-green-700 hover:bg-green-100 transition-all"
            >
              <Zap className="w-3.5 h-3.5" /> Activate Campaign
            </button>
          )}
          {(campaign.status === "active" || campaign.status === "paused") && (
            <button
              onClick={handlePauseResume}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-all"
            >
              {campaign.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Resume</>}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-600 hover:bg-red-100 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Posts", value: campaign.post_count },
          { label: "Published", value: published },
          { label: "Scheduled", value: scheduled },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Campaign info */}
      <div className="card p-5 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Frequency</span>
          <span className="font-medium text-slate-800">Every {campaign.frequency_days} day(s)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Tone</span>
          <span className="font-medium text-slate-800 capitalize">{campaign.tone}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Segment</span>
          <span className="font-medium text-slate-800 capitalize">{campaign.segment}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Status</span>
          <span className="font-medium text-slate-800 capitalize">{campaign.status}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-5">Post Sequence — click a post to edit</h2>
        <CampaignTimeline
          posts={posts.map(p => ({
            id: p.id,
            campaign_position: p.campaign_position,
            status: p.status,
            scheduled_at: p.scheduled_at,
            content: p.content,
            image_url: p.image_url,
            image_mode: p.image_mode,
            image_prompt: p.image_prompt,
          }))}
          frequencyDays={campaign.frequency_days}
          startDate={campaign.start_date?.seconds ? new Date(campaign.start_date.seconds * 1000) : undefined}
          onPostClick={(p) => setSelectedPost(p)}
        />
      </div>

      {selectedPost && campaign && (
        <CampaignPostDrawer
          post={selectedPost}
          segment={campaign.segment}
          onClose={() => setSelectedPost(null)}
          onSaved={handlePostSaved}
        />
      )}

      {/* Activate Campaign Modal */}
      {showActivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Activate Campaign</h2>
              <p className="text-xs text-slate-500 mt-0.5">Set the date and time for your first post.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                First Post Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={activateDate}
                onChange={e => setActivateDate(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">Timezone: {timezone}</p>
            </div>

            {activateError && (
              <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">
                {activateError}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => { setShowActivateModal(false); setActivateError(null); }}
                disabled={activating}
                className="flex-1 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleActivate}
                disabled={activating}
                className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {activating ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Activating...</>
                ) : (
                  <>Activate — {campaign.post_count} posts</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
