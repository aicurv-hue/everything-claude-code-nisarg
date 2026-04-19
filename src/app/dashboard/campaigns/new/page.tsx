"use client";
import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth";
import { useSegment } from "@/lib/context/segment";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { ArrowLeft, CheckCircle } from "lucide-react";
import CampaignParamsForm, { CampaignParams } from "@/components/campaigns/CampaignParamsForm";
import CampaignPostReview from "@/components/campaigns/CampaignPostReview";
import CampaignTimeline from "@/components/campaigns/CampaignTimeline";

const DEFAULT_PARAMS: CampaignParams = {
  name: "", topic: "", audience: "", tone: "professional",
  length: "medium", post_count: 5, frequency_days: 3, custom_instructions: "",
};

interface PostDraft {
  id: string;
  campaign_position: number;
  content: string;
}

export default function NewCampaignPage() {
  const { user } = useAuth();
  const { segment } = useSegment();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [params, setParams] = useState<CampaignParams>(DEFAULT_PARAMS);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostDraft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Auto-save state
  const saveTimersRef = useRef<Record<number, NodeJS.Timeout>>({});
  const postsRef = useRef<PostDraft[]>([]); // ref to avoid stale closure in debounced saves
  const [savingPositions, setSavingPositions] = useState<Set<number>>(new Set());
  const [savedPositions, setSavedPositions] = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  const handleGenerate = async () => {
    if (!user) return;
    if (posts.length > 0) {
      const confirmed = confirm("Regenerating will delete your current posts and any edits. Continue?");
      if (!confirmed) return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const token = await getAuthToken();
      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...params, segment }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) throw new Error((createData as any).error || "Failed to create campaign");
      const id = (createData as any).id;
      setCampaignId(id);

      const genRes = await fetch(`/api/campaigns/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const genData = await genRes.json().catch(() => ({}));
      if (!genRes.ok) throw new Error((genData as any).error || "Generation failed");
      postsRef.current = genData.posts || [];
      setPosts(genData.posts || []);
      setStep(2);
    } catch (err: any) {
      setGenerateError(err.message || "Something went wrong. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleContentChange = (position: number, content: string) => {
    setPosts(prev => {
      const next = prev.map(p => p.campaign_position === position ? { ...p, content } : p);
      postsRef.current = next; // keep ref in sync for debounced saves
      return next;
    });
    // Auto-save debounce
    if (saveTimersRef.current[position]) clearTimeout(saveTimersRef.current[position]);
    saveTimersRef.current[position] = setTimeout(() => {
      handleSavePost(position);
    }, 1500);
  };

  const handleSavePost = async (position: number) => {
    const post = postsRef.current.find(p => p.campaign_position === position);
    if (!post?.id) return;
    setSavingPositions(prev => new Set(prev).add(position));
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: post.id, content: post.content }),
      });
      if (!res.ok) throw new Error("Failed to save post");
      setSavedPositions(prev => new Set(prev).add(position));
      setTimeout(() => {
        setSavedPositions(prev => { const next = new Set(prev); next.delete(position); return next; });
      }, 2000);
    } finally {
      setSavingPositions(prev => { const next = new Set(prev); next.delete(position); return next; });
    }
  };

  const handleSaveAndExit = async () => {
    if (!campaignId) return;
    setSavingAll(true);
    try {
      await Promise.all(posts.map(p => handleSavePost(p.campaign_position)));
      router.push(`/dashboard/campaigns/${campaignId}`);
    } finally {
      setSavingAll(false);
    }
  };

  const handleActivate = async () => {
    if (!campaignId) return;
    setActivating(true);
    setActivateError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/campaigns/${campaignId}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ start_date: new Date(startDate).toISOString(), timezone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any).error || "Activation failed");
      router.push(`/dashboard/campaigns/${campaignId}`);
    } catch (err: any) {
      setActivateError(err.message || "Activation failed. Try again.");
    } finally {
      setActivating(false);
    }
  };

  const steps = [
    { n: 1, label: "Parameters" },
    { n: 2, label: "Review Posts" },
    { n: 3, label: "Schedule" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => step === 1 ? router.push("/dashboard/campaigns") : setStep(s => (s - 1) as any)}
          className="p-2 rounded-lg hover:bg-[var(--toggle-bg)] text-[var(--text-muted)] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-[var(--foreground)]">New Campaign</h1>
          <p className="text-xs text-[var(--text-muted)]">Step {step} of 3 — {steps[step - 1].label}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s.n}>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              step === s.n ? "bg-[var(--primary)] text-white" :
              step > s.n ? "bg-emerald-500/10 text-emerald-400 border border-emerald-800/40" :
              "bg-[var(--toggle-bg)] text-[var(--text-muted)]"
            }`}>
              {step > s.n ? <CheckCircle className="w-3 h-3" /> : <span>{s.n}</span>}
              {s.label}
            </div>
            {i < steps.length - 1 && <div className="flex-1 h-0.5 bg-[var(--border)] rounded" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Params */}
      {step === 1 && (
        <div className="card p-6">
          {generateError && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-200 text-sm text-red-400">{generateError}</div>
          )}
          <CampaignParamsForm value={params} onChange={setParams} onSubmit={handleGenerate} loading={generating} />
        </div>
      )}

      {/* Step 2: Review posts */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--foreground)]">{params.name}</p>
              <p className="text-xs text-[var(--text-muted)]">{posts.length} posts generated · every {params.frequency_days} days</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAndExit}
                disabled={savingAll}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--toggle-bg)] hover:bg-[var(--border)] text-[var(--foreground)] text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {savingAll ? (
                  <><div className="w-3.5 h-3.5 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin" /> Saving...</>
                ) : "Save & Exit"}
              </button>
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-[var(--primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all"
              >
                Continue to Schedule &rarr;
              </button>
            </div>
          </div>
          <CampaignPostReview
            posts={posts}
            frequencyDays={params.frequency_days}
            onContentChange={handleContentChange}
            onSave={handleSavePost}
            autoSavingPositions={savingPositions}
            autoSavedPositions={savedPositions}
          />
          <button
            onClick={() => setStep(3)}
            className="w-full py-3 rounded-xl bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold transition-all"
          >
            Continue to Schedule &rarr;
          </button>
        </div>
      )}

      {/* Step 3: Schedule & Activate */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card p-6 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">Schedule your campaign</h2>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5">First Post Date & Time</label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all text-sm"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Timezone: {timezone} · Each subsequent post will be {params.frequency_days} day(s) later</p>
            </div>

            {activateError && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-200 text-sm text-red-400">{activateError}</div>
            )}

            <button
              onClick={handleActivate}
              disabled={activating}
              className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {activating ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Activating...</>
              ) : (
                <>Activate Campaign — {posts.length} posts</>
              )}
            </button>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-[var(--foreground)] mb-4">Post timeline</h2>
            <CampaignTimeline
              posts={posts.map(p => ({ ...p, status: "draft" as const }))}
              frequencyDays={params.frequency_days}
              startDate={startDate ? new Date(startDate) : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
