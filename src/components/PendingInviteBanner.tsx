"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface PendingInvite {
  id: string;
  teamId: string;
  ownerUid: string;
  orgName: string | null;
  inviterName: string;
  expiresAt: number | null;
  token: string;
}

export default function PendingInviteBanner() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch("/api/team/invites/pending", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setInvites(Array.isArray(data?.invites) ? data.invites : []);
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
  }, [user?.email]);

  const visible = invites.filter((i) => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  const invite = visible[0];
  const teamLabel = invite.orgName || `${invite.inviterName}'s team`;
  const remaining = visible.length - 1;

  return (
    <div className="bg-[var(--primary)]/10 text-[var(--foreground)] text-sm font-medium px-4 py-3 flex items-center justify-between rounded-lg mb-4 border border-[var(--primary)]/40">
      <div className="flex items-center gap-2 min-w-0">
        <Users className="w-4 h-4 text-[var(--primary)] shrink-0" />
        <span className="truncate">
          <span className="font-semibold">{invite.inviterName}</span> invited you to join <span className="font-semibold">{teamLabel}</span>
          {remaining > 0 && <span className="text-[var(--text-muted)] ml-2">+{remaining} more</span>}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Link
          href={`/invite/${encodeURIComponent(invite.token)}`}
          className="text-[12px] font-semibold bg-[var(--primary)] text-white px-3 py-1.5 rounded-md hover:opacity-90"
        >
          Review
        </Link>
        <button
          onClick={() => setDismissed((s) => new Set(s).add(invite.id))}
          className="text-[var(--text-muted)] hover:text-[var(--foreground)] text-lg leading-none px-1"
          aria-label="Dismiss"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
