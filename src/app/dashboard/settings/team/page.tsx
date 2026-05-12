"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Users, UserPlus, Mail, X, Trash2, AlertTriangle, Copy, Check, Crown } from "lucide-react";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface Member {
  id: string;
  memberUid: string;
  email: string;
  displayName: string | null;
  status: string;
  joinedAt: number | null;
}

interface PendingInvite {
  id: string;
  email: string;
  status: string;
  createdAt: number | null;
  expiresAt: number | null;
}

interface TeamData {
  team: { id: string; orgName: string | null } | null;
  plan: string;
  canUseTeam: boolean;
  seatLimit: number;
  members: Member[];
  pendingInvites: PendingInvite[];
}

export default function TeamSettingsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch("/api/team/members", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setLastInviteUrl(null);
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setInviteError(json?.error || "Failed to send invite");
      } else {
        setInviteEmail("");
        setLastInviteUrl(json.inviteUrl || null);
        await load();
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    setBusyId(inviteId);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/team/invite/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ inviteId }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(memberUid: string) {
    if (!confirm("Remove this member from your team? They'll keep their personal workspace data but lose company-page access.")) return;
    setBusyId(memberUid);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/team/members/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ memberUid }),
      });
      if (res.ok) await load();
      else alert((await res.json())?.error || "Failed to remove member");
    } finally {
      setBusyId(null);
    }
  }

  async function copyInviteUrl() {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }

  if (loading && !data) {
    return <div className="text-sm text-[var(--text-muted)]">Loading team…</div>;
  }

  if (!data) {
    return <div className="text-sm text-red-400">Could not load team data.</div>;
  }

  // Free / Starter / Pro — show upsell
  if (!data.canUseTeam) {
    return (
      <div className="max-w-2xl mx-auto animate-fade-in">
        <div className="card text-center" style={{ padding: '48px 32px', border: '2px dashed var(--border)' }}>
          <Users className="w-10 h-10 mx-auto mb-4 text-[var(--text-muted)]" />
          <h1 className="text-xl font-bold text-[var(--foreground)] mb-2">Team is a Business-plan feature</h1>
          <p className="text-sm text-[var(--text-sub)] mb-6 max-w-md mx-auto">
            Upgrade to Business to invite up to 5 teammates. Each member gets Pro-level features on their personal workspace and can post directly to your shared company page.
          </p>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--primary)' }}
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const usedSeats = data.members.length + data.pendingInvites.length;
  const seatsRemaining = data.seatLimit - usedSeats;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[22px] font-bold text-[var(--foreground)] flex items-center gap-2">
          <Users className="w-5 h-5" /> Team
        </h1>
        <p className="text-[13px] text-[var(--text-muted)] mt-1">
          You + {data.seatLimit} teammates can post on your shared company page. Members keep their own personal workspace with Pro-level features while on the team.
        </p>
      </div>

      {/* Seat counter */}
      <div className="card flex items-center justify-between" style={{ padding: '16px 20px' }}>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)] font-semibold">Seats used</div>
          <div className="text-[24px] font-bold text-[var(--foreground)] leading-tight">{usedSeats} <span className="text-[var(--text-muted)] text-[16px] font-normal">of {data.seatLimit}</span></div>
        </div>
        <div className="text-right text-[12px] text-[var(--text-muted)]">
          {seatsRemaining > 0 ? `${seatsRemaining} seat${seatsRemaining === 1 ? "" : "s"} available` : "Limit reached"}
          <div className="text-[11px] mt-0.5">Need more? <a href="mailto:support@cridl.app" className="underline">Contact us</a></div>
        </div>
      </div>

      {/* Invite form */}
      <div className="card" style={{ padding: '20px' }}>
        <h2 className="text-[14px] font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Invite a teammate
        </h2>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            required
            placeholder="teammate@company.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={inviting || seatsRemaining <= 0}
            className="flex-1 bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={inviting || seatsRemaining <= 0}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--primary)' }}
          >
            {inviting ? "Sending…" : "Send invite"}
          </button>
        </form>
        {seatsRemaining <= 0 && (
          <p className="text-[12px] text-[var(--text-muted)] mt-2">Seat limit reached — remove a member or contact us to add more.</p>
        )}
        {inviteError && (
          <p className="text-[12px] text-red-400 mt-2">{inviteError}</p>
        )}
        {lastInviteUrl && (
          <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2.5">
            <p className="text-[12px] text-emerald-400 font-medium mb-1.5">Invite created — share this link with them:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] text-[var(--foreground)] bg-[var(--bg-sub)] rounded px-2 py-1.5 truncate">{lastInviteUrl}</code>
              <button onClick={copyInviteUrl} className="shrink-0 px-2.5 py-1.5 rounded text-[11px] font-medium bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--toggle-bg)] flex items-center gap-1">
                {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">They'll also see a banner in their Cridl dashboard once they sign in with this email.</p>
          </div>
        )}
      </div>

      {/* Active members */}
      <div className="card" style={{ padding: '20px' }}>
        <h2 className="text-[14px] font-semibold text-[var(--foreground)] mb-3">Members ({data.members.length + 1})</h2>
        <div className="divide-y divide-[var(--border-sub)]">
          {/* Owner row */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/80 to-amber-600 flex items-center justify-center shrink-0">
                <Crown className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--foreground)] truncate">{user?.displayName || "You"} <span className="text-[11px] text-[var(--text-muted)] font-normal">(owner)</span></p>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{user?.email}</p>
              </div>
            </div>
          </div>

          {data.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--primary)]/80 to-[var(--primary)] flex items-center justify-center shrink-0">
                  <span className="text-white text-[11px] font-semibold">
                    {(m.displayName || m.email).split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--foreground)] truncate">{m.displayName || m.email}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{m.email}</p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(m.memberUid)}
                disabled={busyId === m.memberUid}
                className="px-2.5 py-1.5 rounded text-[11px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50 flex items-center gap-1"
                title="Remove from team"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </div>
          ))}

          {data.members.length === 0 && (
            <p className="text-[12px] text-[var(--text-muted)] py-3">No teammates yet — invite someone above.</p>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {data.pendingInvites.length > 0 && (
        <div className="card" style={{ padding: '20px' }}>
          <h2 className="text-[14px] font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" /> Pending invites ({data.pendingInvites.length})
          </h2>
          <div className="divide-y divide-[var(--border-sub)]">
            {data.pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--foreground)] truncate">{inv.email}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Expires {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : "—"}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  disabled={busyId === inv.id}
                  className="px-2.5 py-1.5 rounded text-[11px] font-medium text-[var(--text-sub)] hover:bg-[var(--toggle-bg)] disabled:opacity-50 flex items-center gap-1"
                  title="Revoke invite"
                >
                  <X className="w-3 h-3" /> Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[11px] text-[var(--text-muted)] flex items-start gap-1.5 pt-2">
        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>Removing a member instantly revokes their company-page access and reverts their personal workspace to the Free plan. Posts they drafted stay in your team queue.</span>
      </div>
    </div>
  );
}
