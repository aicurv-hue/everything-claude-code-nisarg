"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Settings, Building2, User, Brain, PenSquare, FileText, Clock, CalendarDays, LogOut } from "lucide-react";
import { SegmentProvider, useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";

function BetaSignOutButton() {
  const { logOut } = useAuth();
  const router = useRouter();
  return (
    <button
      onClick={async () => { await logOut(); router.replace("/login"); }}
      className="text-slate-500 hover:text-white text-sm transition-colors"
    >
      Sign out
    </button>
  );
}

function Sidebar() {
  const { setSegment, isIndividual, isCorporate } = useSegment();
  const { user, logOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { href: "/dashboard",          label: "Dashboard",   icon: <BarChart3 className="w-4 h-4" /> },
    { href: "/dashboard/create",   label: "Create Post", icon: <PenSquare className="w-4 h-4" /> },
    { href: "/dashboard/drafts",    label: "Drafts",      icon: <FileText className="w-4 h-4" /> },
    { href: "/dashboard/schedule", label: "Schedule",    icon: <CalendarDays className="w-4 h-4" /> },
    { href: "/dashboard/history",  label: "History",     icon: <Clock className="w-4 h-4" /> },
    { href: "/dashboard/memory",   label: "Memory",      icon: <Brain className="w-4 h-4" /> },
    { href: "/dashboard/settings", label: "Settings",    icon: <Settings className="w-4 h-4" /> },
  ];

  const accentClass = isCorporate ? "bg-violet-600" : "bg-[#0A66C2]";

  return (
    <aside className="w-56 bg-slate-900 flex flex-col shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0A66C2] to-[#0854a0] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs">L</span>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">LinkAuto</span>
        </div>
      </div>

      {/* Segment Toggle */}
      <div className="px-3 pt-4 pb-2">
        <div className="bg-white/[0.07] rounded-lg p-1 flex gap-1">
          <button
            onClick={() => setSegment("individual")}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              isIndividual
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <User className="w-3 h-3" />
            Personal
          </button>
          <button
            onClick={() => setSegment("corporate")}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              isCorporate
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Building2 className="w-3 h-3" />
            Company
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-2 pt-2 flex-1 space-y-0.5">
        {navItems.map(({ href, label, icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-white/10 text-white font-medium"
                  : "text-slate-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <span className={isActive ? "text-white" : "text-slate-500"}>{icon}</span>
              {label}
              {isActive && (
                <div className={`ml-auto w-1 h-4 rounded-full ${accentClass}`} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — user + logout */}
      <div className="px-3 pb-4 pt-3 border-t border-white/[0.07] space-y-2">
        <div className={`px-3 py-2.5 rounded-lg ${isCorporate ? "bg-violet-500/10" : "bg-[#0A66C2]/10"}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${isCorporate ? "text-violet-400" : "text-[#0A66C2]"}`}>
            {isIndividual ? "Personal Profile" : "Company Page"}
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {isIndividual ? "Posts go to your LinkedIn profile" : "Posts go to your company page"}
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-2 px-1">
            <div className="w-6 h-6 rounded-full bg-[#0A66C2]/30 flex items-center justify-center shrink-0">
              <span className="text-[#0A66C2] text-[10px] font-bold">
                {(user.displayName || user.email || "U")[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[11px] font-medium truncate">{user.displayName || "User"}</p>
              <p className="text-slate-500 text-[10px] truncate">{user.email}</p>
            </div>
            <button
              onClick={async () => { await logOut(); router.replace("/login"); }}
              className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function CronPoller() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    // Polls every 60s so scheduled posts go live in near real-time when
    // the dashboard is open. Vercel Cron (6 AM IST daily) is the safety net
    // for posts that fire while the dashboard is closed.
    const run = async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch("/api/cron/publish-due", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return;
        const data = await res.json();
        if (!res.ok) console.warn("[CronPoller] Worker error:", data);
        else console.log("[CronPoller] Worker result:", data);
      } catch (err) {
        console.warn("[CronPoller] Fetch failed:", err);
      }
    };
    run();
    const id = setInterval(run, 60_000); // 60s interval — checks every minute for due posts
    return () => clearInterval(id);
  }, [user]);
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [betaChecking, setBetaChecking] = React.useState(false);
  const [betaApproved, setBetaApproved] = React.useState<boolean | null>(null);
  const [betaError, setBetaError] = React.useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setBetaChecking(true);
    fetch(`/api/beta/check?email=${encodeURIComponent(user.email || "")}`)
      .then(r => r.json())
      .then(data => setBetaApproved(data.approved === true))
      .catch(() => setBetaError(true))
      .finally(() => setBetaChecking(false));
  }, [user]);

  if (loading || betaChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (betaError) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-900 border border-white/[0.07] rounded-2xl p-8 text-center">
          <p className="text-slate-400 text-sm mb-4">Could not verify access. Check your connection and try again.</p>
          <button
            onClick={() => {
              setBetaError(false);
              setBetaChecking(true);
              setBetaApproved(null);
              fetch(`/api/beta/check?email=${encodeURIComponent(user!.email || "")}`)
                .then(r => r.json())
                .then(d => setBetaApproved(d.approved === true))
                .catch(() => setBetaError(true))
                .finally(() => setBetaChecking(false));
            }}
            className="px-4 py-2 bg-[#0A66C2] text-white text-sm rounded-lg hover:bg-[#0854a0]"
          >Retry</button>
        </div>
      </div>
    );
  }

  if (betaApproved === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-slate-900 border border-white/[0.07] rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-[#0A66C2]/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#0A66C2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-white text-xl font-bold mb-2">Beta Access Required</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-6">
            LinkAuto is currently in closed beta. Your account (<span className="text-slate-300">{user.email}</span>) is not yet on the approved list.
          </p>
          <p className="text-slate-500 text-sm mb-6">
            Contact <span className="text-[#0A66C2]">nisarg2526@gmail.com</span> to request access.
          </p>
          <BetaSignOutButton />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
    <SegmentProvider>
      <CronPoller />
      <div className="min-h-screen flex bg-slate-50 text-slate-900">
        <Sidebar />
        <main className="flex-1 overflow-auto min-h-screen">
          {children}
        </main>
      </div>
    </SegmentProvider>
    </AuthGuard>
  );
}
