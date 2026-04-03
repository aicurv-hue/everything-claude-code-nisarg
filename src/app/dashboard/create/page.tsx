"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProfileSegment } from "@/lib/db/profiles";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { Zap, Search, Brain, SlidersHorizontal, ChevronDown, ChevronUp, User, Building2, Sparkles, Link2, ImagePlus, X, CheckCircle2 } from "lucide-react";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

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
  const router = useRouter();

  const accentColor = isCorporate ? "text-violet-600" : "text-[#0A66C2]";
  const accentBg    = isCorporate ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200";
  const accentBtn   = isCorporate ? "bg-violet-600 hover:bg-violet-700" : "bg-[#0A66C2] hover:bg-[#0854a0]";

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
      const res = await fetch("/api/ai/extract-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    const activeProfile: ProfileSegment | undefined = userProfile ? userProfile[segment] : undefined;
    const selectedModel = activeProfile?.model || "google/gemini-2.0-flash-001";

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
        body: JSON.stringify({ topic, options: { segment, model: selectedModel, tone, audience, length, clientProfile: activeProfile }, sourceContext: resolvedSourceContext || undefined }),
      });
      if (!researchRes.ok) throw new Error(`Research failed: ${await researchRes.text()}`);
      const research = await researchRes.json();

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
          model: selectedModel,
          systemPrompt: activeProfile?.systemPrompt || undefined,
          clientProfile: activeProfile,
          customInstructions: customInstructions.trim() || undefined,
          memoryContext:   memoryContext.length > 0   ? memoryContext   : undefined,
          writingSamples:  writingSamples.length > 0  ? writingSamples  : undefined,
          imageStyle: activeProfile?.imageStyle || undefined,
          sourceContext: resolvedSourceContext || undefined,
        }),
      });
      if (!generateRes.ok) throw new Error(`Generation failed: ${await generateRes.text()}`);
      const { post: content, imagePrompt } = await generateRes.json();

      localStorage.setItem("latest_post", JSON.stringify({
        content, imagePrompt, research,
        metadata: { topic, tone, audience, length, segment, customInstructions: customInstructions.trim() || null, memoryUsed: memoryContext.length },
      }));

      router.push("/dashboard/create/preview");
    } catch (error: any) {
      console.error("Failed to generate post:", error);
      alert(error?.message || "Something went wrong during generation. Please try again.");
    } finally {
      setIsGenerating(false);
      setGeneratingStep(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 animate-fade-in">
      <div className="max-w-5xl mx-auto">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Create Post</h1>
            <p className="text-sm text-slate-500 mt-0.5">AI research + generation in one flow</p>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${accentBg} ${accentColor}`}>
            {isCorporate ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
            {isCorporate ? "Company Page" : "Personal Profile"}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">

          {/* Main form */}
          <div className="col-span-12 lg:col-span-8 space-y-5">

            {/* Topic */}
            <div className="card p-6 space-y-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                What do you want to post about?
              </label>
              <textarea
                rows={5}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Describe your topic or idea. The more specific, the better the research will be. E.g. 'How AI is changing legal due diligence in 2025'"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30 focus:border-[#0A66C2] transition-all resize-none text-sm leading-relaxed"
              />
              <div className="flex justify-end">
                <span className={`text-[11px] font-medium ${topic.length > 450 ? "text-amber-500" : "text-slate-400"}`}>
                  {topic.length}/500
                </span>
              </div>
            </div>

            {/* Source Material (collapsible) */}
            <div className="card overflow-hidden">
              <button
                onClick={() => setShowSourcePanel(!showSourcePanel)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${showSourcePanel ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
                    <Link2 className={`w-3.5 h-3.5 ${showSourcePanel ? "text-[#0A66C2]" : "text-slate-400"}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                      Source Material
                      <span className="text-[10px] font-normal text-slate-400 normal-case">optional — URL, article, or image</span>
                      {sourceStatus === "ready" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {sourceStatus === "ready"
                        ? "✓ Context extracted — Neel will read it before writing"
                        : sourceUrl || sourceImage
                        ? "Source added — will be extracted on generate"
                        : "Paste a URL or upload an image for Neel to read"}
                    </p>
                  </div>
                </div>
                {showSourcePanel
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {showSourcePanel && (
                <div className="px-5 pb-5 border-t border-slate-100 space-y-4 pt-4">
                  {/* URL input */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Article / Page URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={sourceUrl}
                        onChange={(e) => { setSourceUrl(e.target.value); setSourceContext(null); setSourceStatus("idle"); }}
                        placeholder="https://example.com/article-to-post-about"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all"
                      />
                      {sourceUrl.trim() && (
                        <button
                          onClick={() => { setSourceUrl(""); setSourceContext(null); setSourceStatus("idle"); }}
                          className="p-2.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">Neel will read the page and extract key facts, data, and angles from it.</p>
                  </div>

                  {/* Image upload */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Reference Image</label>
                    {sourceImage ? (
                      <div className="flex items-start gap-3">
                        <img src={sourceImage.preview} alt="Source" className="w-20 h-20 object-cover rounded-lg border border-slate-200" />
                        <div className="flex-1 space-y-1">
                          <p className="text-xs text-slate-600">Image uploaded — Neel will analyse it with vision AI</p>
                          <button
                            onClick={() => { setSourceImage(null); setSourceContext(null); setSourceStatus("idle"); }}
                            className="text-[11px] text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Remove image
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 cursor-pointer hover:border-slate-400 hover:bg-white transition-all">
                        <ImagePlus className="w-5 h-5 text-slate-400" />
                        <span className="text-sm text-slate-500">Upload image (JPG, PNG, WebP)</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
                        />
                      </label>
                    )}
                    <p className="text-[10px] text-slate-400">Charts, screenshots, infographics — Neel will describe what it sees and weave it into the post.</p>
                  </div>

                  {/* Extract preview button */}
                  {(sourceUrl.trim() || sourceImage) && sourceStatus !== "ready" && (
                    <button
                      onClick={extractSourceContext}
                      disabled={sourceStatus === "extracting"}
                      className={`w-full py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                        sourceStatus === "extracting"
                          ? "bg-slate-100 text-slate-400 cursor-wait border-slate-200"
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
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg space-y-1">
                      <p className="text-[11px] font-semibold text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Context extracted successfully</p>
                      <p className="text-[11px] text-green-600 leading-relaxed line-clamp-3">{sourceContext.slice(0, 200)}…</p>
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
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Voice & Tone</label>
                <div className="space-y-2">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTone(t.value)}
                      className={`w-full p-3 rounded-lg border text-left transition-all text-sm flex items-center justify-between ${
                        tone === t.value
                          ? isCorporate
                            ? "border-violet-300 bg-violet-50 text-violet-700"
                            : "border-[#0A66C2]/40 bg-blue-50 text-[#0A66C2]"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600"
                      }`}
                    >
                              <div>
                        <span className="font-medium text-sm">{t.label}</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">{t.desc}</p>
                        {tone === t.value && (
                          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{t.detail}</p>
                        )}
                      </div>
                      {tone === t.value && (
                        <div className={`w-2 h-2 rounded-full shrink-0 ${isCorporate ? "bg-violet-500" : "bg-[#0A66C2]"}`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audience + Length */}
              <div className="space-y-5">
                <div className="card p-5 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Target Audience</label>
                    <HelpTooltip
                      text="Neel filters research insights to what this audience cares about and frames every claim from their perspective."
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
                              : "bg-[#0A66C2] text-white border-[#0A66C2]"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card p-5 space-y-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Post Length</label>
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
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
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
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all ${showPromptPanel ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
                    <SlidersHorizontal className={`w-3.5 h-3.5 ${showPromptPanel ? "text-[#0A66C2]" : "text-slate-400"}`} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-700">
                      Custom Instructions
                      <span className="ml-2 text-[10px] font-normal text-slate-400 normal-case">highest priority — overrides all settings</span>
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {customInstructions.trim() ? "✓ Active — will be applied to this post" : "Optional: add specific rules just for this one post"}
                    </p>
                  </div>
                </div>
                {showPromptPanel
                  ? <ChevronUp className="w-4 h-4 text-slate-400" />
                  : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>

              {showPromptPanel && (
                <div className="px-5 pb-5 space-y-3 border-t border-slate-100">
                  <div className="pt-3 flex gap-2 flex-wrap">
                    {["Use a question as the hook", "Include a statistic", "Start with a story", "No hashtags", "Under 150 words", "Use bullet points"].map((hint) => (
                      <button
                        key={hint}
                        onClick={() => setCustomInstructions(prev => prev ? `${prev}\n- ${hint}` : `- ${hint}`)}
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-all"
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
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all resize-none text-sm font-mono"
                  />
                  {customInstructions.trim() && (
                    <button onClick={() => setCustomInstructions("")} className="text-[11px] text-slate-400 hover:text-red-500 transition-colors">
                      Clear instructions
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Progress steps — visible while generating */}
            {isGenerating && (
              <div className="card p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Generating your post…</p>
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
                      isActive ? (isCorporate ? "bg-violet-50 border border-violet-200" : "bg-blue-50 border border-blue-200")
                      : isDone  ? "bg-green-50 border border-green-200"
                      : "bg-slate-50 border border-slate-200 opacity-40"
                    }`}>
                      <span className="text-base">{isDone ? "✅" : icon}</span>
                      <p className={`text-sm font-medium flex-1 ${isActive ? (isCorporate ? "text-violet-700" : "text-[#0A66C2]") : isDone ? "text-green-700" : "text-slate-400"}`}>
                        {label}
                      </p>
                      {isActive && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin opacity-70" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!topic.trim() || isGenerating}
              className={`w-full py-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-3 ${
                !topic.trim()
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : isGenerating
                  ? (isCorporate ? "bg-violet-100 cursor-wait text-violet-400" : "bg-blue-100 cursor-wait text-[#0A66C2]/50")
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
          </div>

          {/* Sidebar: Context Panel */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <div className={`card p-5 border-l-4 ${isCorporate ? "border-l-violet-500" : "border-l-[#0A66C2]"}`}>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className={`w-4 h-4 ${accentColor}`} />
                <h4 className="text-sm font-semibold text-slate-800">AI Context</h4>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">Mode</p>
                  <p className="text-sm font-semibold text-slate-800 capitalize">{segment}</p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">AI Writer</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {userProfile?.[segment]?.model?.split('/').pop()?.replace(/-/g, ' ') || "Gemini 2.0 Flash"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">Niche</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {userProfile?.[segment]?.niche || "Not set — add in Settings"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">Brand Voice</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {userProfile?.[segment]?.personality || "Not set — add in Settings"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1">Image Style</p>
                  <p className="text-sm font-semibold text-slate-800 capitalize">
                    {userProfile?.[segment]?.imageStyle
                      ? { photo: "📷 Photo", illustration: "🎨 Illustration", abstract: "🔷 Abstract", "3d": "🧊 3D Render", lineart: "✏️ Line Art", bw_photo: "⬛ B&W Photo" }[userProfile[segment].imageStyle!] || userProfile[segment].imageStyle
                      : "Not set — choose in Settings → Image Style"}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className={`w-3.5 h-3.5 ${accentColor}`} />
                    <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Memory</p>
                    <HelpTooltip
                      text="Neel reads your past 5 most relevant posts before writing. He matches your style, avoids repeating the same angles, and decides whether to deepen a thread or take a new direction."
                      example="The more posts you generate, the smarter and more consistent Neel becomes."
                      position="left"
                    />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    {memoryCount === null ? "Loading..." : memoryCount === 0 ? "First post — no history yet" : `${memoryCount} posts in memory`}
                  </p>
                  {memoryCount === 0 && (
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">After you generate, Neel will remember this post and use it to keep your future posts consistent.</p>
                  )}
                </div>

                {/* Sample Memory row */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className={`w-3.5 h-3.5 ${accentColor}`} />
                    <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Sample Memory</p>
                    <HelpTooltip
                      text="Paste real posts you have written before using LinkAuto. Neel studies them to calibrate your exact voice, sentence rhythm, and vocabulary — making every post sound unmistakably like you."
                      example="Upload 3–5 of your best past LinkedIn posts for the strongest voice match."
                      position="left"
                    />
                  </div>
                  {sampleCount === null ? (
                    <p className="text-sm font-semibold text-slate-800">Loading...</p>
                  ) : sampleCount === 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                        <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
                        <div>
                          <p className="text-[11px] font-semibold text-amber-800">No writing samples yet</p>
                          <p className="text-[10px] text-amber-700 mt-0.5 leading-relaxed">
                            Neel will write in a generic LinkedIn voice. Add samples so he can match your unique style.
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
                      <p className="text-sm font-semibold text-slate-800">
                        {sampleCount} sample{sampleCount > 1 ? "s" : ""} · voice calibrated
                      </p>
                      <span className="text-[10px] text-green-600 font-medium bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                        ✓ Active
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tip */}
            <div className="card p-4 bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 mb-1">💡 Pro Tip</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Include a specific question or data point in your topic to trigger deeper market research.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
