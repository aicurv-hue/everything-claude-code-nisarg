"use client";

import Link from "next/link";
import { Users, Sparkles, BellRing } from "lucide-react";

export default function TeamSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div
        className="card text-center"
        style={{ padding: "48px 32px", border: "2px dashed var(--border)" }}
      >
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-[var(--primary)]/10">
          <Users className="w-7 h-7 text-[var(--primary)]" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[var(--primary)]/10 text-[var(--primary)] mb-4">
          <Sparkles className="w-3 h-3" /> Coming soon
        </span>

        <h1 className="text-xl font-bold text-[var(--foreground)] mb-2">
          Team workspaces are launching soon
        </h1>

        <p className="text-sm text-[var(--text-sub)] mb-2 max-w-md mx-auto leading-relaxed">
          We&apos;re putting the finishing touches on team workspaces — 1 admin + up to 5 teammates posting on a shared company page, each with Pro-level features on their personal workspace.
        </p>

        <p className="text-[12px] text-[var(--text-muted)] mb-7 max-w-md mx-auto leading-relaxed">
          The feature is built and ready. We&apos;re waiting on LinkedIn&apos;s Marketing Developer Platform approval before flipping the switch — that&apos;s a one-time review on LinkedIn&apos;s side. We&apos;ll email you the moment it&apos;s live.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: "var(--primary)" }}
          >
            Back to dashboard
          </Link>
          <a
            href="mailto:support@cridl.app?subject=Notify%20me%20when%20Team%20launches"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-sub)] border border-[var(--border)] hover:bg-[var(--card-hover)]"
          >
            <BellRing className="w-3.5 h-3.5" /> Notify me
          </a>
        </div>
      </div>
    </div>
  );
}
