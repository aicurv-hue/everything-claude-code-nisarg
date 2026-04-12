"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    const email = user.email?.toLowerCase() || "";
    if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email)) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const email = user?.email?.toLowerCase() || "";
  if (!user || (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(email))) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/[0.07] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0A66C2] to-[#0854a0] flex items-center justify-center">
            <span className="text-white font-bold text-xs">L</span>
          </div>
          <span className="font-semibold text-sm">Cridl</span>
          <span className="text-slate-500 text-sm">/</span>
          <span className="text-slate-300 text-sm font-medium">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/admin/promo-codes" className="text-slate-400 hover:text-white text-sm transition-colors">
            Promo Codes
          </a>
          <a href="/dashboard" className="text-slate-400 hover:text-white text-sm transition-colors">
            ← Back to dashboard
          </a>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-8 py-8">{children}</main>
    </div>
  );
}
