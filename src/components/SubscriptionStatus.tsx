"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

interface SubStatus {
  plan: string;
  status: string;
  subscriptionId?: string;
  currentPeriodEnd?: string;
}

export default function SubscriptionStatus() {
  const [sub, setSub] = useState<SubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function load() {
      const user = auth.currentUser;
      if (!user) { setLoading(false); return; }
      const token = await user.getIdToken();
      const res = await fetch("/api/subscriptions/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSub(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  async function handleCancel() {
    if (!sub?.subscriptionId) return;
    if (!confirm("Cancel your plan? You'll keep access until the end of the current billing period.")) return;
    setCancelling(true);
    const user = auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/subscriptions/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subscriptionId: sub.subscriptionId }),
    });
    setSub(prev => prev ? { ...prev, status: "cancelled" } : prev);
    setCancelling(false);
  }

  if (loading) return <div className="text-sm text-gray-400">Loading billing info...</div>;
  if (!sub || sub.plan === "free") {
    return (
      <div className="rounded-xl border border-gray-200 p-6">
        <p className="font-semibold text-gray-900 mb-1">Free plan</p>
        <p className="text-sm text-gray-500 mb-4">5 posts/month · 2 AI images · 1 profile</p>
        <a href="/#pricing" className="inline-block bg-[#0A66C2] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#0A66C2]/90">
          Upgrade
        </a>
      </div>
    );
  }

  const planLabel = sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1);
  const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

  const statusLabel =
    sub.status === "active" ? "Active" :
    sub.status === "pending" || sub.status === "created" || sub.status === "authenticated" ? "Pending" :
    sub.status === "cancelled" ? "Cancelled" :
    sub.status;

  return (
    <div className="rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-lg">{planLabel} Plan</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            sub.status === "active" ? "bg-green-100 text-green-700" :
            sub.status === "pending" || sub.status === "created" || sub.status === "authenticated" ? "bg-blue-100 text-blue-700" :
            sub.status === "cancelled" ? "bg-red-100 text-red-700" :
            "bg-gray-100 text-gray-600"
          }`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {periodEnd && sub.status === "active" && (
        <p className="text-sm text-gray-500">Next billing: {periodEnd.toLocaleDateString()}</p>
      )}
      {sub.status === "cancelled" && periodEnd && (
        <p className="text-sm text-gray-500">Access until: {periodEnd.toLocaleDateString()}</p>
      )}

      {sub.status !== "cancelled" && sub.subscriptionId && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="text-sm text-red-500 hover:text-red-700 underline disabled:opacity-50"
        >
          {cancelling ? "Cancelling..." : "Cancel plan"}
        </button>
      )}
    </div>
  );
}
