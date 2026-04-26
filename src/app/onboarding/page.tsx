"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Wand2, ShieldCheck, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

type ExtractedProfile = {
  name?: string;
  roleOrIndustry?: string;
  niche?: string;
  bioOrOffering?: string;
  icp?: string;
  pillars?: string;
  personality?: string;
  usp?: string;
  verbatimLanguage?: string;
};

const FIELD_LABELS: Record<keyof ExtractedProfile, string> = {
  name: "Your name",
  roleOrIndustry: "Role / Industry",
  niche: "Niche",
  bioOrOffering: "What you do",
  icp: "Ideal audience",
  pillars: "Content pillars",
  personality: "Voice & tone",
  usp: "Unique angle",
  verbatimLanguage: "Phrases you use",
};

const FIELD_ORDER: (keyof ExtractedProfile)[] = [
  "name", "roleOrIndustry", "niche", "bioOrOffering", "icp", "pillars", "personality", "usp", "verbatimLanguage",
];

const MULTILINE_FIELDS: Set<keyof ExtractedProfile> = new Set(["bioOrOffering", "icp", "usp"]);

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stage, setStage] = useState<"paste" | "review">("paste");
  const [pasted, setPasted] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ExtractedProfile>({});

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  function markSeenAndGo(target: string) {
    if (user) localStorage.setItem(`cridl_guide_seen_${user.uid}`, "1");
    router.replace(target);
  }

  async function handleExtract() {
    if (pasted.trim().length < 30) {
      setError("Paste at least your headline and a couple of lines from About.");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/onboarding/extract-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: pasted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const extracted: ExtractedProfile = data.profile || {};
      if (!Object.keys(extracted).length) {
        setError("Couldn't extract enough detail. Try pasting more of your About section, or skip and fill it in Settings.");
        return;
      }
      setProfile(extracted);
      setStage("review");
    } catch (err: any) {
      console.error("[onboarding] extract failed", err);
      setError(err.message || "Extraction failed. Try again or skip.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const cleaned: Record<string, string> = {};
      for (const k of FIELD_ORDER) {
        const v = profile[k]?.trim();
        if (v) cleaned[k] = v;
      }
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          profile: { individual: cleaned, lastActiveSegment: "individual" },
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Save failed: HTTP ${res.status}`);
      }
      markSeenAndGo("/dashboard");
    } catch (err: any) {
      console.error("[onboarding] save failed", err);
      setError(err.message || "Save failed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center p-4 py-10">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-6">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A66C2] to-[#0854a0] flex items-center justify-center">
          <span className="text-white font-bold text-sm">C</span>
        </div>
        <span className="text-[var(--foreground)] font-bold text-lg tracking-tight">Cridl</span>
      </div>

      <div className="w-full max-w-xl bg-[var(--card)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-[10px] font-semibold text-[var(--primary)] uppercase tracking-wide">
              {stage === "paste" ? "60-second setup" : "Review & save"}
            </span>
          </div>
          <h1 className="text-lg font-bold text-[var(--foreground)]">
            {stage === "paste" ? "Bring your LinkedIn into Cridl" : "Looks right? Tweak anything you want."}
          </h1>
          <p className="text-xs text-[var(--text-sub)] mt-1">
            {stage === "paste"
              ? "Paste your LinkedIn headline and About section. Cortex will turn it into a brand profile so the AI can write in your voice from post #1."
              : "These fields drive your AI ghostwriter. Edit any of them — you can always change them later in Settings."}
          </p>
        </div>

        {error && (
          <div className="mx-6 mt-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-800/40 text-red-400 text-xs">
            {error}
          </div>
        )}

        {stage === "paste" ? (
          <div className="p-6">
            <div className="mb-4 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--text-sub)] space-y-2">
              <div className="flex items-start gap-2">
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--primary)]" />
                <span>
                  Open your LinkedIn profile → copy your <strong className="text-[var(--foreground)]">headline</strong> and{" "}
                  <strong className="text-[var(--foreground)]">About</strong> section. Paste both below — the more context, the sharper the result.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                <span>You're pasting your own public content. Nothing is scraped — fully compliant with LinkedIn's terms.</span>
              </div>
            </div>

            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={10}
              maxLength={8000}
              placeholder={`e.g.\nHeadline: Founder @ Acme — helping B2B SaaS teams ship onboarding that actually converts.\n\nAbout: I've spent 8 years building activation loops for early-stage SaaS. Today I work with seed/Series A teams on...`}
              className="w-full px-3 py-2.5 text-sm bg-[var(--input)] border border-[var(--input-border)] rounded-lg text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 resize-none"
              autoFocus
            />
            <div className="flex justify-between mt-1">
              <span className="text-[11px] text-[var(--text-muted)]">Tip: include your About — that's where your voice lives.</span>
              <span className="text-[11px] text-[var(--text-muted)]">{pasted.length}/8000</span>
            </div>

            <div className="flex items-center justify-between gap-2 mt-5">
              <button
                onClick={() => markSeenAndGo("/dashboard")}
                disabled={extracting}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-50"
              >
                Skip — I'll fill it in later
              </button>
              <button
                onClick={handleExtract}
                disabled={extracting || pasted.trim().length < 30}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                <Wand2 className="w-4 h-4" />
                {extracting ? "Analyzing..." : "Extract my profile"}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {FIELD_ORDER.map((key) => {
                const value = profile[key] ?? "";
                const isMulti = MULTILINE_FIELDS.has(key);
                return (
                  <div key={key}>
                    <label className="text-[11px] font-semibold text-[var(--text-sub)] uppercase tracking-wide block mb-1">
                      {FIELD_LABELS[key]}
                    </label>
                    {isMulti ? (
                      <textarea
                        value={value}
                        onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 text-sm bg-[var(--input)] border border-[var(--input-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 resize-none"
                      />
                    ) : (
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full px-3 py-2 text-sm bg-[var(--input)] border border-[var(--input-border)] rounded-lg text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 mt-5 pt-4 border-t border-[var(--border)]">
              <button
                onClick={() => { setStage("paste"); setError(null); }}
                disabled={saving}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] disabled:opacity-50"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => markSeenAndGo("/dashboard")}
                  disabled={saving}
                  className="px-3 py-2 text-xs font-medium border border-[var(--border)] rounded-lg text-[var(--text-sub)] hover:bg-[var(--card-hover)] disabled:opacity-50"
                >
                  Skip
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--primary)] hover:opacity-90 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : (
                    <>
                      Save & enter dashboard <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)] mt-4">
        You can connect LinkedIn and refine your profile anytime from Settings.
      </p>
    </div>
  );
}
