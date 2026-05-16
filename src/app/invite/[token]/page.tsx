"use client";

import Link from "next/link";
import { Users, Sparkles } from "lucide-react";

export default function InviteAcceptPage() {
  // Team feature is gated "Coming Soon" pending LinkedIn MDP approval.
  // Invite acceptance is paused in the UI; backend invite routes remain intact.
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--background)]">
      <div
        className="card max-w-md w-full text-center"
        style={{ padding: "40px 32px", border: "2px dashed var(--border)" }}
      >
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center bg-[var(--primary)]/10">
          <Users className="w-7 h-7 text-[var(--primary)]" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[var(--primary)]/10 text-[var(--primary)] mb-4">
          <Sparkles className="w-3 h-3" /> Coming soon
        </span>

        <h1 className="text-xl font-bold text-[var(--foreground)] mb-2">
          Team invites are paused
        </h1>

        <p className="text-sm text-[var(--text-sub)] mb-2 leading-relaxed">
          Team workspaces are launching soon. We&apos;re waiting on LinkedIn&apos;s Marketing Developer Platform approval before turning this on.
        </p>

        <p className="text-[12px] text-[var(--text-muted)] mb-6 leading-relaxed">
          Your invite is safe — once we go live, the inviter can re-share the link and you&apos;ll be able to accept it then.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: "var(--primary)" }}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
