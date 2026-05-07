"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProfileSegment } from "@/lib/db/profiles";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { Zap, Search, Brain, SlidersHorizontal, ChevronDown, ChevronUp, User, Building2, Sparkles, Link2, ImagePlus, X, CheckCircle2, PenLine } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import RewriteButton from "@/components/RewriteButton";

const TONES = [
  { value: "professional",  label: "Professional",  desc: "Authority & expertise",     detail: "Opens with a specific stat or insight. Best for establishing credibility and thought leadership." },
  { value: "storytelling",  label: "Storytelling",  desc: "Personal narratives",       detail: "Opens with a vivid real moment. Best for building connection and human relatability." },
  { value: "educational",   label: "Educational",   desc: "How-to & insights",         detail: "Opens with a pain + numbered fix. Best for teaching something actionable to your audience." },
  { value: "contrarian",    label: "Contrarian",    desc: "Bold, against the grain",   detail: "Opens by challenging a common belief with data. Best for stopping the scroll and sparking debate." },
];

const AUDIENCES = [
  { value: "founders",   label: "Founders & CEOs" },
  { value: "marketers",  label: "Marketers & Growth" },
  { value: "engineers",  label: "Engineers & Devs" },
  { value: "general",    label: "General Professional" },
];

const LENGTHS = [
  { value: "short",  label: "Short",  desc: "~100 words" },
  { value: "medium", label: "Medium", desc: "~200 words" },
  { value: "long",   label: "Long",   desc: "~400 words" },
];

export default function CreatePostPage() {
  const [topic, setTopic]             = useState("");
  const [tone, setTone]               = useState("professional");
  const [audience, setAudience]       = useState("founders");
  const [length, setLength]           = useState("medium");
  const { user } = useAuth();
  const { segment, isIndividual, isCorporate } = useSegment();

  const [userProfile, setUserProfile]       = useState<{ [key: string]: ProfileSegment } | null>(null);
  const [isGenerating, setIsGenerating]     = useState(false);
  const [generatingStep, setGeneratingStep] = useState<"source" | "research" | "memory" | "writing" | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [showPromptPanel, setShowPromptPanel]       = useState(false);

  // Source material
  const [showSourcePanel, setShowSourcePanel]       = useState(false);
  const [sourceUrl, setSourceUrl]                   = useState("");
  const [sourceImage, setSourceImage]               = useState<{ base64: string; type: string; preview: string } | null>(null);
  const [sourceContext, setSourceContext]           = useState<string | null>(null);
  const [sourceStatus, setSourceStatus]             = useState<"idle" | "extracting" | "ready" | "error">("idle");
  const [memoryCount, setMemoryCount]   = useState<number | null>(null);
  const [sampleCount, setSampleCount]   = useState<number | null>(null);
  const [writingSamples, setWritingSamples] = useState<any[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [manualContent, setManualContent] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-fill from Idea Bank URL params
  useEffect(() => {
    const ideaTitle = searchParams.get("title");
    const ideaTone = searchParams.get("tone");
    const ideaAudience = searchParams.get("audience");
    if (ideaTitle) setTopic(decodeURIComponent(ideaTitle));
    if (ideaTone) setTone(ideaTone);
    if (ideaAudience) setAudience(ideaAudience);
  }, [searchParams]);

  // B1: Restore draft inputs from localStorage on mount — skip if Idea Bank passed a topic via URL
  useEffect(() => {
    if (searchParams.get("title")) return;
    try {
      const saved = localStorage.getItem("create_draft");
      if (saved) {
        const d = JSON.parse(saved);
        if (d.topic)    setTopic(d.topic);
        if (d.tone)     setTone(d.tone);
        if (d.audience) setAudience(d.audience);
        if (d.length)   setLength(d.length);
      }
    } catch { /* ignore */ }
  }, []);

  // B1: Auto-save draft inputs whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("create_draft", JSON.stringify({ topic, tone, audience, length }));
    } catch { /* ignore */ }
  }, [topic, tone, audience, length]);

  const accentColor = isCorporate ? "text-violet-400" : "text-[var(--primary)]";
  const accentBg    = isCorporate ? "bg-violet-500/10 border-violet-800/40" : "bg-blue-500/10 border-blue-800/40";
  const accentBtn   = isCorporate ? "bg-violet-600 hover:bg-violet-700" : "bg-[var(--primary)] hover:opacity-90";

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      try {
        const token = await getAuthToken();
        if (!token) { setMemoryCount(0); setSampleCount(0); return; }
        const [profileRes, memoryRes] = await Promise.all([
          fetch("/api/profiles", { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/memory?segment=${segment}&limit=100`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (profileRes.ok) {
          const data = await profileRes.json();
          if (data.profile) setUserProfile(data.profile);
        }
        if (memoryRes.ok) {
          const data = await memoryRes.json();
          const all = Array.isArray(data.entries) ? data.entries : [];
          const auto    = all.filter((e: any) => e.source !== "user_upload");
          const uploads = all.filter((e: any) => e.source === "user_upload");
          setMemoryCount(auto.length);
          setSampleCount(uploads.length);
          setWritingSamples(uploads);
        } else {
          setMemoryCount(0);
          setSampleCount(0);
        }
      } catch {
        setMemoryCount(0);
      }
    };
    loadProfile();
  }, [segment, user]);

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      // dataUrl = "data:image/jpeg;base64,/9j/..."
      const [meta, base64] = dataUrl.split(",");
      const type = meta.replace("data:", "").replace(";base64", "");
      setSourceImage({ base64, type, preview: dataUrl });
      setSourceContext(null);
      setSourceStatus("idle");
    };
    reader.readAsDataURL(file);
  };

  const extractSourceContext = async (): Promise<string | null> => {
    if (!sourceUrl.trim() && !sourceImage) return null;
    setSourceStatus("extracting");
    try {
      const token = auth.currentUser ? await getIdToken(auth.currentUser) : null;
      const res = await fetch("/api/ai/extract-context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: sourceUrl.trim() || undefined,
          imageBase64: sourceImage?.base64 || undefined,
          imageType: sourceImage?.type || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Extraction failed");
      }
      const { urlContent, imageDescription } = await res.json();
      const parts: string[] = [];
      if (urlContent) parts.push(`[From URL: ${sourceUrl}]\n${urlContent}`);
      if (imageDescription) parts.push(`[From image]\n${imageDescription}`);
      const combined = parts.join("\n\n") || null;
      setSourceContext(combined);
      setSourceStatus(combined ? "ready" : "idle");
      return combined;
    } catch (e: any) {
      setSourceStatus("error");
      alert(`Source extraction failed: ${e?.message}`);
      return null;
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setGenerateError(null);

    const activeProfile: ProfileSegment | undefined = userProfile ? userProfile[segment] : undefined;

    try {
      // ── Extract source material (URL / image) if provided ──────────────────
      let resolvedSourceContext = sourceContext; // use cached if already extracted
      if (!resolvedSourceContext && (sourceUrl.trim() || sourceImage)) {
        setGeneratingStep("source");
        resolvedSourceContext = await extractSourceContext();
      }

      // Get Firebase token once — used for all authenticated API calls
      const idToken = auth.currentUser ? await getIdToken(auth.currentUser) : null;
      const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      };

      // ── Stage 1: Research (via API route — supports 60s timeout) ────────────
      setGeneratingStep("research");
      const researchRes = await fetch("/api/ai/research", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ topic, options: { segment, tone, audience, length, clientProfile: activeProfile }, sourceContext: resolvedSourceContext || undefined }),
      });
      if (!researchRes.ok) throw new Error(`Research failed: ${await researchRes.text()}`);
      const research = await researchRes.json();
      const intentType: "personal" | "professional" = research.intentType ?? "professional";

      // ── Stage 2: Load auto-saved memory via API route ────────────────────────
      setGeneratingStep("memory");
      let memoryContext: any[] = [];
      try {
        if (idToken) {
          const memRes = await fetch(`/api/memory?segment=${segment}&topic=${encodeURIComponent(topic)}&limit=5`, {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          if (memRes.ok) {
            const memData = await memRes.json();
            // Only auto-saved entries for content continuity (user_upload handled separately as style samples)
            memoryContext = (memData.entries || []).filter((e: any) => e.source !== "user_upload");
          }
        }
      } catch { /* memory is non-critical */ }

      // ── Stage 3: Generate post (via API route — supports 60s timeout) ────────
      setGeneratingStep("writing");
      const generateRes = await fetch("/api/ai/generate", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          topic, tone, audience, length, segment, research,
          intentType,
          clientProfile: activeProfile,
          customInstructions: customInstructions.trim() || undefined,
          memoryContext:   memoryContext.length > 0   ? memoryContext   : undefined,
          writingSamples:  writingSamples.length > 0  ? writingSamples  : undefined,
          sourceContext: resolvedSourceContext || undefined,
        }),
      });
      if (!generateRes.ok) {
        const errBody = await generateRes.json().catch(() => ({} as any));
        throw new Error(errBody?.error || `Generation failed (HTTP ${generateRes.status})`);
      }
      const { post: content, imagePrompt } = await generateRes.json();

      // Fresh regeneration session id — used to key the temporary regen memory
      // in Firestore (regeneration_sessions/{sessionId}). Created lazily on the
      // first regenerate click; cleaned up on save/schedule/publish/delete.
      const regenSessionId =
        (typeof crypto !== "undefined" && (crypto as any).randomUUID)
          ? (crypto as any).randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

      localStorage.setItem("latest_post", JSON.stringify({
        content, imagePrompt, research,
        referenceImagePreview: sourceImage?.preview || null,
        intentType,
        metadata: { topic, tone, audience, length, segment, customInstructions: customInstructions.trim() || null, memoryUsed: memoryContext.length },
        clientProfile: activeProfile || null,
        memoryContext: memoryContext.length > 0 ? memoryContext : null,
        writingSamples: writingSamples.length > 0 ? writingSamples : null,
        sourceContext: resolvedSourceContext || null,
        regenSessionId,
        initialPost: content,
      }));
      // Clear draft cache now that it's been used
      localStorage.removeItem("create_draft");

      router.push("/dashboard/create/preview");
    } catch (error: any) {
      console.error("Failed to generate post:", error);
      setGenerateError(error?.message || "Something went wrong during generation. Please try again.");
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  const handleManualPreview = () => {
    if (!manualContent.trim()) return;
    const activeProfile: ProfileSegment | undefined = userProfile ? userProfile[segment] : undefined;
    localStorage.setItem("latest_post", JSON.stringify({
      content: manualContent.trim(),
      imagePrompt: null,
      research: { insights: [], references: [], summary: "" },
      referenceImagePreview: null,
      intentType: "professional",
      metadata: { topic: manualContent.trim().slice(0, 80), tone, audience, length, segment, customInstructions: null, memoryUsed: 0 },
      clientProfile: activeProfile || null,
      memoryContext: null,
      writingSamples: null,
      sourceContext: null,
      isManual: true,
    }));
    router.push("/dashboard/create/preview");
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto animate-fade-in">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Create Post</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">AI research + generation in one flow</p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${accentBg} ${accentColor}`}>
            {isCorporate ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
            {isCorporate ? "Company Page" : "Personal Profile"}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6 p-1 bg-[var(--toggle-bg)] rounded-xl w-fit">
          <button
            onClick={() => setMode("ai")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "ai"
                ? `bg-[var(--card)] shadow-sm ${accentColor}`
                : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI Generate
          </button>
          <button
            onClick={() => setMode("manual")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "manual"
                ? `bg-[var(--card)] shadow-sm ${accentColor}`
                : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <PenLine className="w-4 h-4" />
            Write Manually
          </button>
        </div>

        {/* Manual post mode */}
        {mode === "manual" && (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8 space-y-5">
              <div className="card p-6 space-y-3">
                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                  Write your post
                </label>
                <textarea
                  rows={12}
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  placeholder="Write your LinkedIn post here. Cridl will publish it exactly as written — no AI changes."
                  className="w-full bg-[var(--card-hover)] border border-[var(--border)] rounded-xl px-4 py-3.5 text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30 focus:border-[#0A66C2] transition-all resize-none text-sm leading-relaxed"
                />
                <div className="flex justify-between items-center">
                  <p className="text-[11px] text-[var(--text-muted)]">You can add an image, schedule, or post immediately on the next screen.</p>
                  <span className={`text-[11px] font-medium ${manualContent.length > 2900 ? "text-amber-500" : "text-[var(--text-muted)]"}`}>
                    {manualContent.length}/3000
                  </span>
                </div>
              </div>

              {/* Tone + Audience for manual (used for metadata only) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="card p-5 space-y-3">
                  <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Voice & Tone</label>
                  <div className="space-y-2">
                    {TONES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setTone(t.value)}
                        className={`w-full p-3 rounded-lg border text-left transition-all text-sm flex items-center justify-between ${
                          tone === t.value
                            ? isCorporate
                              ? "border-violet-800/40 bg-violet-500/10 text-violet-400"
                              : "border-[#0A66C2]/40 bg-blue-500/10 text-[var(--primary)]"
                            : "border-[var(--border)] hover:border-slate-300 hover:bg-[var(--card-hover)] text-[var(--text-sub)]"
                        }`}
                      >
                        <span className="font-medium text-sm">{t.label}</span>
                        {tone === t.value && (
                          <div className={`w-2 h-2 rounded-full shrink-0 ${isCorporate ? "bg-violet-500/100" : "bg-[var(--primary)]"}`} />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-5">
                  <div className="card p-5 space-y-3">
                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Target Audience</label>
                    <div className="flex flex-wrap gap-2">
                      {AUDIENCES.map((a) => (
                        <button
                          key={a.value}
                          onClick={() => setAudience(a.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            audience === a.value
                              ? isCorporate
                                ? "bg-violet-600 text-white border-violet-600"
                                : "bg-[var(--primary)] text-white border-[#0A66C2]"
                              : "bg-[var(--card)] text-[var(--text-sub)] border-[var(--border)] hover:border-slate-300"
                          }`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleManualPreview}
                disabled={!manualContent.trim()}
                className={`w-full py-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-3 ${
                  !manualContent.trim()
                    ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed"
                    : `${accentBtn} text-white shadow-sm active:scale-[0.99]`
                }`}
              >
                <PenLine className="w-4 h-4" />
                Preview & Post
              </button>
            </div>

            {/* Sidebar for manual mode */}
            <div className="col-span-12 lg:col-span-4 space-y-4">
              <div className={`card p-5 border-l-4 ${isCorporate ? "border-l-violet-500" : "border-l-[#0A66C2]"}`}>
                <div className="flex items-center gap-2 mb-4">
                  <PenLine className={`w-4 h-4 ${accentColor}`} />
                  <h4 className="text-sm font-semibold text-[var(--foreground)]">Manual Mode</h4>
                </div>
                <div className="space-y-3 text-xs text-[var(--text-muted)] leading-relaxed">
                  <p>Your post is published <span className="font-semibold text-[var(--foreground)]">exactly as written</span> — no AI rewrites.</p>
                  <p>On the next screen you can:</p>
                  <ul className="space-y-1 ml-3 list-disc">
                    <li>Add or generate an image</li>
                    <li>Post immediately or schedule</li>
                    <li>Edit the text further</li>
                  </ul>
                </div>
              </div>
              <div className="card p-4 bg-[var(--card-hover)]">
                <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">💡 Tip</p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Manual posts don't use AI credits. Scheduling and image generation credits still apply.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI Generate mode */}
        {mode === "ai" && (
        <div className="grid grid-cols-12 gap-6">

          {/* Main form */}
          <div className="col-span-12 lg:col-span-8 space-y-5">

            {/* Topic */}
            <div className="card p-6 space-y-3">
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                What do you want to post about?
              </label>
              <textarea
                rows={5}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe your topic or idea. The more specific, the better the research will be. E.g. 'How AI is changing legal due diligence in 2025'"
                className="w-full bg-[var(--card-hover)] border border-[var(--border)] rounded-xl px-4 py-3.5 text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30 focus:border-[#0A66C2] transition-all resize-none text-sm leading-relaxed"
              />
              <div className="flex items-center justify-between gap-3">
                <RewriteButton
                  postText={topic}
                  userId={user?.uid ?? ""}
                  voiceProfile={(userProfile?.[segment] as any)?.voiceProfile ?? userProfile?.[segment] ?? undefined}
                  writingSamples={writingSamples.length > 0 ? writingSamples : undefined}
                  onApply={(rw) => setTopic(rw)}
                />
                <span className={`text-[11px] font-medium ${topic.length > 450 ? "text-amber-500" : "text-[var(--text-muted)]"}`}>
                  {topic.length}/500
                </span>
              </div>
            </div>

            {/* Source Material (collapsible) */}
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowSourcePanel(!showSourcePanel)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${showSourcePanel ? "bg-blue-500/10 border-blue-800/40" : "bg-[var(--card-hover)] border-[var(--border)]"}`}>
                    <Link2 className={`w-3.5 h-3.5 ${showSourcePanel ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
                      Source Material
                      <span className="text-[10px] font-normal text-[var(--text-muted)] normal-case">optional — URL, article, or image</span>
                      {sourceStatus === "ready" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {sourceStatus === "ready"
                        ? "✓ Context extracted — Cortex will read it before writing"
                        : sourceUrl || sourceImage
                        ? "Source added — will be extracted on generate"
                        : "Paste a URL or upload an image for Cortex to read"}
                    </p>
                  </div>
                </div>
                {showSourcePanel
                  ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                  : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
              </button>

              {showSourcePanel && (
                <div className="px-5 pb-5 border-t border-[var(--border-sub)] space-y-4 pt-4">
                  {/* URL input */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Article / Page URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(e) => { setSourceUrl(e.target.value); setSourceContext(null); setSourceStatus("idle"); }}
                        placeholder="https://example.com/article-to-post-about"
                        className="flex-1 bg-[var(--card-hover)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all"
                      />
                      {sourceUrl.trim() && (
                        <button
                          onClick={() => { setSourceUrl(""); setSourceContext(null); setSourceStatus("idle"); }}
                          className="p-2.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-200 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)]">Cortex will read the page and extract key facts, data, and angles from it.</p>
                  </div>

                  {/* Image upload */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">Reference Image</label>
                    {sourceImage ? (
                      <div className="flex items-start gap-3">
                        <img src={sourceImage.preview} alt="Source" className="w-20 h-20 object-cover rounded-lg border border-[var(--border)]" />
                        <div className="flex-1 space-y-1">
                          <p className="text-xs text-[var(--text-sub)]">Image uploaded — Cortex will analyse it with vision AI</p>
                          <button
                            onClick={() => { setSourceImage(null); setSourceContext(null); setSourceStatus("idle"); }}
                            className="text-[11px] text-[var(--text-muted)] hover:text-red-500 transition-colors flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Remove image
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-slate-300 bg-[var(--card-hover)] cursor-pointer hover:border-slate-400 hover:bg-[var(--card)] transition-all">
                        <ImagePlus className="w-5 h-5 text-[var(--text-muted)]" />
                        <span className="text-sm text-[var(--text-muted)]">Upload image (JPG, PNG, WebP)</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                        />
                      </label>
                    )}
                    <p className="text-[10px] text-[var(--text-muted)]">Charts, screenshots, infographics — Cortex will describe what it sees and weave it into the post.</p>
                  </div>

                  {/* Extract preview button */}
                  {(sourceUrl.trim() || sourceImage) && sourceStatus !== "ready" && (
                    <button
                      onClick={extractSourceContext}
                      disabled={sourceStatus === "extracting"}
                      className={`w-full py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                        sourceStatus === "extracting"
                          ? "bg-[var(--toggle-bg)] text-[var(--text-muted)] cursor-wait border-[var(--border)]"
                          : `${accentBg} ${accentColor} hover:opacity-80`
                      }`}
                    >
                      {sourceStatus === "extracting" ? (
                        <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Extracting…</>
                      ) : (
                        <><Search className="w-4 h-4" /> Preview extracted context</>
                      )}
                    </button>
                  )}

                  {/* Show extracted context preview */}
                  {sourceStatus === "ready" && sourceContext && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-800/40 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Context extracted successfully</p>
                        <span className="text-[10px] text-green-500">{sourceContext.length.toLocaleString()} chars → Cortex</span>
                      </div>
                      <div className="max-h-56 overflow-y-auto rounded border border-green-100 bg-[var(--card)] p-2">
                        <p className="text-[11px] text-[var(--text-sub)] leading-relaxed whitespace-pre-wrap">{sourceContext}</p>
                      </div>
                    </div>
                  )}

                  {sourceStatus === "error" && (
                    <p className="text-[11px] text-red-500">Extraction failed — check the URL and try again.</p>
                  )}
                </div>
              )}
            </div>

            {/* Tone + Audience */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Tone */}
              <div className="card p-5 space-y-3">
                <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Voice & Tone</label>
                <div className="space-y-2">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTone(t.value)}
                      className={`w-full p-3 rounded-lg border text-left transition-all text-sm flex items-center justify-between ${
                        tone === t.value
                          ? isCorporate
                            ? "border-violet-800/40 bg-violet-500/10 text-violet-400"
                            : "border-[#0A66C2]/40 bg-blue-500/10 text-[var(--primary)]"
                          : "border-[var(--border)] hover:border-slate-300 hover:bg-[var(--card-hover)] text-[var(--text-sub)]"
                      }`}
                    >
                              <div>
                        <span className="font-medium text-sm">{t.label}</span>
                        <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{t.desc}</p>
                        {tone === t.value && (
                          <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{t.detail}</p>
                        )}
                      </div>
                      {tone === t.value && (
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isCorporate ? "bg-violet-500/100" : "bg-[var(--primary)]"}`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audience + Length */}
              <div className="space-y-5">
                <div className="card p-5 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Target Audience</label>
                    <HelpTooltip
                      text="Cortex filters research insights to what this audience cares about and frames every claim from their perspective."
                      example="Founders → ROI & speed. Engineers → technical depth. Marketers → metrics & growth."
                      position="bottom"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {AUDIENCES.map((a) => (
                      <button
                        key={a.value}
                        onClick={() => setAudience(a.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          audience === a.value
                            ? isCorporate
                              ? "bg-violet-600 text-white border-violet-600"
                              : "bg-[var(--primary)] text-white border-[#0A66C2]"
                            : "bg-[var(--card)] text-[var(--text-sub)] border-[var(--border)] hover:border-slate-300"
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card p-5 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Post Length</label>
                    <HelpTooltip
                      text="Short (100w) = tight hooks and lists, highest scroll-stop rate. Medium (200w) = sweet spot for engagement. Long (400w) = deep-dive thought leadership, best for comments."
                      position="bottom"
                    />
                  </div>
                  <div className="flex gap-2">
                    {LENGTHS.map((l) => (
                      <button
                        key={l.value}
                        onClick={() => setLength(l.value)}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-all text-center ${
                          length === l.value
                            ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                            : "bg-[var(--card)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--primary)]/40"
                        }`}
                      >
                        <div>{l.label}</div>
                        <div className="text-[10px] opacity-60 mt-0.5">{l.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Instructions (collapsible) */}
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowPromptPanel(!showPromptPanel)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${showPromptPanel ? "bg-blue-500/10 border-blue-800/40" : "bg-[var(--card-hover)] border-[var(--border)]"}`}>
                    <SlidersHorizontal className={`w-3.5 h-3.5 ${showPromptPanel ? "text-[var(--primary)]" : "text-[var(--text-muted)]"}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      Custom Instructions
                      <span className="ml-2 text-[10px] font-normal text-[var(--text-muted)] normal-case">highest priority — overrides all settings</span>
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {customInstructions.trim() ? "✓ Active — will be applied to this post" : "Optional: add specific rules just for this one post"}
                    </p>
                  </div>
                </div>
                {showPromptPanel
                  ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                  : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
              </button>

              {showPromptPanel && (
                <div className="px-5 pb-5 space-y-3 border-t border-[var(--border-sub)]">
                  <div className="pt-3 flex gap-2 flex-wrap">
                    {["Use a question as the hook", "Include a statistic", "Start with a story", "No hashtags", "Under 150 words", "Use bullet points"].map((hint) => (
                      <button
                        key={hint}
                        onClick={() => setCustomInstructions(prev => prev ? `${prev}\n- ${hint}` : `- ${hint}`)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--border)] bg-[var(--card-hover)] text-[var(--text-muted)] hover:text-[var(--foreground)] hover:border-slate-300 transition-all"
                      >
                        + {hint}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder={"Examples:\n- DO: Start with a shocking stat\n- DO: Mention our product name\n- DON'T: Use the word 'leverage'\n- DON'T: Include competitor names"}
                    rows={5}
                    className="w-full bg-[var(--card-hover)] border border-[var(--border)] rounded-lg px-4 py-3 text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all resize-none text-sm font-mono"
                  />
                  {customInstructions.trim() && (
                    <button onClick={() => setCustomInstructions("")} className="text-[11px] text-[var(--text-muted)] hover:text-red-500 transition-colors">
                      Clear instructions
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Progress steps — visible while generating */}
            {isGenerating && (
              <div className="card p-4 space-y-3">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">Generating your post…</p>
                {[
                  ...(sourceUrl.trim() || sourceImage ? [{ step: "source", label: "Reading your URL / image", icon: "🔗" }] : []),
                  { step: "research", label: "Deep-researching your topic",    icon: "🔍" },
                  { step: "memory",   label: "Reading your past posts for style", icon: "🧠" },
                  { step: "writing",  label: "Writing your LinkedIn post",      icon: "✍️" },
                ].map(({ step, label, icon }) => {
                  const steps = [...(sourceUrl.trim() || sourceImage ? ["source"] : []), "research", "memory", "writing"];
                  const currentIdx = steps.indexOf(generatingStep || steps[0]);
                  const thisIdx = steps.indexOf(step);
                  const isDone    = thisIdx < currentIdx;
                  const isActive  = step === generatingStep;
                  return (
                    <div key={step} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                      isActive ? (isCorporate ? "bg-violet-500/10 border border-violet-800/40" : "bg-blue-500/10 border border-blue-800/40")
                      : isDone  ? "bg-emerald-500/10 border border-emerald-800/40"
                      : "bg-[var(--card-hover)] border border-[var(--border)] opacity-40"
                    }`}>
                      <span className="text-base">{isDone ? "✅" : icon}</span>
                      <p className={`text-sm font-medium flex-1 ${isActive ? (isCorporate ? "text-violet-400" : "text-[var(--primary)]") : isDone ? "text-emerald-400" : "text-[var(--text-muted)]"}`}>
                        {label}
                      </p>
                      {isActive && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* A4: Generation error with retry */}
            {generateError && !isGenerating && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-200">
                <CheckCircle2 className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-400 mb-1">Generation failed</p>
                  <p className="text-xs text-red-400 leading-relaxed">{generateError}</p>
                </div>
                <button
                  onClick={() => setGenerateError(null)}
                  className="text-red-400 hover:text-red-400 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || isGenerating}
              className={`w-full py-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-3 ${
                !topic.trim()
                  ? "bg-[var(--border)] text-[var(--text-muted)] cursor-not-allowed"
                  : isGenerating
                  ? (isCorporate ? "bg-violet-500/20 cursor-wait text-violet-400" : "bg-blue-500/20 cursor-wait text-[var(--primary)]/50")
                  : `${accentBtn} text-white shadow-sm active:scale-[0.99]`
              }`}
            >
              {isGenerating ? (
                <>
                  <Zap className="w-4 h-4 animate-pulse" />
                  {generatingStep === "source"   && "Reading source…"}
                  {generatingStep === "research" && "Stage 1 — Researching…"}
                  {generatingStep === "memory"   && "Stage 2 — Loading memory…"}
                  {generatingStep === "writing"  && "Stage 3 — Writing post…"}
                  {!generatingStep               && "Starting…"}
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Research & Generate Post
                </>
              )}
            </button>
            <p className="text-xs text-[var(--text-muted)] text-center mt-2">Tip: regenerations count toward your monthly limit.</p>
          </div>

          {/* Sidebar: Context Panel */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className={`card p-5 border-l-4 ${isCorporate ? "border-l-violet-500" : "border-l-[#0A66C2]"}`}>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className={`w-4 h-4 ${accentColor}`} />
                <h4 className="text-sm font-semibold text-[var(--foreground)]">AI Context</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">Mode</p>
                  <p className="text-sm font-semibold text-[var(--foreground)] capitalize">{segment}</p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">Niche</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {userProfile?.[segment]?.niche || "Not set — add in Settings"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">Brand Voice</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {userProfile?.[segment]?.personality || "Not set — add in Settings"}
                  </p>
                </div>
                <div className="pt-3 border-t border-[var(--border-sub)]">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className={`w-3.5 h-3.5 ${accentColor}`} />
                    <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide">Memory</p>
                    <HelpTooltip
                      text="Cortex reads your past 5 most relevant posts before writing. He matches your style, avoids repeating the same angles, and decides whether to deepen a thread or take a new direction."
                      example="The more posts you generate, the smarter and more consistent Cortex becomes."
                      position="left"
                    />
                  </div>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {memoryCount === null ? "Loading..." : memoryCount === 0 ? "First post — no history yet" : `${memoryCount} posts in memory`}
                  </p>
                  {memoryCount === 0 && (
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-relaxed">After you generate, Cortex will remember this post and use it to keep your future posts consistent.</p>
                  )}
                </div>

                {/* Sample Memory row */}
                <div className="pt-3 border-t border-[var(--border-sub)]">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className={`w-3.5 h-3.5 ${accentColor}`} />
                    <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wide">Sample Memory</p>
                    <HelpTooltip
                      text="Paste real posts you have written before using Cridl. Cortex studies them to calibrate your exact voice, sentence rhythm, and vocabulary — making every post sound unmistakably like you."
                      example="Upload 3–5 of your best past LinkedIn posts for the strongest voice match."
                      position="left"
                    />
                  </div>
                  {sampleCount === null ? (
                    <p className="text-sm font-semibold text-[var(--foreground)]">Loading...</p>
                  ) : sampleCount === 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-200">
                        <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                        <div>
                          <p className="text-[11px] font-semibold text-amber-800">No writing samples yet</p>
                          <p className="text-[10px] text-amber-400 mt-0.5 leading-relaxed">
                            Cortex will write in a generic LinkedIn voice. Add samples so he can match your unique style.
                          </p>
                        </div>
                      </div>
                      <a
                        href="/dashboard/memory"
                        className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-medium border transition-all ${accentBg} ${accentColor} hover:opacity-80`}
                      >
                        <Brain className="w-3 h-3" />
                        Add Writing Samples →
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {sampleCount} sample{sampleCount > 1 ? "s" : ""} · voice calibrated
                      </p>
                      <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                        ✓ Active
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tip */}
            <div className="card p-4 bg-[var(--card-hover)]">
              <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">💡 Pro Tip</p>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                Include a specific question or data point in your topic to trigger deeper market research.
              </p>
            </div>
          </div>
        </div>
        )}
    </div>
  );
}
