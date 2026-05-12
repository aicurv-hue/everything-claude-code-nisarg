"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface InvitePreview {
  invite: {
    id: string;
    status: string;
    email: string;
    inviterName: string;
    orgName: string | null;
    expiresAt: number | null;
    expired: boolean;
    emailMatches: boolean;
  };
  team: { memberCount: number; orgName: string | null };
}

export default function InviteAcceptPage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [acceptStatus, setAcceptStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      const redirect = encodeURIComponent(`/invite/${token}`);
      router.replace(`/login?redirect=${redirect}`);
    }
  }, [user, loading, router, token]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await getAuthToken();
        const res = await fetch(`/api/team/invite/${encodeURIComponent(token)}/preview`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPreviewError(data?.error || "Could not load invite");
        } else {
          setPreview(data);
        }
      } catch {
        if (!cancelled) setPreviewError("Could not load invite");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, token]);

  async function handleAccept() {
    setAcceptStatus("accepting");
    setAcceptError(null);
    try {
      const idToken = await getAuthToken();
      if (!idToken) throw new Error("Sign-in required");
      const res = await fetch("/api/team/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAcceptStatus("error");
        setAcceptError(data?.error || "Could not accept invite");
        return;
      }
      setAcceptStatus("success");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setAcceptStatus("error");
      setAcceptError(err instanceof Error ? err.message : "Could not accept invite");
    }
  }

  if (loading || !user || previewLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-sm text-[var(--text-muted)]">Loading…</div>
      </div>
    );
  }

  if (previewError || !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
        <div className="max-w-md w-full bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
          <h1 className="text-lg font-semibold text-[var(--foreground)] mb-2">Invite unavailable</h1>
          <p className="text-sm text-[var(--text-sub)] mb-4">{previewError || "Invite not found."}</p>
          <Link href="/dashboard" className="text-sm text-[var(--primary)] underline">Go to dashboard</Link>
        </div>
      </div>
    );
  }

  const { invite, team } = preview;
  const teamLabel = invite.orgName || team.orgName || `${invite.inviterName}'s team`;
  const totalSeatsAfter = team.memberCount + 1;
  const expiresOn = invite.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4 py-10">
      <div className="max-w-lg w-full bg-[var(--card)] border border-[var(--border)] rounded-2xl p-8">
        <h1 className="text-2xl font-semibold text-[var(--foreground)] mb-2">Join a Cridl team</h1>
        <p className="text-sm text-[var(--text-sub)] mb-6 leading-relaxed">
          <span className="font-medium text-[var(--foreground)]">{invite.inviterName}</span> invited you to join <span className="font-medium text-[var(--foreground)]">{teamLabel}</span>.
        </p>

        <div className="rounded-lg bg-[var(--bg-sub)] border border-[var(--border)] p-4 mb-6 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">Signed in as</span><span className="text-[var(--foreground)]">{user.email}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">Invite addressed to</span><span className="text-[var(--foreground)]">{invite.email}</span></div>
          <div className="flex justify-between"><span className="text-[var(--text-muted)]">Team size after joining</span><span className="text-[var(--foreground)]">{totalSeatsAfter} of 6</span></div>
          {expiresOn && (
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Invite expires</span><span className="text-[var(--foreground)]">{expiresOn}</span></div>
          )}
        </div>

        <p className="text-sm text-[var(--text-sub)] mb-3 font-medium">By accepting, you'll:</p>
        <ul className="text-sm text-[var(--text-sub)] space-y-1.5 mb-6 list-disc pl-5">
          <li>Get added to the team's shared company page (post directly, no approval)</li>
          <li>Unlock Pro-level features on your personal workspace while on the team</li>
          <li>Have any active paid Cridl subscription on this account cancelled (no refund)</li>
        </ul>

        {invite.expired && (
          <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-400">
            This invite has expired. Ask the team owner to send a new one.
          </div>
        )}

        {!invite.emailMatches && !invite.expired && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            This invite is for <span className="font-medium">{invite.email}</span>. Sign in with that email to accept.
          </div>
        )}

        {acceptStatus === "success" ? (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-400">
            Joined! Redirecting…
          </div>
        ) : (
          <button
            onClick={handleAccept}
            disabled={
              acceptStatus === "accepting" ||
              invite.expired ||
              !invite.emailMatches ||
              invite.status !== "pending"
            }
            className="w-full bg-[var(--primary)] text-white text-sm font-semibold px-4 py-3 rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {acceptStatus === "accepting" ? "Accepting…" : "Accept invite"}
          </button>
        )}

        {acceptError && (
          <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {acceptError}
          </div>
        )}

        <p className="text-xs text-[var(--text-muted)] mt-6 text-center">
          Not your invite? <Link href="/dashboard" className="underline">Go to dashboard</Link>.
        </p>
      </div>
    </div>
  );
}
