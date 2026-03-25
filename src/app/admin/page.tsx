"use client";

import { useEffect, useState } from "react";
import { Users, FileText, Calendar, Linkedin, Trash2, Ban, CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/context/auth";

interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignIn: string;
  disabled: boolean;
  postCount: number;
  linkedInConnected: boolean;
}

interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  linkedInConnected: number;
}

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers]       = useState<AdminUser[]>([]);
  const [stats, setStats]       = useState<AdminStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function adminFetch(url: string, options: RequestInit = {}) {
    const { auth: firebaseAuth } = await import("@/lib/firebase");
    const token = await firebaseAuth?.currentUser?.getIdToken();
    return fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }

  async function loadData() {
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleDisable(uid: string, disabled: boolean) {
    setActionId(uid);
    try {
      await adminFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ uid, disabled: !disabled }),
      });
      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, disabled: !disabled } : u));
    } finally {
      setActionId(null);
    }
  }

  async function deleteUser(uid: string, email: string) {
    if (!confirm(`Permanently delete user ${email}? This cannot be undone.`)) return;
    setActionId(uid);
    try {
      await adminFetch("/api/admin/users", {
        method: "DELETE",
        body: JSON.stringify({ uid }),
      });
      setUsers(prev => prev.filter(u => u.uid !== uid));
    } finally {
      setActionId(null);
    }
  }

  const statCards = stats ? [
    { label: "Total Users",        value: stats.totalUsers,        icon: <Users className="w-5 h-5" />,    color: "text-blue-400" },
    { label: "Total Posts",        value: stats.totalPosts,        icon: <FileText className="w-5 h-5" />, color: "text-purple-400" },
    { label: "Scheduled",          value: stats.scheduledPosts,    icon: <Calendar className="w-5 h-5" />, color: "text-amber-400" },
    { label: "LinkedIn Connected", value: stats.linkedInConnected, icon: <Linkedin className="w-5 h-5" />, color: "text-green-400" },
  ] : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Admin Dashboard</h1>
        <p className="text-slate-400 text-sm">Manage beta users and monitor platform activity.</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon, color }) => (
            <div key={label} className="bg-slate-900 border border-white/[0.07] rounded-xl p-5">
              <div className={`${color} mb-3`}>{icon}</div>
              <p className="text-2xl font-bold text-white">{value}</p>
              <p className="text-slate-400 text-sm mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Users table */}
      <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.07] flex items-center justify-between">
          <h2 className="font-semibold text-white">Beta Users</h2>
          <button
            onClick={loadData}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No users yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] text-slate-400 text-left">
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 font-medium">Posts</th>
                  <th className="px-6 py-3 font-medium">LinkedIn</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {users.map(u => (
                  <tr key={u.uid} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-white font-medium">{u.displayName || "—"}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{u.email}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-400">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-slate-300">{u.postCount}</td>
                    <td className="px-6 py-4">
                      {u.linkedInConnected
                        ? <span className="text-green-400 text-xs font-medium">Connected</span>
                        : <span className="text-slate-500 text-xs">Not connected</span>
                      }
                    </td>
                    <td className="px-6 py-4">
                      {u.disabled
                        ? <span className="bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/20">Disabled</span>
                        : <span className="bg-green-500/10 text-green-400 text-xs px-2 py-0.5 rounded-full border border-green-500/20">Active</span>
                      }
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleDisable(u.uid, u.disabled)}
                          disabled={actionId === u.uid}
                          title={u.disabled ? "Enable user" : "Disable user"}
                          className="text-slate-400 hover:text-amber-400 transition-colors disabled:opacity-40"
                        >
                          {u.disabled ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deleteUser(u.uid, u.email)}
                          disabled={actionId === u.uid}
                          title="Delete user"
                          className="text-slate-400 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
