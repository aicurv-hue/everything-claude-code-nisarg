"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, FileText, Calendar, Linkedin, Trash2, Ban, CheckCircle,
  RefreshCw, AlertTriangle, TrendingUp, Activity, X, ChevronRight,
  Clock, Star, BarChart2, ShieldAlert, Copy, ExternalLink, Zap,
  ShieldCheck, Plus, UserCheck, UserX,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number; newUsersLast7d: number; newUsersLast30d: number;
  activatedUsers: number; activationRate: number;
  linkedInConnected: number; linkedInConnectionRate: number;
  tokenExpiredCount: number; tokenExpiringIn24h: number; tokenExpiringIn48h: number;
  totalPosts: number; drafts: number; scheduledPosts: number;
  publishedPosts: number; failedPosts: number;
  individualPosts: number; corporatePosts: number;
  postsLast7d: number; postsLast30d: number;
  totalLikes: number; totalComments: number;
  failedPostsLast24h: number;
}

interface AdminUser {
  uid: string; email: string; displayName: string; photoURL: string;
  createdAt: string; lastSignIn: string; disabled: boolean;
  postCount: number; draftCount: number; scheduledCount: number;
  publishedCount: number; failedCount: number; lastPostAt: string | null;
  segment: "individual" | "corporate" | "both" | "none";
  totalLikes: number; totalComments: number;
  linkedInConnected: boolean; tokenExpiresAt: number | null;
  tokenExpired: boolean; linkedInName: string | null; linkedInEmail: string | null;
  betaApproved: boolean;
}

interface UserDetail {
  profile: { name: string | null; industry: string | null; role: string | null; website: string | null };
  recentPosts: Array<{
    id: string; topic: string; status: string; segment: string;
    createdAt: string | null; scheduledAt: string | null; publishedAt: string | null;
    failedReason: string | null; likes: number; comments: number; linkedInPostId: string | null;
  }>;
  memory: { entryCount: number };
  token: { connected: boolean; expiresAt: number | null; expired: boolean; linkedInName: string | null; linkedInEmail: string | null };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString();

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function lastActiveColor(iso: string | null | undefined): string {
  if (!iso) return "text-slate-500";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d <= 7)  return "text-green-400";
  if (d <= 14) return "text-amber-400";
  return "text-red-400";
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    published: "bg-green-500/15 text-green-400 border-green-500/30",
    scheduled:  "bg-blue-500/15  text-blue-400  border-blue-500/30",
    draft:      "bg-slate-500/15 text-slate-400 border-slate-500/30",
    failed:     "bg-red-500/15   text-red-400   border-red-500/30",
    processing: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };
  return map[status] || "bg-slate-500/15 text-slate-400 border-slate-500/30";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EngagementDiagnostic({ adminFetch }: { adminFetch: (url: string, opts?: RequestInit) => Promise<Response> }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<any>(null);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await adminFetch("/api/debug/engagement");
      setResult(await res.json());
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold text-white text-sm">Engagement API Diagnostic</h2>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Testing…" : "Run Test"}
        </button>
      </div>
      <p className="text-slate-500 text-xs mb-3">Tests all LinkedIn engagement API endpoints against your most recent published post. Shows raw responses so we can see exactly why likes/comments show 0.</p>
      {result && (
        <div className="mt-3 space-y-3">
          {result.error && <p className="text-red-400 text-xs">{result.error}</p>}
          {result.post && (
            <div className="bg-white/[0.03] rounded-lg p-3 text-xs space-y-1">
              <p className="text-slate-400 font-medium mb-1">Post being tested:</p>
              <p className="text-slate-300"><span className="text-slate-500">linkedin_post_id:</span> {result.post.linkedin_post_id}</p>
              <p className="text-slate-300"><span className="text-slate-500">encoded_urn:</span> {result.post.encoded_urn}</p>
              <p className="text-slate-300"><span className="text-slate-500">current likes/comments:</span> {result.post.current_likes} / {result.post.current_comments}</p>
              <p className="text-slate-300"><span className="text-slate-500">last synced:</span> {result.post.engagement_synced_at || "never"}</p>
            </div>
          )}
          {result.tests && Object.entries(result.tests).map(([name, data]: [string, any]) => (
            <div key={name} className={`rounded-lg p-3 text-xs border ${data.status === 200 ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`font-bold ${data.status === 200 ? "text-green-400" : "text-red-400"}`}>{name}</span>
                <span className={`px-1.5 py-0.5 rounded ${data.status === 200 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>HTTP {data.status ?? "error"}</span>
              </div>
              <pre className="text-slate-400 overflow-x-auto text-[10px] whitespace-pre-wrap">{JSON.stringify(data.body ?? data.error, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, icon, accent = "text-blue-400", alert = false }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; accent?: string; alert?: boolean;
}) {
  return (
    <div className={`rounded-xl p-5 border ${alert ? "bg-red-500/5 border-red-500/30" : "bg-slate-900 border-white/[0.07]"}`}>
      <div className={`${alert ? "text-red-400" : accent} mb-3`}>{icon}</div>
      <p className={`text-2xl font-bold ${alert ? "text-red-400" : "text-white"}`}>{fmt(Number(value))}</p>
      <p className="text-slate-400 text-sm mt-0.5">{label}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function UserDetailDrawer({ user, onClose, adminFetch, onBetaGranted }: {
  user: AdminUser; onClose: () => void; adminFetch: (url: string, opts?: RequestInit) => Promise<Response>; onBetaGranted: () => void;
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [grantingBeta, setGrantingBeta] = useState(false);
  const [betaGranted, setBetaGranted] = useState(user.betaApproved);

  useEffect(() => {
    adminFetch(`/api/admin/users/${user.uid}`)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data?.error) throw new Error(data.error);
        setDetail(data);
      })
      .catch(err => console.error("[Admin] user detail fetch failed:", err))
      .finally(() => setLoading(false));
  }, [user.uid]);

  async function handleGrantBeta() {
    setGrantingBeta(true);
    try {
      const res = await adminFetch("/api/admin/beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, action: "add" }),
      });
      if (res.ok) { setBetaGranted(true); onBetaGranted(); }
    } finally {
      setGrantingBeta(false);
    }
  }

  const copyUid = () => { navigator.clipboard.writeText(user.uid); };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-slate-950 border-l border-white/[0.07] h-full overflow-y-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/[0.07] flex items-start justify-between sticky top-0 bg-slate-950 z-10">
          <div>
            <p className="font-semibold text-white text-lg">{user.displayName || user.email}</p>
            <p className="text-slate-400 text-sm">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !detail ? (
          <div className="p-6 space-y-4">
            <p className="text-red-400 text-sm">Could not load full user details.</p>
            <button
              onClick={handleGrantBeta}
              disabled={grantingBeta || betaGranted}
              className="flex items-center gap-1.5 text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
            >
              {betaGranted ? "✓ Beta Granted" : grantingBeta ? "Granting..." : "Grant Beta Access"}
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Stats strip */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Published", value: user.publishedCount, color: "text-green-400" },
                { label: "Scheduled", value: user.scheduledCount, color: "text-blue-400" },
                { label: "Drafts",    value: user.draftCount,     color: "text-slate-300" },
                { label: "Failed",    value: user.failedCount,    color: user.failedCount > 0 ? "text-red-400" : "text-slate-500" },
              ].map(s => (
                <div key={s.label} className="bg-slate-900 rounded-lg p-3 text-center border border-white/[0.06]">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Profile */}
            {(detail.profile.name || detail.profile.industry || detail.profile.role) && (
              <div className="bg-slate-900 rounded-xl p-4 border border-white/[0.06]">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Profile</p>
                <div className="space-y-1.5 text-sm">
                  {detail.profile.name     && <p className="text-white">{detail.profile.name}</p>}
                  {detail.profile.role     && <p className="text-slate-400">{detail.profile.role}</p>}
                  {detail.profile.industry && <p className="text-slate-500">{detail.profile.industry}</p>}
                </div>
              </div>
            )}

            {/* LinkedIn token */}
            <div className="bg-slate-900 rounded-xl p-4 border border-white/[0.06]">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">LinkedIn</p>
              {detail.token.connected ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-green-400 font-medium">Connected</span>
                    {detail.token.expired && (
                      <span className="bg-red-500/15 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/30">Expired</span>
                    )}
                  </div>
                  {detail.token.linkedInName  && <p className="text-white">{detail.token.linkedInName}</p>}
                  {detail.token.linkedInEmail && <p className="text-slate-400">{detail.token.linkedInEmail}</p>}
                  {detail.token.expiresAt && (
                    <p className="text-slate-500 text-xs">
                      Token expires: {new Date(detail.token.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Not connected to LinkedIn</p>
              )}
            </div>

            {/* Memory */}
            <div className="bg-slate-900 rounded-xl p-4 border border-white/[0.06] flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Memory Entries</p>
              <p className="text-white font-semibold">{detail.memory.entryCount}</p>
            </div>

            {/* Recent posts */}
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Recent Posts</p>
              {detail.recentPosts.length === 0 ? (
                <p className="text-slate-500 text-sm">No posts yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.recentPosts.map(p => (
                    <div key={p.id} className="bg-slate-900 rounded-lg p-3 border border-white/[0.06]">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-200 flex-1 leading-snug">{p.topic || "—"}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${statusBadge(p.status)}`}>
                          {p.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                        <span>{p.publishedAt ? timeAgo(p.publishedAt) : p.scheduledAt ? `Sched: ${timeAgo(p.scheduledAt)}` : timeAgo(p.createdAt)}</span>
                        {p.likes > 0 && <span>👍 {p.likes}</span>}
                        {p.comments > 0 && <span>💬 {p.comments}</span>}
                        {p.linkedInPostId && (
                          <a
                            href={`https://www.linkedin.com/feed/update/${p.linkedInPostId}/`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-[#0A66C2] hover:underline flex items-center gap-0.5"
                          >
                            View <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                      {p.failedReason && (
                        <p className="text-red-400 text-[11px] mt-1.5 bg-red-500/5 rounded px-2 py-1 border border-red-500/15">
                          ✗ {p.failedReason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="pt-2 border-t border-white/[0.07] flex flex-wrap gap-2">
              <button
                onClick={copyUid}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-white/[0.08] rounded-lg px-3 py-2 transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy UID
              </button>
              <button
                onClick={handleGrantBeta}
                disabled={grantingBeta || betaGranted}
                className="flex items-center gap-1.5 text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
              >
                {betaGranted ? "✓ Beta Granted" : grantingBeta ? "Granting..." : "Grant Beta Access"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "users" | "system" | "beta" | "promos";
type SortKey = "lastSignIn" | "postCount" | "failedCount" | "createdAt";

interface BetaEntry { email: string; added_at: string | null; }

interface PromoCode {
  code: string; label: string; trialDays: number;
  maxUses: number | null; usesCount: number;
  expiresAt: string | null; isActive: boolean; createdAt: string | null;
}

export default function AdminPage() {
  const [tab,        setTab]        = useState<Tab>("overview");
  const [users,      setUsers]      = useState<AdminUser[]>([]);
  const [stats,      setStats]      = useState<AdminStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [actionId,   setActionId]   = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [sortKey,    setSortKey]    = useState<SortKey>("lastSignIn");
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Promo code state
  const [promos,        setPromos]        = useState<PromoCode[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promoMsg,      setPromoMsg]      = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [promoForm,     setPromoForm]     = useState({ trialDays: 15, maxUses: "", expiresAt: "", label: "" });
  const [promoGenerating, setPromoGenerating] = useState(false);
  const [editingPromo,  setEditingPromo]  = useState<string | null>(null);
  const [editForm,      setEditForm]      = useState<{ trialDays: number; expiresAt: string; label: string }>({ trialDays: 15, expiresAt: "", label: "" });
  const [copiedCode,    setCopiedCode]    = useState<string | null>(null);

  // Beta access state
  const [betaList,      setBetaList]      = useState<BetaEntry[]>([]);
  const [betaLoading,   setBetaLoading]   = useState(false);
  const [betaInput,     setBetaInput]     = useState("");
  const [betaActionId,  setBetaActionId]  = useState<string | null>(null);
  const [betaMsg,       setBetaMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const adminFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { auth: firebaseAuth } = await import("@/lib/firebase");
    const token = await firebaseAuth?.currentUser?.getIdToken();
    return fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usersRes, statsRes] = await Promise.all([
        adminFetch("/api/admin/users"),
        adminFetch("/api/admin/stats"),
      ]);
      if (!usersRes.ok || !statsRes.ok) throw new Error("Failed to load admin data.");
      const [usersData, statsData] = await Promise.all([usersRes.json(), statsRes.json()]);
      setUsers(usersData.users || []);
      setStats(statsData);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  async function toggleDisable(uid: string, disabled: boolean) {
    setActionId(uid);
    try {
      await adminFetch("/api/admin/users", { method: "PATCH", body: JSON.stringify({ uid, disabled: !disabled }) });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, disabled: !disabled } : u));
    } finally { setActionId(null); }
  }

  async function deleteUser(uid: string, email: string) {
    if (!confirm(`Permanently delete ${email} and all their data? This cannot be undone.`)) return;
    setActionId(uid);
    try {
      await adminFetch("/api/admin/users", { method: "DELETE", body: JSON.stringify({ uid }) });
      setUsers(prev => prev.filter(u => u.uid !== uid));
      if (detailUser?.uid === uid) setDetailUser(null);
    } finally { setActionId(null); }
  }

  // ── Promo code helpers ──
  const loadPromos = useCallback(async () => {
    setPromosLoading(true);
    try {
      const res = await adminFetch("/api/admin/promo-codes");
      const data = await res.json();
      setPromos(data.codes || []);
    } catch { setPromoMsg({ type: "err", text: "Failed to load promo codes." }); }
    finally { setPromosLoading(false); }
  }, [adminFetch]);

  useEffect(() => { if (tab === "promos") loadPromos(); }, [tab, loadPromos]);

  async function promoGenerate() {
    setPromoGenerating(true);
    setPromoMsg(null);
    try {
      const body = {
        trialDays: Number(promoForm.trialDays) || 15,
        maxUses: promoForm.maxUses !== "" ? Number(promoForm.maxUses) : null,
        expiresAt: promoForm.expiresAt || null,
        label: promoForm.label,
      };
      const res = await adminFetch("/api/admin/promo-codes", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPromoMsg({ type: "ok", text: `Generated: ${data.code}` });
      setPromoForm({ trialDays: 15, maxUses: "", expiresAt: "", label: "" });
      await loadPromos();
    } catch (e: any) {
      setPromoMsg({ type: "err", text: e.message || "Failed" });
    } finally { setPromoGenerating(false); }
  }

  async function promoSaveEdit(code: string) {
    try {
      const res = await adminFetch("/api/admin/promo-codes", {
        method: "PATCH",
        body: JSON.stringify({ code, trialDays: editForm.trialDays, expiresAt: editForm.expiresAt || null, label: editForm.label }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditingPromo(null);
      setPromoMsg({ type: "ok", text: `Updated ${code}` });
      await loadPromos();
    } catch (e: any) {
      setPromoMsg({ type: "err", text: e.message || "Failed to update" });
    }
  }

  async function promoToggleActive(code: string, isActive: boolean) {
    try {
      await adminFetch("/api/admin/promo-codes", { method: "PATCH", body: JSON.stringify({ code, isActive: !isActive }) });
      setPromos(prev => prev.map(p => p.code === code ? { ...p, isActive: !isActive } : p));
    } catch (e: any) {
      setPromoMsg({ type: "err", text: e.message || "Failed to toggle" });
    }
  }

  async function promoDelete(code: string) {
    if (!confirm(`Delete promo code ${code}? This cannot be undone.`)) return;
    try {
      const res = await adminFetch("/api/admin/promo-codes", { method: "DELETE", body: JSON.stringify({ code }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setPromos(prev => prev.filter(p => p.code !== code));
      setPromoMsg({ type: "ok", text: `Deleted ${code}` });
    } catch (e: any) {
      setPromoMsg({ type: "err", text: e.message || "Failed to delete" });
    }
  }

  function promoCopy(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // ── Beta access helpers ──
  const loadBeta = useCallback(async () => {
    setBetaLoading(true);
    try {
      const res = await adminFetch("/api/admin/beta-access");
      const data = await res.json();
      setBetaList(data.approved || []);
    } catch { setBetaMsg({ type: "err", text: "Failed to load beta list." }); }
    finally { setBetaLoading(false); }
  }, [adminFetch]);

  useEffect(() => { if (tab === "beta") loadBeta(); }, [tab, loadBeta]);

  async function betaAdd() {
    const email = betaInput.trim().toLowerCase();
    if (!email) return;
    setBetaActionId(email);
    setBetaMsg(null);
    try {
      const res = await adminFetch("/api/admin/beta-access", { method: "POST", body: JSON.stringify({ email, action: "add" }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setBetaInput("");
      setBetaMsg({ type: "ok", text: `✅ ${email} approved` });
      await loadBeta();
    } catch (e: any) {
      setBetaMsg({ type: "err", text: e.message || "Failed" });
    } finally { setBetaActionId(null); }
  }

  async function betaRemove(email: string) {
    if (!confirm(`Remove ${email} from beta?`)) return;
    setBetaActionId(email);
    setBetaMsg(null);
    try {
      const res = await adminFetch("/api/admin/beta-access", { method: "POST", body: JSON.stringify({ email, action: "remove" }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setBetaMsg({ type: "ok", text: `Removed ${email}` });
      await loadBeta();
    } catch (e: any) {
      setBetaMsg({ type: "err", text: e.message || "Failed" });
    } finally { setBetaActionId(null); }
  }

  // ── Filtered + sorted user list ──
  const filteredUsers = users
    .filter(u => {
      if (!search) return true;
      const q = search.toLowerCase();
      return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortKey === "lastSignIn")  return new Date(b.lastSignIn || 0).getTime() - new Date(a.lastSignIn || 0).getTime();
      if (sortKey === "postCount")   return b.postCount   - a.postCount;
      if (sortKey === "failedCount") return b.failedCount - a.failedCount;
      if (sortKey === "createdAt")   return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      return 0;
    });

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "users",    label: `Users (${users.length})` },
    { key: "system",   label: "System" },
    { key: "beta",     label: "Beta Access" },
    { key: "promos",   label: "Promo Codes" },
  ];

  // ── System tab data ──
  const failedUsers   = users.filter(u => u.failedCount > 0).sort((a, b) => b.failedCount - a.failedCount);
  const expiringUsers = users.filter(u => {
    if (!u.tokenExpiresAt) return false;
    return u.tokenExpiresAt < Date.now() + 48 * 3600_000;
  }).sort((a, b) => (a.tokenExpiresAt ?? 0) - (b.tokenExpiresAt ?? 0));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {lastRefresh ? `Last updated ${lastRefresh.toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white border border-white/[0.08] rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/[0.07]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? "border-[#0A66C2] text-white"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && stats && (
        <div className="space-y-6">
          {/* Alert banner — only shown when there's something actionable */}
          {(stats.failedPostsLast24h > 0 || stats.tokenExpiringIn48h > 0) && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl px-5 py-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                {stats.failedPostsLast24h > 0 && (
                  <p className="text-amber-300">
                    <strong>{stats.failedPostsLast24h}</strong> post{stats.failedPostsLast24h > 1 ? "s" : ""} failed in the last 24h — check System tab.
                  </p>
                )}
                {stats.tokenExpiringIn48h > 0 && (
                  <p className="text-amber-300">
                    <strong>{stats.tokenExpiringIn48h}</strong> LinkedIn token{stats.tokenExpiringIn48h > 1 ? "s" : ""} expiring within 48h — those users' scheduled posts will fail.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Row 1 — Growth & Activation */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Growth & Activation</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Total Users"     value={stats.totalUsers}     icon={<Users className="w-5 h-5" />}      accent="text-blue-400"   sub={`+${stats.newUsersLast7d} this week`} />
              <KpiCard label="Activated Users" value={stats.activatedUsers} icon={<Zap className="w-5 h-5" />}        accent="text-purple-400" sub={`${stats.activationRate}% activation rate`} />
              <KpiCard label="LinkedIn Connected" value={stats.linkedInConnected} icon={<Linkedin className="w-5 h-5" />} accent="text-green-400" sub={`${stats.linkedInConnectionRate}% of users`} />
              <KpiCard label="Posts This Week" value={stats.postsLast7d}    icon={<TrendingUp className="w-5 h-5" />} accent="text-cyan-400"   sub={`${stats.postsLast30d} this month`} />
            </div>
          </div>

          {/* Row 2 — Content Health */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Content Pipeline</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label="Total Posts"    value={stats.totalPosts}     icon={<FileText className="w-5 h-5" />}  accent="text-slate-300" />
              <KpiCard label="Scheduled"      value={stats.scheduledPosts} icon={<Calendar className="w-5 h-5" />} accent="text-blue-400"   sub="in the queue" />
              <KpiCard label="Published"      value={stats.publishedPosts} icon={<CheckCircle className="w-5 h-5" />} accent="text-green-400" />
              <KpiCard label="Failed Posts"   value={stats.failedPosts}    icon={<AlertTriangle className="w-5 h-5" />} accent="text-red-400" alert={stats.failedPosts > 0} />
            </div>
          </div>

          {/* Row 3 — Engagement & Segments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Engagement */}
            <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Total Engagement</p>
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-3xl font-bold text-white">{fmt(stats.totalLikes)}</p>
                  <p className="text-slate-400 text-sm mt-0.5">👍 Likes</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">{fmt(stats.totalComments)}</p>
                  <p className="text-slate-400 text-sm mt-0.5">💬 Comments</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-white">
                    {stats.publishedPosts > 0 ? ((stats.totalLikes + stats.totalComments) / stats.publishedPosts).toFixed(1) : "0"}
                  </p>
                  <p className="text-slate-400 text-sm mt-0.5">Avg per post</p>
                </div>
              </div>
            </div>

            {/* Segment split */}
            <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Segment Split</p>
              {stats.totalPosts === 0 ? (
                <p className="text-slate-500 text-sm">No posts yet.</p>
              ) : (
                <div className="space-y-3">
                  {[
                    { label: "Individual", count: stats.individualPosts, color: "bg-blue-500" },
                    { label: "Corporate",  count: stats.corporatePosts,  color: "bg-purple-500" },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-300">{s.label}</span>
                        <span className="text-slate-400">{fmt(s.count)} posts ({stats.totalPosts > 0 ? Math.round(s.count / stats.totalPosts * 100) : 0}%)</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${s.color} rounded-full transition-all`} style={{ width: `${stats.totalPosts > 0 ? s.count / stats.totalPosts * 100 : 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* New users this month */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Growth</p>
            <div className="flex items-center gap-8 text-sm">
              <div>
                <p className="text-2xl font-bold text-white">+{stats.newUsersLast7d}</p>
                <p className="text-slate-400 mt-0.5">New users last 7d</p>
              </div>
              <div className="w-px h-10 bg-white/[0.07]" />
              <div>
                <p className="text-2xl font-bold text-white">+{stats.newUsersLast30d}</p>
                <p className="text-slate-400 mt-0.5">New users last 30d</p>
              </div>
              <div className="w-px h-10 bg-white/[0.07]" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.tokenExpiredCount}</p>
                <p className="text-slate-400 mt-0.5">Expired LinkedIn tokens</p>
              </div>
              <div className="w-px h-10 bg-white/[0.07]" />
              <div>
                <p className="text-2xl font-bold text-white">{stats.drafts}</p>
                <p className="text-slate-400 mt-0.5">Saved drafts</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === "users" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-900 border border-white/[0.07] rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#0A66C2]/60 w-64"
            />
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="bg-slate-900 border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-[#0A66C2]/60"
            >
              <option value="lastSignIn">Sort: Last Active</option>
              <option value="postCount">Sort: Post Count</option>
              <option value="failedCount">Sort: Failed Posts</option>
              <option value="createdAt">Sort: Joined</option>
            </select>
            <p className="text-slate-500 text-sm ml-auto">{filteredUsers.length} users</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.07] text-slate-400 text-left text-xs uppercase tracking-wider">
                      <th className="px-5 py-3 font-medium">User</th>
                      <th className="px-5 py-3 font-medium">Joined</th>
                      <th className="px-5 py-3 font-medium">Last Active</th>
                      <th className="px-5 py-3 font-medium">Posts</th>
                      <th className="px-5 py-3 font-medium">Engagement</th>
                      <th className="px-5 py-3 font-medium">LinkedIn</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredUsers.map(u => (
                      <tr
                        key={u.uid}
                        className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => setDetailUser(u)}
                      >
                        <td className="px-5 py-4">
                          <p className="text-white font-medium">{u.displayName || "—"}</p>
                          <p className="text-slate-500 text-xs mt-0.5">{u.email}</p>
                        </td>
                        <td className="px-5 py-4 text-slate-400 text-xs whitespace-nowrap">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                        </td>
                        <td className={`px-5 py-4 text-xs font-medium whitespace-nowrap ${lastActiveColor(u.lastSignIn)}`}>
                          {timeAgo(u.lastSignIn)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {u.publishedCount > 0 && <span className="bg-green-500/15 text-green-400 text-[10px] px-1.5 py-0.5 rounded border border-green-500/25">{u.publishedCount} pub</span>}
                            {u.scheduledCount > 0 && <span className="bg-blue-500/15 text-blue-400 text-[10px] px-1.5 py-0.5 rounded border border-blue-500/25">{u.scheduledCount} sched</span>}
                            {u.draftCount > 0     && <span className="bg-slate-500/15 text-slate-400 text-[10px] px-1.5 py-0.5 rounded border border-slate-500/25">{u.draftCount} draft</span>}
                            {u.failedCount > 0    && <span className="bg-red-500/15 text-red-400 text-[10px] px-1.5 py-0.5 rounded border border-red-500/25">{u.failedCount} fail</span>}
                            {u.postCount === 0    && <span className="text-slate-600 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                          {u.totalLikes > 0 || u.totalComments > 0
                            ? <span>👍 {u.totalLikes} · 💬 {u.totalComments}</span>
                            : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-5 py-4">
                          {u.linkedInConnected ? (
                            u.tokenExpired
                              ? <span className="bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/20">Expired</span>
                              : <span className="bg-green-500/10 text-green-400 text-xs px-2 py-0.5 rounded-full border border-green-500/20">Connected</span>
                          ) : (
                            <span className="text-slate-600 text-xs">Not connected</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col gap-1 items-start">
                            {u.disabled
                              ? <span className="bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/20">Disabled</span>
                              : <span className="bg-green-500/10 text-green-400 text-xs px-2 py-0.5 rounded-full border border-green-500/20">Active</span>}
                            {u.betaApproved && (
                              <span className="bg-blue-500/10 text-blue-400 text-xs px-2 py-0.5 rounded-full border border-blue-500/20">Beta</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setDetailUser(u)} title="View details" className="text-slate-400 hover:text-[#0A66C2] transition-colors">
                              <ChevronRight className="w-4 h-4" />
                            </button>
                            <button onClick={() => toggleDisable(u.uid, u.disabled)} disabled={actionId === u.uid} title={u.disabled ? "Enable" : "Disable"} className="text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-40">
                              {u.disabled ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                            </button>
                            <button onClick={() => deleteUser(u.uid, u.email)} disabled={actionId === u.uid} title="Delete user" className="text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500 text-sm">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SYSTEM TAB ── */}
      {tab === "system" && (
        <div className="space-y-6">
          {/* Engagement API diagnostic */}
          <EngagementDiagnostic adminFetch={adminFetch} />
          {/* Users with failed posts */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <h2 className="font-semibold text-white text-sm">Users with Failed Posts</h2>
              {failedUsers.length > 0 && (
                <span className="bg-red-500/15 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/30 ml-auto">{failedUsers.length} affected</span>
              )}
            </div>
            {failedUsers.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">No failed posts. System is healthy.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.05] text-slate-400 text-left text-xs uppercase tracking-wider">
                    <th className="px-6 py-3 font-medium">User</th>
                    <th className="px-6 py-3 font-medium">Failed</th>
                    <th className="px-6 py-3 font-medium">Total Posts</th>
                    <th className="px-6 py-3 font-medium">LinkedIn</th>
                    <th className="px-6 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {failedUsers.map(u => (
                    <tr key={u.uid} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-3">
                        <p className="text-white">{u.displayName || u.email}</p>
                        <p className="text-slate-500 text-xs">{u.email}</p>
                      </td>
                      <td className="px-6 py-3"><span className="text-red-400 font-semibold">{u.failedCount}</span></td>
                      <td className="px-6 py-3 text-slate-400">{u.postCount}</td>
                      <td className="px-6 py-3">
                        {u.linkedInConnected
                          ? u.tokenExpired
                            ? <span className="text-red-400 text-xs">Token expired</span>
                            : <span className="text-green-400 text-xs">Connected</span>
                          : <span className="text-slate-500 text-xs">Not connected</span>}
                      </td>
                      <td className="px-6 py-3">
                        <button onClick={() => setDetailUser(u)} className="text-[#0A66C2] text-xs hover:underline">View →</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Expiring tokens */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.07] flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h2 className="font-semibold text-white text-sm">Expiring / Expired LinkedIn Tokens</h2>
              {expiringUsers.length > 0 && (
                <span className="bg-amber-500/15 text-amber-400 text-xs px-2 py-0.5 rounded-full border border-amber-500/30 ml-auto">{expiringUsers.length} users</span>
              )}
            </div>
            {expiringUsers.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">No expiring tokens in the next 48h.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.05] text-slate-400 text-left text-xs uppercase tracking-wider">
                    <th className="px-6 py-3 font-medium">User</th>
                    <th className="px-6 py-3 font-medium">LinkedIn Name</th>
                    <th className="px-6 py-3 font-medium">Expires</th>
                    <th className="px-6 py-3 font-medium">Scheduled Posts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {expiringUsers.map(u => (
                    <tr key={u.uid} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-3">
                        <p className="text-white">{u.displayName || u.email}</p>
                        <p className="text-slate-500 text-xs">{u.email}</p>
                      </td>
                      <td className="px-6 py-3 text-slate-400">{u.linkedInName || "—"}</td>
                      <td className="px-6 py-3">
                        <span className={u.tokenExpired ? "text-red-400" : "text-amber-400"}>
                          {u.tokenExpiresAt ? new Date(u.tokenExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          {u.tokenExpired && " (expired)"}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-400">{u.scheduledCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Cron info */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-green-400" />
              <h2 className="font-semibold text-white text-sm">Cron Scheduler</h2>
              <span className="bg-green-500/15 text-green-400 text-xs px-2 py-0.5 rounded-full border border-green-500/30 ml-auto">Active</span>
            </div>
            <div className="space-y-2 text-sm text-slate-400">
              <p>Provider: <span className="text-white">cron-job.org</span> — runs every 1 minute</p>
              <p>Endpoint: <span className="text-slate-300">/api/cron/publish-due</span></p>
              <p>Auth: <span className="text-slate-300">CRON_SECRET header (Bearer token)</span></p>
              <p className="text-slate-500 text-xs mt-3">The cron publishes all scheduled posts whose scheduled_at has passed. It handles token refresh automatically and retries are manual (retry button in History).</p>
            </div>
          </div>
        </div>
      )}

      {/* ── BETA ACCESS TAB ── */}
      {tab === "beta" && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#0A66C2]" />
            <h2 className="font-semibold text-white">Beta Access Management</h2>
          </div>

          {betaMsg && (
            <div className={`text-sm px-4 py-3 rounded-xl border ${betaMsg.type === "ok" ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-red-500/10 border-red-500/25 text-red-400"}`}>
              {betaMsg.text}
            </div>
          )}

          {/* Add email */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Approve a new user</p>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="user@example.com"
                value={betaInput}
                onChange={e => setBetaInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && betaAdd()}
                className="flex-1 bg-slate-800 border border-white/[0.07] rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#0A66C2]/60"
              />
              <button
                onClick={betaAdd}
                disabled={!betaInput.trim() || betaActionId === betaInput.trim().toLowerCase()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-medium transition-all disabled:opacity-40"
              >
                <Plus className="w-4 h-4" /> Approve
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-2">This lets the user sign in to Cridl. They must create an account separately.</p>
          </div>

          {/* Approved list */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Approved Emails</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{betaList.length} approved</span>
                <button onClick={loadBeta} disabled={betaLoading} className="text-slate-500 hover:text-white transition-colors">
                  <RefreshCw className={`w-3.5 h-3.5 ${betaLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
            {betaLoading ? (
              <div className="py-10 flex justify-center">
                <div className="w-5 h-5 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : betaList.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">No approved emails yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.05] text-slate-400 text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 text-left font-medium">Email</th>
                    <th className="px-5 py-3 text-left font-medium">Approved On</th>
                    <th className="px-5 py-3 text-left font-medium">Has Account</th>
                    <th className="px-5 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {betaList.map(b => {
                    const hasAccount = users.some(u => u.email.toLowerCase() === b.email);
                    return (
                      <tr key={b.email} className="hover:bg-white/[0.02]">
                        <td className="px-5 py-3 text-white">{b.email}</td>
                        <td className="px-5 py-3 text-slate-400 text-xs">
                          {b.added_at ? new Date(b.added_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                        </td>
                        <td className="px-5 py-3">
                          {hasAccount
                            ? <span className="flex items-center gap-1 text-green-400 text-xs"><UserCheck className="w-3.5 h-3.5" /> Yes</span>
                            : <span className="flex items-center gap-1 text-slate-500 text-xs"><UserX className="w-3.5 h-3.5" /> Not yet</span>}
                        </td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => betaRemove(b.email)}
                            disabled={betaActionId === b.email}
                            title="Revoke access"
                            className="text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── PROMO CODES TAB ── */}
      {tab === "promos" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-violet-400" />
            <h2 className="font-semibold text-white">Promo Codes</h2>
          </div>

          {promoMsg && (
            <div className={`text-sm px-4 py-3 rounded-xl border ${promoMsg.type === "ok" ? "bg-green-500/10 border-green-500/25 text-green-400" : "bg-red-500/10 border-red-500/25 text-red-400"}`}>
              {promoMsg.text}
            </div>
          )}

          {/* Generate form */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-4">Generate New Code</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Trial Days</label>
                <input
                  type="number" min={1} max={365}
                  value={promoForm.trialDays}
                  onChange={e => setPromoForm(f => ({ ...f, trialDays: Number(e.target.value) }))}
                  className="w-full bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0A66C2]/60"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Uses <span className="text-slate-600">(blank = unlimited)</span></label>
                <input
                  type="number" min={1}
                  value={promoForm.maxUses}
                  placeholder="Unlimited"
                  onChange={e => setPromoForm(f => ({ ...f, maxUses: e.target.value }))}
                  className="w-full bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#0A66C2]/60"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Code Expires On <span className="text-slate-600">(optional)</span></label>
                <input
                  type="date"
                  value={promoForm.expiresAt}
                  onChange={e => setPromoForm(f => ({ ...f, expiresAt: e.target.value }))}
                  className="w-full bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0A66C2]/60"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Label / Note</label>
                <input
                  type="text"
                  value={promoForm.label}
                  placeholder="e.g. Influencer batch April"
                  onChange={e => setPromoForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#0A66C2]/60"
                />
              </div>
            </div>
            <button
              onClick={promoGenerate}
              disabled={promoGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {promoGenerating ? "Generating…" : "Generate Code"}
            </button>
          </div>

          {/* Codes table */}
          <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <p className="text-xs text-slate-500 uppercase tracking-wider">All Codes</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{promos.length} codes</span>
                <button onClick={loadPromos} disabled={promosLoading} className="text-slate-500 hover:text-white transition-colors">
                  <RefreshCw className={`w-3.5 h-3.5 ${promosLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {promosLoading ? (
              <div className="py-10 flex justify-center">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : promos.length === 0 ? (
              <div className="py-10 text-center text-slate-500 text-sm">No promo codes yet. Generate one above.</div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {promos.map(p => (
                  <div key={p.code} className="px-5 py-4">
                    {editingPromo === p.code ? (
                      /* ── Inline edit row ── */
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm text-violet-300 font-semibold">{p.code}</span>
                          <span className="text-xs text-slate-500">editing</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Trial Days</label>
                            <input
                              type="number" min={1}
                              value={editForm.trialDays}
                              onChange={e => setEditForm(f => ({ ...f, trialDays: Number(e.target.value) }))}
                              className="w-full bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/60"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Expires On</label>
                            <input
                              type="date"
                              value={editForm.expiresAt}
                              onChange={e => setEditForm(f => ({ ...f, expiresAt: e.target.value }))}
                              className="w-full bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/60"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Label</label>
                            <input
                              type="text"
                              value={editForm.label}
                              onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))}
                              className="w-full bg-slate-800 border border-white/[0.07] rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500/60"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => promoSaveEdit(p.code)}
                            className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPromo(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal row ── */
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 min-w-[180px]">
                          <span className="font-mono text-sm text-violet-300 font-semibold">{p.code}</span>
                          <button
                            onClick={() => promoCopy(p.code)}
                            title="Copy code"
                            className="text-slate-500 hover:text-white transition-colors"
                          >
                            {copiedCode === p.code
                              ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                              : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span className="text-white font-medium">{p.trialDays}d</span>
                          <span className="text-slate-500">trial</span>
                        </div>

                        <div className="text-xs text-slate-400">
                          {p.usesCount}/{p.maxUses ?? "∞"} uses
                        </div>

                        {p.expiresAt && (
                          <div className="text-xs text-slate-500">
                            expires {new Date(p.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        )}

                        {p.label && (
                          <div className="text-xs text-slate-500 italic truncate max-w-[160px]">{p.label}</div>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                          <button
                            onClick={() => promoToggleActive(p.code, p.isActive)}
                            title={p.isActive ? "Deactivate" : "Activate"}
                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                              p.isActive
                                ? "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30"
                                : "bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-green-500/15 hover:text-green-400 hover:border-green-500/30"
                            }`}
                          >
                            {p.isActive ? "Active" : "Inactive"}
                          </button>
                          <button
                            onClick={() => {
                              setEditingPromo(p.code);
                              setEditForm({
                                trialDays: p.trialDays,
                                expiresAt: p.expiresAt ? p.expiresAt.slice(0, 10) : "",
                                label: p.label,
                              });
                            }}
                            title="Edit"
                            className="text-slate-500 hover:text-white transition-colors"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => promoDelete(p.code)}
                            title="Delete"
                            className="text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User detail drawer */}
      {detailUser && (
        <UserDetailDrawer
          user={detailUser}
          onClose={() => setDetailUser(null)}
          adminFetch={adminFetch}
          onBetaGranted={() =>
            setUsers(prev =>
              prev.map(u => u.uid === detailUser.uid ? { ...u, betaApproved: true } : u)
            )
          }
        />
      )}
    </div>
  );
}
