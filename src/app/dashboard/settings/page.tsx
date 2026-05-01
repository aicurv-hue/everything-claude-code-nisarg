"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
  Camera,
  Upload,
  Sun,
  Moon,
  Wand2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { UserProfile, ProfileSegment, ImageStyle } from "@/lib/db/profiles";
import { useAuth } from "@/lib/context/auth";
import { useTheme } from "@/lib/context/theme";
import { HelpTooltip, FieldHint } from "@/components/ui/HelpTooltip";
import { ProfileAIAssist } from "@/components/ui/ProfileAIAssist";

const DEFAULT_SYSTEM_PROMPT = `You are a world-class marketing copywriter and content strategist.
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
  model: "google/gemini-2.5-flash",
  systemPrompt: DEFAULT_SYSTEM_PROMPT
};

const inputClass = "w-full bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all text-sm";
const textareaClass = `${inputClass} resize-none leading-relaxed`;
const labelClass = "block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5";

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "identity";
  const [activeTab, setActiveTab]   = useState(initialTab);

  // LinkedIn paste-import state (per segment)
  const [importPaste, setImportPaste] = useState("");
  const [importExtracting, setImportExtracting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
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
  const [liError, setLiError] = useState<string | null>(null);

  // Plan state (for feature gating)
  const [userPlan, setUserPlan] = useState<string>("free");

  // Profile photo state (Individual only)
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoValidation, setPhotoValidation] = useState<{ quality: string; message: string } | null>(null);
  const [photoHasFace, setPhotoHasFace] = useState<boolean | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Load LinkedIn status once Firebase auth is ready
  useEffect(() => {
    if (!user) return;
    getAuthToken().then(tok =>
      fetch("/api/linkedin/status", tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})
        .then(r => r.json())
        .then(d => {
          setLiConnected(d.connected);
          setLiName(d.name || "");
          setLiEmail(d.email || "");
          setLiExpiry(d.tokenDaysLeft ? Date.now() + d.tokenDaysLeft * 86400000 : null);
        })
        .catch(() => {})
    );
  }, [user]);

  const refreshLinkedInStatus = () => {
    getAuthToken().then(tok =>
      fetch("/api/linkedin/status", tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})
        .then(r => r.json())
        .then(d => {
          setLiConnected(d.connected);
          setLiName(d.name || "");
          setLiEmail(d.email || "");
          setLiExpiry(d.tokenDaysLeft ? Date.now() + d.tokenDaysLeft * 86400000 : null);
        })
        .catch(() => {})
    );
  };

  // B4: Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasChanges]);

  // Listen for postMessage from OAuth popup (popup flow keeps main window alive — no Firebase auth loss)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "linkedin_connected") {
        refreshLinkedInStatus();
      }
      if (e.data?.type === "linkedin_error") {
        setLiError(e.data.message || "LinkedIn connection failed — please try again");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Handle direct redirect (non-popup fallback): check URL param; wait for Firebase user before refreshing status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("linkedin_error")) {
      const msg = decodeURIComponent(params.get("linkedin_error")!);
      setLiError(msg);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("linkedin_connected") === "true") {
      window.history.replaceState({}, "", window.location.pathname);
      if (user) {
        refreshLinkedInStatus();
      } else {
        // Firebase not ready yet — status useEffect with [user] dep will fire once user loads
      }
    }
  }, [user]);

  const handleReconnect = () => {
    if (!user?.uid) {
      alert("Still loading your account — please wait a moment and try again.");
      return;
    }
    const oauthUrl = `/api/auth/linkedin?returnTo=/dashboard/settings&uid=${encodeURIComponent(user.uid)}`;
    // Open in a popup so the main window (and Firebase auth) stays alive.
    // If popup is blocked by the browser, fall back to a full-page redirect.
    const popup = window.open(oauthUrl, "linkedin-oauth", "width=620,height=720,scrollbars=yes,resizable=yes");
    if (!popup || popup.closed || typeof popup.closed === "undefined") {
      // Popup blocked — fall back to full redirect
      window.location.href = oauthUrl;
    }
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
          if (cloudProfile.profilePhotoUrl) {
            setProfilePhoto(cloudProfile.profilePhotoUrl);
            setPhotoHasFace(cloudProfile.profilePhotoHasFace ?? true);
          }
        }
        // Fetch plan for feature gating
        fetch("/api/subscriptions/status", { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(d => setUserPlan(d.plan || "free"))
          .catch(() => {});
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
    localStorage.setItem("ai_model", segments[profileType].model || "google/gemini-2.5-flash");
    localStorage.setItem("system_prompt", segments[profileType].systemPrompt || DEFAULT_SYSTEM_PROMPT);
    localStorage.setItem("client_profile", JSON.stringify({ ...segments[profileType], profileType }));
    setIsSaved(true);
    setHasChanges(false);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleImportExtract = async () => {
    setImportError(null);
    setImportSuccess(null);
    if (importPaste.trim().length < 30) {
      setImportError("Paste at least your headline and a few lines from About.");
      return;
    }
    setImportExtracting(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/onboarding/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: importPaste, mode: profileType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const extracted: Record<string, string> = data.profile || {};
      const keys = Object.keys(extracted);
      if (!keys.length) {
        setImportError("Couldn't extract enough detail. Try pasting more of your About section.");
        return;
      }
      setSegments((prev) => ({
        ...prev,
        [profileType]: { ...prev[profileType], ...extracted },
      }));
      setHasChanges(true);
      setImportSuccess(`Filled ${keys.length} field${keys.length === 1 ? "" : "s"}. Review them in the tabs below, then click Save Changes.`);
      setImportPaste("");
      setTimeout(() => setActiveTab("identity"), 600);
    } catch (err: any) {
      console.error("[settings] import extract failed", err);
      setImportError(err.message || "Extraction failed. Try again.");
    } finally {
      setImportExtracting(false);
    }
  };

  const handleFieldChange = (field: keyof ProfileSegment, value: string) => {
    setSegments(prev => ({
      ...prev,
      [profileType]: { ...prev[profileType], [field]: value }
    }));
    setHasChanges(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setPhotoUploading(true);
    setPhotoValidation(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;

      // 1. Validate face via API
      const token = await getAuthToken();
      const validRes = await fetch("/api/image/validate-face", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ imageBase64: dataUrl }),
      }).catch(() => null);

      let hasFace = true;
      if (validRes?.ok) {
        const vd = await validRes.json();
        hasFace = vd.hasFace === true;
        setPhotoHasFace(hasFace);
        setPhotoValidation({ quality: vd.quality, message: vd.message });
      }

      // 2. Upload to Firebase Storage
      const { uploadProfilePhotoToStorage } = await import("@/lib/storage/uploadImage");
      const url = await uploadProfilePhotoToStorage(dataUrl, user.uid);

      if (url) {
        setProfilePhoto(url);
        if (token) {
          await fetch("/api/profiles", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              profile: {
                lastActiveSegment: profileType,
                individual: segments.individual,
                corporate: segments.corporate,
                profilePhotoUrl: url,
                profilePhotoHasFace: hasFace,
              },
            }),
          });
        }
      }
      setPhotoUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const currentProfile = segments[profileType];

  const tabs = [
    { id: "import",   label: "Import",   icon: Linkedin },
    { id: "identity", label: "Identity", icon: User },
    { id: "audience", label: "Audience", icon: Users },
    { id: "branding", label: "Branding", icon: Palette },
    { id: "voice",    label: "Voice",    icon: MessageSquare },
    { id: "ai",       label: "AI",       icon: ShieldCheck },
    { id: "image",    label: "Image",    icon: ImageIcon },
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
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Profile</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Define your brand context for Individual and Corporate profiles.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--card)] text-[var(--text-sub)] hover:text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-all"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              hasChanges
                ? "bg-[var(--primary)] text-white hover:opacity-90 shadow-sm"
                : "bg-[var(--toggle-bg)] text-[var(--text-muted)] border border-[var(--border)] cursor-not-allowed"
            }`}
          >
            {isSaved ? "✓ Saved" : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* LinkedIn OAuth error banner */}
      {liError && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-800/40">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-400">LinkedIn connection failed</p>
            <p className="text-xs text-red-400 mt-0.5">{liError}</p>
          </div>
          <button onClick={() => setLiError(null)} className="text-red-400 hover:text-red-400 text-xs font-medium">Dismiss</button>
        </div>
      )}

      {/* Disconnected banner */}
      {liJustDisconnected && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-800/40">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-400">LinkedIn disconnected. Click <strong>Connect LinkedIn</strong> to reconnect.</p>
        </div>
      )}

      {/* LinkedIn Connection Card */}
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center shrink-0">
            <Linkedin className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">LinkedIn Account</p>
              {liConnected ? (
                <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-800/40 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              ) : (
                <span className="text-[11px] font-medium text-red-500 bg-red-500/10 border border-red-800/40 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Not connected
                </span>
              )}
            </div>
            {liConnected ? (
              <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                {liName}{liEmail ? ` · ${liEmail}` : ""}
                {liExpiry ? ` · Token valid ${Math.max(0, Math.round((liExpiry - Date.now()) / 86400000))}d` : ""}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Connect LinkedIn to enable publishing.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {liConnected && (
            <button
              onClick={handleDisconnect}
              disabled={liDisconnecting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-800/40 text-red-400 text-xs font-semibold transition-all disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {liDisconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          )}
          <button
            onClick={handleReconnect}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-xs font-semibold transition-all shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {liConnected ? "Reconnect" : "Connect LinkedIn"}
          </button>
        </div>
      </div>

      {/* Tab bar — single line, no scroll, equal-width */}
      <div className="flex gap-1 p-1 bg-[var(--toggle-bg)] border border-[var(--border)] rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[13px] font-medium transition-all ${
              activeTab === tab.id
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]"
                : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Card */}
      <div className="card p-8">

        {/* Profile Switcher */}
        <div className="mb-7 flex items-center justify-between pb-6 border-b border-[var(--border-sub)]">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Editing Profile</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Individual = posts written as <span className="font-medium text-[var(--text-sub)]">you personally</span>.
              Corporate = posts written as <span className="font-medium text-[var(--text-sub)]">your company</span>. Each profile is completely separate.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-[var(--toggle-bg)] rounded-lg border border-[var(--border)]">
            <button
              onClick={() => setProfileType("individual")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                profileType === "individual"
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Individual
            </button>
            <button
              onClick={() => setProfileType("corporate")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                profileType === "corporate"
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              Corporate
            </button>
          </div>
        </div>

        {/* Tab 0: LinkedIn Import */}
        {activeTab === "import" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-500/10 border border-blue-100 rounded-lg text-[12px] text-blue-400 leading-relaxed">
              <strong>Auto-fill your profile from LinkedIn.</strong>{" "}
              {profileType === "individual"
                ? "Paste your LinkedIn headline + About section. Cortex will extract your role, niche, ICP, voice, and pillars — populating Identity, Audience, Branding, and Voice tabs in seconds."
                : "Paste your company's LinkedIn page tagline + About us + specialties. Cortex will extract your industry, offering, target customer, and brand voice — populating Identity, Audience, Branding, and Voice tabs."}
            </div>

            <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card-hover)] space-y-2 text-xs text-[var(--text-muted)] leading-relaxed">
              <div className="flex items-start gap-2">
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--primary)]" />
                <span>
                  {profileType === "individual" ? (
                    <>Open your LinkedIn profile → copy your <strong className="text-[var(--foreground)]">headline</strong> and <strong className="text-[var(--foreground)]">About</strong> section. The more context, the sharper Cortex's writing.</>
                  ) : (
                    <>Open your <strong className="text-[var(--foreground)]">LinkedIn Company Page</strong> → copy the <strong className="text-[var(--foreground)]">tagline</strong>, <strong className="text-[var(--foreground)]">About us</strong>, and <strong className="text-[var(--foreground)]">Specialties</strong>. Paste them all below.</>
                  )}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                <span>You're pasting your own public content. Nothing is scraped — fully compliant with LinkedIn's terms.</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                <span>Existing fields will be overwritten by extracted values. Empty fields stay empty. You can edit everything before saving.</span>
              </div>
            </div>

            {importError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-800/40 text-red-400 text-xs">
                {importError}
              </div>
            )}
            {importSuccess && (
              <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-800/40 text-emerald-400 text-xs">
                ✓ {importSuccess}
              </div>
            )}

            <div>
              <label className={labelClass}>
                {profileType === "individual" ? "Paste headline + About" : "Paste tagline + About us + Specialties"}
              </label>
              <textarea
                value={importPaste}
                onChange={(e) => setImportPaste(e.target.value)}
                rows={10}
                maxLength={8000}
                placeholder={profileType === "individual"
                  ? `e.g.\nHeadline: Founder @ Acme — helping B2B SaaS teams ship onboarding that actually converts.\n\nAbout: I've spent 8 years building activation loops for early-stage SaaS. Today I work with seed/Series A teams on...`
                  : `e.g.\nTagline: AI-powered onboarding for B2B SaaS.\n\nAbout us: Acme builds activation loops that turn free signups into paying customers. We work with seed to Series B SaaS teams...\n\nSpecialties: SaaS onboarding, activation, product-led growth, lifecycle marketing`}
                className={`${textareaClass} font-mono text-[13px]`}
                style={{ minHeight: 220 }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[11px] text-[var(--text-muted)]">
                  Tip: include the full About — that's where your voice lives.
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">{importPaste.length}/8000</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleImportExtract}
                disabled={importExtracting || importPaste.trim().length < 30}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                <Wand2 className="w-4 h-4" />
                {importExtracting ? "Analyzing..." : "Extract & fill profile"}
              </button>
            </div>
          </div>
        )}

        {/* Tab 1: Identity */}
        {activeTab === "identity" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-500/10 border border-blue-100 rounded-lg text-[12px] text-blue-400 leading-relaxed">
              <strong>This tab tells Cortex who you are.</strong> Every post will be written from this identity. The more specific you are here, the more authoritative and grounded your posts will sound.
            </div>

            {/* Profile Photo — Individual only */}
            {profileType === "individual" && (
              <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--card-hover)] space-y-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[var(--primary)]" />
                  <p className="text-sm font-semibold text-[var(--foreground)]">Profile Photo for AI Face Images</p>
                </div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Upload a clear headshot to enable &quot;Use My Face&quot; image generation on posts.{" "}
                  <strong>Requirements:</strong> Face forward, good lighting, no sunglasses, plain or simple background. A professional headshot works best.
                </p>

                {profilePhoto ? (
                  <div className="flex items-center gap-4">
                    <img src={profilePhoto} className="w-16 h-16 rounded-full object-cover border-2 border-[#0A66C2]/30" alt="Profile headshot" />
                    <div className="flex-1">
                      {photoValidation && (
                        <div className={`text-xs px-3 py-1.5 rounded-lg mb-2 ${
                          photoHasFace ? "bg-emerald-500/10 text-emerald-400 border border-emerald-800/40" : "bg-amber-500/10 text-amber-400 border border-amber-800/40"
                        }`}>
                          {photoHasFace ? "✓ " : "⚠ "}{photoValidation.message}
                        </div>
                      )}
                      {!photoValidation && photoHasFace !== null && (
                        <div className={`text-xs px-3 py-1.5 rounded-lg mb-2 ${
                          photoHasFace ? "bg-emerald-500/10 text-emerald-400 border border-emerald-800/40" : "bg-amber-500/10 text-amber-400 border border-amber-800/40"
                        }`}>
                          {photoHasFace ? "✓ Face verified" : "⚠ No clear face detected"}
                        </div>
                      )}
                      <button onClick={() => photoInputRef.current?.click()} className="text-xs text-[var(--primary)] hover:underline font-medium">
                        Change photo
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photoUploading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-slate-300 hover:border-[#0A66C2] bg-[var(--card)] text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-all w-full justify-center disabled:opacity-50"
                  >
                    {photoUploading ? (
                      <><div className="w-4 h-4 border-2 border-[#0A66C2]/30 border-t-[#0A66C2] rounded-full animate-spin" /> Uploading...</>
                    ) : (
                      <><Upload className="w-4 h-4" /> Upload headshot</>
                    )}
                  </button>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
            )}

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
                <FieldHint>Cortex will stay inside this lane — every post reinforces your authority in this exact space.</FieldHint>
              </div>
              {profileType === "corporate" && (
                <div className="col-span-2">
                  <label className={labelClass}>LinkedIn Organization ID</label>
                  {userPlan === "free" || userPlan === "starter" ? (
                    <div className="w-full bg-[var(--card-hover)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-muted)] flex items-center gap-2">
                      <span>🔒</span>
                      <span>
                        Pro plan required to connect a company page.{" "}
                        <a href="/#pricing" className="text-[var(--primary)] hover:underline font-medium">Upgrade</a>
                      </span>
                    </div>
                  ) : (
                    <input
                      value={currentProfile.linkedinOrganizationId || ""}
                      onChange={e => handleFieldChange("linkedinOrganizationId", e.target.value)}
                      placeholder="e.g. 109408305"
                      className={inputClass}
                    />
                  )}
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
                <FieldHint>The richer this is, the more personal and genuine the posts will feel. Cortex draws from this — never fabricates beyond it.</FieldHint>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Audience */}
        {activeTab === "audience" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-500/10 border border-blue-100 rounded-lg text-[12px] text-blue-400 leading-relaxed">
              <strong>This tab tells Cortex who is reading the post.</strong> Research sub-questions and every insight will be filtered to be relevant to these exact people — not a generic audience.
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-1.5`}>
                Ideal Customer Profile (ICP)
                <HelpTooltip
                  text="ICP = the single most valuable type of person who buys from you. Not everyone — the perfect-fit buyer. Be specific: industry, company size, role, problem they have."
                  example="e.g. Operations managers at mid-size Indian manufacturers (50–500 employees) who overpay for energy and have never done an audit."
                  width="w-80"
                />
                <Target className="w-3 h-3 text-[var(--primary)]" />
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
                <FieldHint>Cortex probes this exact outcome in research — making every post feel like it addresses what your buyer cares about most.</FieldHint>
                <ProfileAIAssist field="jtbd" value={currentProfile.jtbd} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("jtbd", v)} />
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Branding */}
        {activeTab === "branding" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-500/10 border border-blue-100 rounded-lg text-[12px] text-blue-400 leading-relaxed">
              <strong>This tab defines your brand lane.</strong> Cortex will only write about your content pillars and will weave your USP and personality into every post naturally.
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
              <FieldHint>Separate topics with commas. Cortex will stay inside these lanes and never stray into unrelated territory.</FieldHint>
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
                  text="What makes you or your company different from a direct competitor? Be specific — generic USPs like 'we care about clients' don't help Cortex differentiate your content."
                  example="e.g. 'The only energy auditor in Gujarat who guarantees 15% savings in writing before starting the engagement'"
                  width="w-80"
                />
              </label>
              <textarea value={currentProfile.usp} onChange={e => handleFieldChange("usp", e.target.value)} placeholder="e.g. The only [category] that [specific differentiator] — with [proof]." rows={3} className={textareaClass} />
              <FieldHint>Cortex weaves this in naturally — it differentiates your posts from anyone else writing about the same topics.</FieldHint>
              <ProfileAIAssist field="usp" value={currentProfile.usp} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("usp", v)} />
            </div>
          </div>
        )}

        {/* Tab 4: Customer Voice */}
        {activeTab === "voice" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-500/10 border border-blue-100 rounded-lg text-[12px] text-blue-400 leading-relaxed">
              <strong>This is the highest-impact tab for hook quality.</strong> Cortex uses your customer's exact language to write hooks that make readers think "this post is written for me."
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
              <FieldHint>Cortex opens these wounds in the hook, then closes them with your solution. The more specific, the more powerful.</FieldHint>
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
                <FieldHint>Cortex weaves these in so readers feel seen. Copied from real conversations = highest resonance.</FieldHint>
                <ProfileAIAssist field="verbatimLanguage" value={currentProfile.verbatimLanguage} context={currentProfile as unknown as Record<string,string>} profileType={profileType} onApply={v => handleFieldChange("verbatimLanguage", v)} buttonLabel="Expand with AI" />
              </div>
              <div>
                <label className={`${labelClass} flex items-center gap-1.5`}>
                  Words to Avoid
                  <HelpTooltip
                    text="Words that feel overused, corporate, or misaligned with your brand. Cortex will hard-ban these and never use them in your posts."
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
            <div className="p-3 bg-amber-500/10 border border-amber-100 rounded-lg text-[12px] text-amber-400 leading-relaxed">
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
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-blue-500/10 text-[var(--primary)] border border-blue-800/40 font-medium">Per-profile setting</span>
              </div>
              <select
                value={currentProfile.model}
                onChange={(e) => handleFieldChange("model", e.target.value)}
                className={inputClass}
              >
                <option value="google/gemini-2.5-flash">Gemini 2.5 Flash — fast, smart, reliable</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className={`${labelClass} flex items-center gap-1.5`}>
                  Profile System Prompt
                  <HelpTooltip
                    text="This is appended to Cortex's built-in rules for every post in this profile. Use it to add industry-specific rules, recurring narrative themes, or persistent dos and don'ts that apply to ALL your posts."
                    example="e.g. 'Always reference Indian market data when available. Never mention competitor brand names. End every post with a question to the reader.'"
                    width="w-80"
                    position="left"
                  />
                </label>
                <button
                  onClick={() => handleFieldChange("systemPrompt", DEFAULT_SYSTEM_PROMPT)}
                  className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
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
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-amber-500/10 border border-amber-800/40 px-2.5 py-1 rounded-md">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span className="text-[11px] font-medium text-amber-400">Custom prompt active</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Image Style */}
        {activeTab === "image" && (
          <div className="space-y-5">
            <div className="p-3 bg-blue-500/10 border border-blue-100 rounded-lg text-[12px] text-blue-400 leading-relaxed">
              <strong>Image Art Style</strong> — choose the visual language for all AI-generated post images. This style is saved per profile (Individual / Corporate) and auto-applied to every new post. You can always change it per-post on the preview page.
            </div>

            <div className="grid grid-cols-3 gap-3">
              {IMAGE_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => handleFieldChange("imageStyle", style.id)}
                  className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                    currentProfile.imageStyle === style.id
                      ? "border-[#0A66C2] bg-blue-500/10"
                      : "border-[var(--border)] bg-[var(--card)] hover:border-slate-300 hover:bg-[var(--card-hover)]"
                  }`}
                >
                  <span className="text-2xl">{style.emoji}</span>
                  <div className="flex-1">
                    <p className={`text-xs font-semibold ${currentProfile.imageStyle === style.id ? "text-[var(--primary)]" : "text-[var(--foreground)]"}`}>
                      {style.label}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">{style.description}</p>
                  </div>
                  {currentProfile.imageStyle === style.id && (
                    <span className="text-[10px] font-semibold text-[var(--primary)] bg-blue-500/20 px-2 py-0.5 rounded-full">
                      ✓ Active
                    </span>
                  )}
                </button>
              ))}
            </div>

            {!currentProfile.imageStyle && (
              <p className="text-[11px] text-[var(--text-muted)]">
                No style selected — Cortex will generate images without a style constraint. Select one above and save to lock your visual brand.
              </p>
            )}

            {currentProfile.imageStyle && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-green-100">
                <span className="text-sm">
                  {IMAGE_STYLES.find(s => s.id === currentProfile.imageStyle)?.emoji}
                </span>
                <p className="text-[12px] text-emerald-400">
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
