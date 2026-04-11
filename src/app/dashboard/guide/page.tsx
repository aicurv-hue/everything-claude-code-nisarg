"use client";

import {
  CheckCircle, Linkedin, User, CalendarDays, Sparkles,
  Upload, AlertCircle, BookOpen, Printer
} from "lucide-react";

const steps = [
  {
    num: 1,
    icon: CheckCircle,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    title: "Get Beta Access",
    desc: "Cridl is in closed beta. Your email must be approved before you can sign up.",
    items: [
      "Contact the admin (Nisarg) with your email address",
      "Your email gets added to the approved beta list",
      "You can now sign up and access the platform",
    ],
    note: null,
  },
  {
    num: 2,
    icon: User,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    title: "Create Your Account",
    desc: "Sign up with your email and password at the portal URL.",
    items: [
      "Go to linkedin-automation-chi.vercel.app",
      "Click Sign Up and enter your email + password",
      "Beta approval is checked automatically",
      "On success you land on the Dashboard",
    ],
    note: null,
  },
  {
    num: 3,
    icon: Linkedin,
    color: "text-[#0A66C2]",
    bg: "bg-sky-50",
    border: "border-sky-200",
    title: "Connect LinkedIn",
    desc: "Required to schedule and auto-publish posts to your LinkedIn profile.",
    items: [
      "From the Dashboard, click Connect LinkedIn (top banner)",
      "Or go to Settings → LinkedIn tab → Connect",
      "You'll be redirected to LinkedIn's login page",
      "Log in and click Allow to grant posting permission",
      "You'll return to Settings with a ✅ LinkedIn Connected badge",
    ],
    note: "Stays connected for up to 365 days — no need to reconnect unless you revoke access.",
  },
  {
    num: 4,
    icon: User,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    title: "Set Up Your Profile",
    desc: "Go to Settings and fill in all 5 profile tabs. The AI uses this to write in your voice.",
    items: [
      "Identity — Name, job title, industry",
      "Audience — Who you're writing for",
      "Branding — Tone, values, positioning",
      "Voice — Writing style preferences",
      "AI Config — Which AI model to use",
    ],
    note: null,
  },
  {
    num: 5,
    icon: Sparkles,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
    title: "Create Your First Post",
    desc: "The AI researches and writes the post — you just review and approve.",
    items: [
      "Click Create Post in the left sidebar",
      "Enter a topic, tone, and target audience",
      "Hit Generate — AI researches and writes the post",
      "Review and edit the preview",
      "Choose: Publish Now, Schedule, or Save as Draft",
    ],
    note: null,
  },
  {
    num: 6,
    icon: CalendarDays,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
    title: "Schedule & Automate",
    desc: "Plan weeks of content in advance. Posts publish automatically at the scheduled time.",
    items: [
      "Single post: Preview → Schedule → pick date & time",
      "Bulk upload: Download CSV template, fill rows, upload",
      "Content calendar shows all posts color-coded by status",
      "AI suggests optimal posting times based on your history",
    ],
    note: "Posts publish automatically — no action needed after scheduling.",
  },
];

const troubleshoot = [
  { problem: "\"Beta access required\" after sign up", fix: "Ask the admin to add your email to the approved list" },
  { problem: "LinkedIn shows Disconnected after connecting", fix: "Wait 1–2 min for the deploy to complete, then retry" },
  { problem: "Redirected to Settings with no confirmation", fix: "Make sure you clicked Allow on the LinkedIn consent screen" },
  { problem: "Can't log in at all", fix: "Check email spelling — try the Forgot Password link" },
  { problem: "Post says Failed after scheduling", fix: "Reconnect LinkedIn in Settings — your token may have expired" },
];

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Print button — hidden in PDF */}
      <div className="print:hidden flex justify-end p-6 pb-0">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-all shadow-sm"
        >
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-8 print:py-4 print:px-6">

        {/* Title */}
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-7 h-7 text-[#0A66C2]" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cridl — Getting Started</h1>
            <p className="text-sm text-slate-500">Complete user guide · LinkedIn Automation Portal</p>
          </div>
        </div>
        <div className="h-px bg-slate-200 mb-8" />

        {/* Steps */}
        <div className="space-y-6">
          {steps.map((s) => (
            <div key={s.num} className={`rounded-2xl border ${s.border} overflow-hidden`}>
              <div className={`${s.bg} px-5 py-3 flex items-center gap-3 border-b ${s.border}`}>
                <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                  {s.num}
                </div>
                <s.icon className={`w-4.5 h-4.5 ${s.color}`} />
                <h2 className={`font-bold text-sm ${s.color}`}>{s.title}</h2>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-slate-600 mb-3">{s.desc}</p>
                <ol className="space-y-1.5">
                  {s.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                      {item}
                    </li>
                  ))}
                </ol>
                {s.note && (
                  <div className="mt-3 bg-white border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
                    ✅ {s.note}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Troubleshooting */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4.5 h-4.5 text-slate-500" />
            <h2 className="font-bold text-slate-800">Troubleshooting</h2>
          </div>
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-700 w-1/2">Problem</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-700 w-1/2">Fix</th>
                </tr>
              </thead>
              <tbody>
                {troubleshoot.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-4 py-2.5 text-slate-600 border-r border-slate-100">{row.problem}</td>
                    <td className="px-4 py-2.5 text-slate-700">{row.fix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400">
          <span>Cridl · linkedin-automation-chi.vercel.app</span>
          <span>For support contact: nisarg2526@gmail.com</span>
        </div>
      </div>
    </div>
  );
}
