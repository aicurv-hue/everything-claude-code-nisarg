"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle, Linkedin, User, Sparkles, CalendarDays,
  ArrowRight, ArrowLeft, Settings, BookOpen
} from "lucide-react";
import { useAuth } from "@/lib/context/auth";

const STEPS = [
  {
    badge: "Step 1 of 5",
    icon: <Linkedin className="w-6 h-6 text-[#0A66C2]" />,
    title: "Connect LinkedIn",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>This is the <strong className="text-slate-800">first thing to do</strong> — LinkedIn connection lets the platform auto-publish and schedule posts on your behalf.</p>
        <div className="space-y-2">
          {[
            "From Settings → LinkedIn tab, click Connect LinkedIn",
            "You'll be redirected to LinkedIn's login page",
            "Log in and click Allow to grant posting permission",
            "You'll return with ✅ LinkedIn Connected",
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#0A66C2] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-slate-700">{s}</p>
            </div>
          ))}
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
          <strong>Token stays valid for 365 days</strong> — auto-renews silently. You won't need to reconnect unless you revoke access from LinkedIn.
        </div>
      </div>
    ),
  },
  {
    badge: "Step 2 of 5",
    icon: <User className="w-6 h-6 text-[#0A66C2]" />,
    title: "Set Up Your Profile",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Go to <strong className="text-slate-800">Settings</strong> and fill in your profile. This is what the AI uses to write posts in <em>your voice</em>.</p>
        <div className="space-y-2">
          {[
            { tab: "Identity", desc: "Your name, job title, industry — REQUIRED for AI to know who you are", required: true },
            { tab: "Audience", desc: "Who you're writing for — helps the AI target the right tone" },
            { tab: "Branding", desc: "Your values, positioning, key messages" },
            { tab: "Voice", desc: "Writing style preferences — casual, formal, storytelling" },
            { tab: "AI Config", desc: "Which AI model to use for generation" },
          ].map(({ tab, desc, required }) => (
            <div key={tab} className={`flex items-start gap-3 rounded-xl px-3 py-2 border ${required ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"}`}>
              <span className={`text-xs font-bold w-20 shrink-0 mt-0.5 ${required ? "text-[#0A66C2]" : "text-slate-500"}`}>{tab}</span>
              <div>
                <span className="text-xs text-slate-600">{desc}</span>
                {required && <span className="ml-1.5 text-[10px] bg-[#0A66C2] text-white px-1.5 py-0.5 rounded-full font-semibold">Required</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    badge: "Step 3 of 5",
    icon: <Sparkles className="w-6 h-6 text-[#0A66C2]" />,
    title: "Create Your First Post",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>The AI does the heavy lifting — you just review and approve.</p>
        <div className="space-y-2">
          {[
            { step: "Click Create Post", detail: "In the left sidebar" },
            { step: "Enter a topic + tone", detail: 'e.g. "My leadership lessons" + Professional' },
            { step: "Hit Generate", detail: "AI researches → writes → shows preview" },
            { step: "Edit if needed", detail: "Full editing in the preview — it's your post" },
            { step: "Publish or Schedule", detail: "Publish now, or pick a date & time" },
          ].map(({ step, detail }, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#0A66C2] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <div>
                <p className="font-semibold text-slate-800">{step}</p>
                <p className="text-slate-500 text-xs">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    badge: "Step 4 of 5",
    icon: <CalendarDays className="w-6 h-6 text-[#0A66C2]" />,
    title: "Schedule & Automate",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Plan weeks of content in advance — the platform publishes automatically at the right time.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Single Post", desc: "Create → Preview → Schedule → pick date & time" },
            { label: "Bulk Upload", desc: "Upload a CSV with up to 500 posts at once" },
            { label: "Content Calendar", desc: "See all posts color-coded by status" },
            { label: "AI Best Times", desc: "AI suggests best posting times based on your history" },
          ].map(({ label, desc }) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="font-semibold text-slate-800 text-xs">{label}</p>
              <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-[#0A66C2]">
          Posts publish automatically at their scheduled time — no action needed from you.
        </div>
      </div>
    ),
  },
  {
    badge: "Step 5 of 5",
    icon: <CheckCircle className="w-6 h-6 text-green-600" />,
    title: "You're Ready!",
    body: (
      <div className="space-y-4 text-sm text-slate-600">
        <p>You now know everything to get started. Here's your quick checklist before your first post:</p>
        <div className="space-y-2">
          {[
            "Connect LinkedIn in Settings",
            "Fill in your name and identity in Settings → Identity",
            "Pick a topic and generate your first post",
            "Review, edit, and schedule it",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="w-4 h-4 rounded border-2 border-slate-300 shrink-0" />
              <span className="text-slate-700 text-xs">{item}</span>
            </div>
          ))}
        </div>
        <div className="bg-gradient-to-r from-[#0A66C2]/10 to-indigo-50 border border-[#0A66C2]/20 rounded-xl p-3 text-xs text-[#0A66C2]">
          <strong>Click "Go to Settings"</strong> below to complete your profile setup — it takes 2 minutes.
        </div>
      </div>
    ),
  },
];

export default function OnboardingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);

  // If not logged in, send to login
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleDone = () => {
    // Mark onboarding as seen
    if (user) localStorage.setItem(`cridl_guide_seen_${user.uid}`, "1");
    router.replace("/dashboard/settings");
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A66C2] to-[#0854a0] flex items-center justify-center">
          <span className="text-white font-bold text-sm">L</span>
        </div>
        <span className="text-slate-900 font-bold text-lg tracking-tight">Cridl</span>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-6 pt-5 pb-4 border-b border-slate-100">
          <BookOpen className="w-5 h-5 text-[#0A66C2]" />
          <span className="font-bold text-slate-900 text-sm">Getting Started — Welcome to Cridl</span>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-6 pt-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? "bg-[#0A66C2]" : "bg-slate-200"}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 py-5 min-h-[340px]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              {current.icon}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#0A66C2] uppercase tracking-wide">{current.badge}</p>
              <h2 className="text-base font-bold text-slate-900">{current.title}</h2>
            </div>
          </div>
          {current.body}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5 pt-3 border-t border-slate-100">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs text-slate-400">{step + 1} / {STEPS.length}</span>
          {isLast ? (
            <button
              onClick={handleDone}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-semibold transition-all"
            >
              <Settings className="w-4 h-4" /> Go to Settings
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-semibold transition-all"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-4">
        You can re-read this guide anytime from the{" "}
        <span className="text-slate-600 font-medium">sidebar → Guide</span>
      </p>
    </div>
  );
}
