"use client";

import { useState } from "react";
import {
  CheckCircle, Linkedin, User, FileText, CalendarDays,
  ArrowRight, ArrowLeft, X, Sparkles, BookOpen
} from "lucide-react";

interface Step {
  icon: React.ReactNode;
  title: string;
  badge: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    icon: <CheckCircle className="w-6 h-6 text-[#0A66C2]" />,
    title: "Get Beta Access",
    badge: "Step 1",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>LinkAuto is currently in <strong className="text-slate-800">closed beta</strong>. Your email must be approved before you can use the platform.</p>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
          <p className="font-semibold text-[#0A66C2] text-xs uppercase tracking-wide">How to get access</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-700">
            <li>Contact the admin (Nisarg) with your email</li>
            <li>Your email gets added to the approved list</li>
            <li>You can now sign up and log in</li>
          </ol>
        </div>
        <p className="text-slate-500 text-xs">If you see a <em>"Beta access required"</em> message after signing up, your email isn't approved yet.</p>
      </div>
    ),
  },
  {
    icon: <User className="w-6 h-6 text-[#0A66C2]" />,
    title: "Create Your Account",
    badge: "Step 2",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Sign up with your <strong className="text-slate-800">email and password</strong>. No Google or social login required.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Go to portal URL", desc: "linkedin-automation-chi.vercel.app" },
            { label: "Click Sign Up", desc: "Enter email + password" },
            { label: "Beta check", desc: "Auto-verified against approved list" },
            { label: "Land on Dashboard", desc: "You're in — start creating" },
          ].map((item) => (
            <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="font-semibold text-slate-800 text-xs">{item.label}</p>
              <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: <Linkedin className="w-6 h-6 text-[#0A66C2]" />,
    title: "Connect LinkedIn",
    badge: "Step 3",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Required to <strong className="text-slate-800">schedule and auto-publish</strong> posts to your LinkedIn profile.</p>
        <div className="space-y-2">
          {[
            "From the Dashboard, click Connect LinkedIn (top banner)",
            "Or go to Settings → LinkedIn tab",
            "You'll be redirected to LinkedIn's login page",
            "Log in and click Allow to grant posting permission",
            "You'll return to Settings with ✅ LinkedIn Connected",
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#0A66C2] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-slate-700">{step}</p>
            </div>
          ))}
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
          <strong>Stays connected for 365 days</strong> — no need to reconnect unless you revoke access from LinkedIn.
        </div>
      </div>
    ),
  },
  {
    icon: <User className="w-6 h-6 text-[#0A66C2]" />,
    title: "Set Up Your Profile",
    badge: "Step 4",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Go to <strong className="text-slate-800">Settings</strong> and fill in your 5 profile tabs. This is what the AI uses to write posts in <em>your voice</em>.</p>
        <div className="space-y-2">
          {[
            { tab: "Identity", desc: "Name, job title, industry" },
            { tab: "Audience", desc: "Who you're writing for" },
            { tab: "Branding", desc: "Tone, values, positioning" },
            { tab: "Voice", desc: "Writing style preferences" },
            { tab: "AI Config", desc: "Which AI model to use" },
          ].map(({ tab, desc }) => (
            <div key={tab} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="text-xs font-bold text-[#0A66C2] w-20 shrink-0">{tab}</span>
              <span className="text-xs text-slate-600">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: <Sparkles className="w-6 h-6 text-[#0A66C2]" />,
    title: "Create Your First Post",
    badge: "Step 5",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>The AI does the heavy lifting — you just review and approve.</p>
        <div className="space-y-2">
          {[
            { step: "Click Create Post", detail: "In the left sidebar" },
            { step: "Enter a topic + tone", detail: "e.g. \"My leadership lessons, professional\"" },
            { step: "Hit Generate", detail: "AI researches + writes the post" },
            { step: "Review the preview", detail: "Edit anything you want" },
            { step: "Publish, Schedule, or Draft", detail: "Your choice" },
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
    icon: <CalendarDays className="w-6 h-6 text-[#0A66C2]" />,
    title: "Schedule & Automate",
    badge: "Step 6",
    body: (
      <div className="space-y-3 text-sm text-slate-600">
        <p>Plan weeks of content in advance — the platform posts automatically.</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Single Post", desc: "Create → Preview → click Schedule → pick date & time" },
            { label: "Bulk Upload", desc: "Download CSV template, fill 500 rows, upload once" },
            { label: "Content Calendar", desc: "See all posts color-coded by status" },
            { label: "AI Best Times", desc: "AI suggests optimal posting times based on history" },
          ].map(({ label, desc }) => (
            <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="font-semibold text-slate-800 text-xs">{label}</p>
              <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-[#0A66C2]">
          <strong>You're all set!</strong> Posts publish automatically at their scheduled time — no action needed.
        </div>
      </div>
    ),
  },
];

interface Props {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[#0A66C2]" />
            <span className="font-bold text-slate-900 text-sm">Getting Started Guide</span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? "bg-[#0A66C2]" : "bg-slate-200"}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="px-6 py-5 min-h-[320px]">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              {current.icon}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#0A66C2] uppercase tracking-wide">{current.badge}</p>
              <h2 className="text-base font-bold text-slate-900">{current.title}</h2>
            </div>
          </div>
          {current.body}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 pb-5 pt-2 border-t border-slate-100">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs text-slate-400">{step + 1} / {STEPS.length}</span>
          {isLast ? (
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-semibold transition-all"
            >
              <CheckCircle className="w-4 h-4" /> Done
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-semibold transition-all"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
