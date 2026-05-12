"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function InviteAcceptPage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      const redirect = encodeURIComponent(`/invite/${token}`);
      router.replace(`/login?redirect=${redirect}`);
    }
  }, [user, loading, router, token]);

  async function handleAccept() {
    setStatus("accepting");
    setErrorMsg(null);
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
        setStatus("error");
        setErrorMsg(data?.error || "Could not accept invite");
        return;
      }
      setStatus("success");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Could not accept invite");
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="max-w-md w-full">
        <h1 className="text-2xl font-semibold text-slate-900 mb-3">Join a Cridl team</h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          You're signed in as <span className="font-medium text-slate-900">{user.email}</span>. Accepting this invite will:
        </p>
        <ul className="text-sm text-slate-600 space-y-2 mb-6 list-disc pl-5">
          <li>Add you to the team owner's company page</li>
          <li>Unlock Pro-level features on your personal workspace while you're on the team</li>
          <li>Cancel any active paid subscription on this account (no refund)</li>
        </ul>

        {status === "success" ? (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 mb-4">
            Joined! Redirecting…
          </div>
        ) : (
          <button
            onClick={handleAccept}
            disabled={status === "accepting"}
            className="w-full bg-slate-900 text-white text-sm font-medium px-4 py-3 rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            {status === "accepting" ? "Accepting…" : "Accept invite"}
          </button>
        )}

        {errorMsg && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        <p className="text-xs text-slate-500 mt-6 text-center">
          Not your invite? <Link href="/dashboard" className="underline">Go to dashboard</Link>.
        </p>
      </div>
    </div>
  );
}
