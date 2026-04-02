"use client";

import { useState, useEffect } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import {
  AlertTriangle,
  Save,
  RotateCcw,
  User,
  Users,
  Target,
  Palette,
  MessageSquare,
  ShieldCheck,
  Linkedin,
  RefreshCw,
  CheckCircle2,
  LogOut,
  Image as ImageIcon,
} from "lucide-react";
import { UserProfile, ProfileSegment, ImageStyle } from "@/lib/db/profiles";
import { useAuth } from "@/lib/context/auth";
import { HelpTooltip, FieldHint } from "@/components/ui/HelpTooltip";
import { ProfileAIAssist } from "@/components/ui/ProfileAIAssist";

export const DEFAULT_SYSTEM_PROMPT = `You are a world-class marketing copywriter and content strategist.
Your goal is to generate high-performing LinkedIn content that drives engagement and authority.
Always follow the "Gold-Standard" LinkedIn format:
1. Hook: A powerful first line that stops the scroll.
2. Body: Value-rich insights using short, punchy paragraphs.
3. Formatting: Use bullet points and white space for readability.
4. CTA: A clear, conversational closing question.
5. Tone: Authenticity over corporate jargon.`;

const INITIAL_SEGMENT: ProfileSegment = {
  name: "",
  roleOrIndustry: "",
  bioOrOffering: "",
  niche: "",
  icp: "",
  companyStage: "",
  jtbd: "",
  pillars: "",
  personality: "",
  usp: "",
  customerPains: "",
  verbatimLanguage: "",
  wordsToAvoid: "",
  model: "google/gemini-2.0-flash-001",
  systemPrompt: DEFAULT_SYSTEM_PROMPT
};

const inputClass = "w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all text-sm";
const textareaClass = `${inputClass} resize-none leading-relaxed`;
const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab]   = useState("identity");
  const [profileType, setProfileType] = useState<"individual" | "corporate">("individual");
  const [segments, setSegments] = useState<{ individual: ProfileSegment; corporate: ProfileSegment }>({
    individual: { ...INITIAL_SEGMENT },
    corporate:  { ...INITIAL_SEGMENT }
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaved, setIsSaved]       = useState(false);
  const [liConnected, setLiConnected] = useState(false);
  const [liName, setLiName]           = useState("");
  const [liEmail, setLiEmail]         = useState("");
  const [liExpiry, setLiExpiry]       = useState<number | null>(null);
  const [liDisconnecting, setLiDisconnecting] = useState(false);
  const [liJustDisconnected, setLiJustDisconnected] = useState(false);

  useEffect(() => {
    getAuthToken().then(tok =>
      fetch("/api/linkedin/status", tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})
        .then(r => r.json())
        .then(d => {
          setLiConnected(d.connected);
          setLiName(d.name || "");
          setLiEmail(d.email || "");
          setLiExpiry(d.expiresAt || null);
        })
        .catch(() => {})
    );
  }, []);

  const refreshLinkedInStatus = () => {
    getAuthToken().then(tok =>
      fetch("/api/linkedin/status", tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})
        .then(r => r.json())
        .then(d => {
          setLiConnected(d.connected);
          setLiName(d.name || "");
          setLiEmail(d.email || "");
          setLiExpiry(d.expiresAt || null);
        })
        .catch(() => {})
    );
  };

  // Listen for postMessage from OAuth popup
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "linkedin_connected") {
        refreshLinkedInStatus();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Also handle direct redirect (non-popup fallback): check URL param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("linkedin_connected") === "true") {
      refreshLinkedInStatus();
      // Clean the URL without reload
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("linkedin_error")) {
      console.error("[LinkedIn OAuth error]", params.get("linkedin_error"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleReconnect = () => {
    if (!user?.uid) {
      alert("Still loading your account — please wait a moment and try again.");
      return;
    }
    const oauthUrl = `/api/auth/linkedin?returnTo=/dashboard/settings&uid=${encodeURIComponent(user.uid)}`;
    window.location.href = oauthUrl;
  };

  const handleDisconnect = async () => {
    setLiDisconnecting(true);
    const token = await getAuthToken().catch(() => null);
    await fetch("/api/auth/linkedin/disconnect", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
    setLiConnected(false);
    setLiName("");
    setLiEmail("");
    setLiExpiry(null);
    setLiJustDisconnected(true);
    setLiDisconnecting(false);
    setTimeout(() => setLiJustDisconnected(false), 4000);
  };

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch("/api/profiles", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const cloudProfile = data.profile;
        if (cloudProfile) {
          setSegments({
            individual: { ...INITIAL_SEGMENT, ...cloudProfile.individual },
            corporate:  { ...INITIAL_SEGMENT, ...cloudProfile.corporate }
          });
          setProfileType(cloudProfile.lastActiveSegment || "individual");
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    loadSettings();
  }, [user]);

  const handleSave = async () => {
    const profile: UserProfile = {
      lastActiveSegment: profileType,
      individual: segments.individual,
      corporate:  segments.corporate
    };
    const token = await getAuthToken();
    if (token) {
      await fetch("/api/profiles", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
    }
    localStorage.setItem("ai_model", segments[profileType].model || "google/gemini-2.0-flash-001");
    localStorage.setItem("system_prompt", segments[profileType].systemPrompt || DEFAULT_SYSTEM_PROMPT);
    localStorage.setItem("client_profile", JSON.stringify({ ...segments[profileType], profileType }));
    setIsSaved(true);
    setHasChanges(false);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleFieldChange = (field: keyof ProfileSegment, value: string) => {
    setSegments(prev => ({
      ...prev,
      [profileType]: { ...prev[profileType], [field]: value }
    }));
    setHasChanges(true);
  };

  const currentProfile = segments[profileType];

  const tabs = [
    { id: "identity", label: "Identity",       icon: User },
    { id: "audience", label: "Audience",       icon: Users },
    { id: "branding", label: "Branding",       icon: Palette },
    { id: "voice",    label: "Customer Voice", icon: MessageSquare },
    { id: "ai",       label: "AI Config",      icon: ShieldCheck },
    { id: "image",    label: "Image Style",    icon: ImageIcon },
  ];

  const IMAGE_STYLES: Array<{ id: ImageStyle; label: string; description: string; emoji: string }> = [
    { id: "photo",        label: "Photo",        description: "Cinematic editorial photography, natural light", emoji: "📷" },
    { id: "illustration", label: "Illustration",  description: "Soft editorial illustration, warm linework",    emoji: "🎨" },
    { id: "abstract",     label: "Abstract",      description: "Geometric shapes, emotion-driven composition",  emoji: "🔷" },
    { id: "3d",           label: "3D Render",     description: "Volumetric lighting, cinematic quality",        emoji: "🧊" },
    { id: "lineart",      label: "Line Art",      description: "Minimal black ink, clean strokes, no fill",     emoji: "✏️" },
    { id: "bw_photo",     label: "B&W Photo",     description: "High contrast, film grain, desaturated",        emoji: "⬛" },
  ];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Define your brand context for Individual and Corporate profiles.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            hasChanges
              ? "bg-[#0A66C2] text-white hover:bg-[#0854a0] shadow-sm"
              : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
          }`}
        >
          {isSaved ? "✓ Saved" : <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
      </div>

      {/* Disconnected banner */}
      {liJustDisconnected && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-700">LinkedIn disconnected. Click <strong>Connect LinkedIn</strong> to reconnect.</p>
        </div>
      )}

      {/* LinkedIn Connection Card */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#0A66C2] flex items-center justify-center shrink-0">
          <Linkedin className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">LinkedIn Account</p>
            {liConnected ? (
              <span className="flex items-center gap-1 text-[11px] font-medium text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="text-[11px] font-medium text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                Not connected
              </span>
            )}
          </div>
          {liConnected ? (
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {liName}{liEmail ? ` · ${liEmail}` : ""}
              {liExpiry ? ` · Token valid ${Math.max(0, Math.round((liExpiry - Date.now()) / 86400000))}d` : ""}
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-0.5">Connect LinkedIn to enable publishing and engagement tracking.</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {liConnected && (
            <button
              onClick={handleDisconnect}
              disabled={liDisconnecting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {liDisconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          )}
          <button
            onClick={handleReconnect}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-white text-xs font-semibold transition-all shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {liConnected ? "Reconnect" : "Connect LinkedIn"}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="card p-8">

        {/* Profile Switcher */}
        <div className="mb-7 flex items-center justify-between pb-6 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Editing Profile</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Individual = posts written as <span className="font-medium text-slate-600">you personally</span>.
              Corporate = posts written as <span className="font-medium text-slate-600">your company</span>. Each profile is completely separate.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setProfileType("individual")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                profileType === "individual"
                  ? "bg-[#0A66C2] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setProfileType("corporate")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                profileType === "corporate"
                  ? "bg-[#0A66C2] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Corporate
            </button>
          </div>
        </div>

        {/* Tab 1: Identity */}
        {activeTab === "identity" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[12px] text-blue-700 leading-relaxed">
              <strong>This tab tells Neel who you are.</strong> Every post will be written from this identity. The more specific you are here, the more authoritative and grounded your posts will sound.
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>{profileType === "individual" ? "Full Name" : "Company Name"}</label>
                <input value={currentProfile.name} onChange={e => handleFieldChange("name", e.target.value)} className={inputClass} />
                <FieldHint>Used to sign posts and establish who is speaking. Required.</FieldHint>
              </div>
              <div>
                <label className={labelClass}>{profileType === "individual" ? "Current Role" : "Industry"}</label>
                <input value={currentProfile.roleOrIndustry} onChange={e => handleFieldChange("roleOrIndustry", e.target.value)} className={inputClass} />
                <FieldHint>Sets your authority context. E.g. "Energy Consultant", "B2B SaaS Founder".</FieldHint>
              </div>
              <div className="col-span-2">
                <label className={labelClass}>{profileType === "individual" ? "Expertise / Niche" : "Primary Offering"}</label>
                <input
                  value={currentProfile.niche}
                  onChange={e => handleFieldChange("niche", e.target.value)}
                  placeholder={profileType === "individual" ? "e.g. AI Workflow Automation for mid-size manufacturers" : "e.g. Enterprise CRM solutions for logistics companies"}
                  className={inputClass}
                />
                <FieldHint>Neel will stay inside this lane — every post reinforces your authority in this exact space.</FieldHint>
              </div>
              {profileType === "corporate" && (
                <div className="col-span-2">
                  <label className={labelClass}>LinkedIn Organization ID</label>
                  <input
                    value={currentProfile.linkedinOrganizationId || ""}
                    onChange={e => handleFieldChange("linkedinOrganizationId", e.target.value)}
                    placeholder="e.g. 109408305"
                    className={inputClass}
                  />
                  <FieldHint>Found in your LinkedIn Company Page URL: linkedin.com/company/<strong>109408305</strong>/admin. Required for scheduled publishing to your company page.</FieldHint>
                </div>
              )}
              <div className="col-span-2">
                <label className={labelClass}>{profileType === "individual" ? "Personal Bio" : "Company Overview"}</label>
                <textarea value={currentProfile.bioOrOffering} onChange={e => handleFieldChange("bioOrOffering", e.target.value)} rows={4} className={textareaClass}
                  placeholder={profileType === "individual"
                    ? "Tell your story: background, what you do, what you've built or achieved. Be specific — real details create real credibility."
                    : "What your company does, who you serve, what results you deliver. Include founding story or key milestones if relevant."}
                />
                <FieldHint>The richer this is, the more personal and genuine the posts will feel. Neel draws from this — never fabricates beyond it.</FieldHint>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Audience */}
        {activeTab === "audience" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[12px] text-blue-700 leading-relaxed">
              <strong>This tab tells Neel who is reading the post.</strong> Research sub-questions and every insight will be filtered to be relevant to these exact people — not a generic audience.
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-1.5`}>
                Ideal Customer Profile (ICP)
                <HelpTooltip
                  text="ICP = the single most valuable type of person who buys from you. Not everyone — the perfect-fit buyer. Be specific: industry, company size, role, problem they have."
                  example="e.g. Operations managers at mid-size Indian manufacturers (50–500 employees) who overpay for energy and have never done an audit."
                  width="w-80"
                />
                <Target className="w-3 h-3 text-[#0A66C2]" />
              </label>
              <textarea value={currentProfile.icp} onChange={e => handleFieldChange("icp", e.target.value)}
                placeholder="e.g. Founders of B2B SaaS companies at seed to Series A, 10–50 employees, struggling to generate inbound leads from LinkedIn."
                rows={3} className={textareaClass} />
              <FieldHint>The more specific this is, the more your posts will speak directly to the people most likely to engage and buy.</FieldHint>
              <ProfileAIAssist field="icp" value={currentProfile.icp} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("icp", v)} />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className={labelClass}>Target {profileType === "individual" ? "Audience" : "Company"} Stage</label>
                <input value={currentProfile.companyStage} onChange={e => handleFieldChange("companyStage", e.target.value)} placeholder="e.g. Seed to Series B founders" className={inputClass} />
                <FieldHint>Calibrates language — early-stage and enterprise buyers need very different framing.</FieldHint>
                <ProfileAIAssist field="companyStage" value={currentProfile.companyStage} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("companyStage", v)} />
              </div>
              <div>
                <label className={`${labelClass} flex items-center gap-1.5`}>
                  Jobs to be Done (JTBD)
                  <HelpTooltip
                    text="JTBD = the specific outcome your customer is 'hiring' you to achieve. Not what you sell — what problem it solves."
                    example="e.g. 'Cut factory energy costs without capital investment' or 'Get 3 qualified leads per week from LinkedIn without paid ads'"
                    width="w-72"
                  />
                </label>
                <input value={currentProfile.jtbd} onChange={e => handleFieldChange("jtbd", e.target.value)}
                  placeholder="e.g. Reduce energy costs by 15–30% without buying new equipment"
                  className={inputClass} />
                <FieldHint>Neel probes this exact outcome in research — making every post feel like it addresses what your buyer cares about most.</FieldHint>
                <ProfileAIAssist field="jtbd" value={currentProfile.jtbd} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("jtbd", v)} />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Branding */}
        {activeTab === "branding" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[12px] text-blue-700 leading-relaxed">
              <strong>This tab defines your brand lane.</strong> Neel will only write about your content pillars and will weave your USP and personality into every post naturally.
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-1.5`}>
                Content Pillars (3–5 core topics)
                <HelpTooltip
                  text="Content pillars are the 3–5 topic clusters you want to be known for. Every post should reinforce at least one pillar — this builds topical authority on LinkedIn."
                  example="e.g. Energy Efficiency, Manufacturing Operations, Industrial IoT, Cost Reduction"
                  width="w-72"
                />
              </label>
              <input value={currentProfile.pillars} onChange={e => handleFieldChange("pillars", e.target.value)}
                placeholder="e.g. Energy Efficiency, Manufacturing Operations, Sustainability, Cost Reduction"
                className={inputClass} />
              <FieldHint>Separate topics with commas. Neel will stay inside these lanes and never stray into unrelated territory.</FieldHint>
              <ProfileAIAssist field="pillars" value={currentProfile.pillars} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("pillars", v)} />
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-1.5`}>
                Brand Personality / Tone
                <HelpTooltip
                  text="This is layered on top of the post tone you choose when creating. It shapes sentence rhythm, vocabulary, and overall feel across ALL your posts."
                  example="e.g. 'Direct and data-driven with dry wit' or 'Warm and encouraging, never preachy'"
                />
              </label>
              <input value={currentProfile.personality} onChange={e => handleFieldChange("personality", e.target.value)} placeholder="e.g. Authoritative yet conversational — never corporate-speak" className={inputClass} />
              <ProfileAIAssist field="personality" value={currentProfile.personality} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("personality", v)} />
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-1.5`}>
                Unique Selling Proposition
                <HelpTooltip
                  text="What makes you or your company different from a direct competitor? Be specific — generic USPs like 'we care about clients' don't help Neel differentiate your content."
                  example="e.g. 'The only energy auditor in Gujarat who guarantees 15% savings in writing before starting the engagement'"
                  width="w-80"
                />
              </label>
              <textarea value={currentProfile.usp} onChange={e => handleFieldChange("usp", e.target.value)} placeholder="e.g. The only [category] that [specific differentiator] — with [proof]." rows={3} className={textareaClass} />
              <FieldHint>Neel weaves this in naturally — it differentiates your posts from anyone else writing about the same topics.</FieldHint>
              <ProfileAIAssist field="usp" value={currentProfile.usp} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("usp", v)} />
            </div>
          </div>
        )}

        {/* Tab 4: Customer Voice */}
        {activeTab === "voice" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[12px] text-blue-700 leading-relaxed">
              <strong>This is the highest-impact tab for hook quality.</strong> Neel uses your customer's exact language to write hooks that make readers think "this post is written for me."
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-1.5`}>
                Core Pains & Emotional Tensions
                <HelpTooltip
                  text="What does your customer silently worry about? What keeps them from sleeping? The more emotional and specific this is, the more visceral your hooks will be."
                  example="e.g. 'They spend ₹40L/year on energy and have no idea where it goes. They're scared a competitor with lower costs will undercut them.'"
                  width="w-80"
                  position="right"
                />
              </label>
              <textarea value={currentProfile.customerPains} onChange={e => handleFieldChange("customerPains", e.target.value)}
                placeholder="e.g. They worry their energy bill is eating margins but don't know where to start. They've tried audits before that found nothing."
                rows={3} className={textareaClass} />
              <FieldHint>Neel opens these wounds in the hook, then closes them with your solution. The more specific, the more powerful.</FieldHint>
              <ProfileAIAssist field="customerPains" value={currentProfile.customerPains} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("customerPains", v)} />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className={`${labelClass} flex items-center gap-1.5`}>
                  Verbatim Language
                  <HelpTooltip
                    text="The exact words and phrases your customers actually say — from sales calls, DMs, reviews, or conversations. NOT polished language. Raw, real words."
                    example='e.g. "our bills are out of control", "we just guess", "nobody told us about this", "the audit guys found nothing"'
                    width="w-72"
                    position="right"
                  />
                </label>
                <input value={currentProfile.verbatimLanguage} onChange={e => handleFieldChange("verbatimLanguage", e.target.value)}
                  placeholder='e.g. "our bills are crazy", "we just guess", "audit found nothing"'
                  className={inputClass} />
                <FieldHint>Neel weaves these in so readers feel seen. Copied from real conversations = highest resonance.</FieldHint>
                <ProfileAIAssist field="verbatimLanguage" value={currentProfile.verbatimLanguage} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("verbatimLanguage", v)} buttonLabel="Expand with AI" />
              </div>
              <div>
                <label className={`${labelClass} flex items-center gap-1.5`}>
                  Words to Avoid
                  <HelpTooltip
                    text="Words that feel overused, corporate, or misaligned with your brand. Neel will hard-ban these and never use them in your posts."
                    example="e.g. synergy, leverage, paradigm, unlock, disruptive, holistic, empower"
                  />
                </label>
                <input value={currentProfile.wordsToAvoid} onChange={e => handleFieldChange("wordsToAvoid", e.target.value)} placeholder="e.g. synergy, leverage, disruptive, unlock, paradigm..." className={inputClass} />
                <FieldHint>Hard ban — these words will never appear in any post from this profile.</FieldHint>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: AI Config */}
        {activeTab === "ai" && (
          <div className="space-y-6">
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-[12px] text-amber-700 leading-relaxed">
              <strong>Advanced settings.</strong> The defaults work well for most users. Only change the model or system prompt if you have a specific reason — incorrect changes here will affect every future post.
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`${labelClass} flex items-center gap-1.5`}>
                  AI Model
                  <HelpTooltip
                    text="All three models produce high-quality posts. Gemini Flash is fastest and cheapest. Claude Sonnet produces the most natural human writing. GPT-4o is best at structured data-heavy posts."
                    example="Recommended: Gemini Flash for speed, Claude Sonnet for voice quality"
                    width="w-72"
                  />
                </label>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-[#0A66C2] border border-blue-200 font-medium">Per-profile setting</span>
              </div>
              <select
                value={currentProfile.model}
                onChange={(e) => handleFieldChange("model", e.target.value)}
                className={inputClass}
              >
                <option value="google/gemini-2.0-flash-001">Google Gemini 2.0 Flash 001 — fastest, great for most posts</option>
                <option value="anthropic/claude-3.5-sonnet">Anthropic Claude 3.5 Sonnet — best for natural voice & storytelling</option>
                <option value="openai/gpt-4o">OpenAI GPT-4o — best for data-heavy & structured posts</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className={`${labelClass} flex items-center gap-1.5`}>
                  Profile System Prompt
                  <HelpTooltip
                    text="This is appended to Neel's built-in rules for every post in this profile. Use it to add industry-specific rules, recurring narrative themes, or persistent dos and don'ts that apply to ALL your posts."
                    example="e.g. 'Always reference Indian market data when available. Never mention competitor brand names. End every post with a question to the reader.'"
                    width="w-80"
                    position="left"
                  />
                </label>
                <button
                  onClick={() => handleFieldChange("systemPrompt", DEFAULT_SYSTEM_PROMPT)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Reset to default
                </button>
              </div>
              <FieldHint>⚠️ Modifying this affects every future post in this profile. The default is already optimised — only edit if you need persistent custom rules.</FieldHint>
              <div className="relative">
                <textarea
                  value={currentProfile.systemPrompt}
                  onChange={(e) => handleFieldChange("systemPrompt", e.target.value)}
                  rows={12}
                  className={`${textareaClass} font-mono`}
                />
                {currentProfile.systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span className="text-[11px] font-medium text-amber-600">Custom prompt active</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Image Style */}
        {activeTab === "image" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[12px] text-blue-700 leading-relaxed">
              <strong>Image Art Style</strong> — choose the visual language for all AI-generated post images. This style is saved per profile (Individual / Corporate) and auto-applied to every new post. You can always change it per-post on the preview page.
            </div>

            <div className="grid grid-cols-3 gap-3">
              {IMAGE_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => handleFieldChange("imageStyle", style.id)}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                    currentProfile.imageStyle === style.id
                      ? "border-[#0A66C2] bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-2xl">{style.emoji}</span>
                  <div className="flex-1">
                    <p className={`text-xs font-semibold ${currentProfile.imageStyle === style.id ? "text-[#0A66C2]" : "text-slate-700"}`}>
                      {style.label}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{style.description}</p>
                  </div>
                  {currentProfile.imageStyle === style.id && (
                    <span className="text-[10px] font-semibold text-[#0A66C2] bg-blue-100 px-2 py-0.5 rounded-full">
                      ✓ Active
                    </span>
                  )}
                </button>
              ))}
            </div>

            {!currentProfile.imageStyle && (
              <p className="text-[11px] text-slate-400">
                No style selected — Neel will generate images without a style constraint. Select one above and save to lock your visual brand.
              </p>
            )}

            {currentProfile.imageStyle && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-100">
                <span className="text-sm">
                  {IMAGE_STYLES.find(s => s.id === currentProfile.imageStyle)?.emoji}
                </span>
                <p className="text-[12px] text-green-700">
                  <strong>{IMAGE_STYLES.find(s => s.id === currentProfile.imageStyle)?.label}</strong> style will be applied to all future AI-generated images for your {profileType} profile.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
