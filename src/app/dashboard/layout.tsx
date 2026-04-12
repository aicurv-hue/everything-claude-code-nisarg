"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Settings, Building2, User, Brain, PenSquare, FileText, Clock, CalendarDays, LogOut, BookOpen, HelpCircle, TrendingUp, Rocket } from "lucide-react";
import { SegmentProvider, useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import OnboardingModal from "@/components/ui/OnboardingModal";
import BottomNav from "@/components/mobile/BottomNav";
import MobileHeader from "@/components/mobile/MobileHeader";
import { auth as firebaseAuth } from "@/lib/firebase";

interface PlanBadgeInfo {
  plan: string;
  status: string;
}

function PlanBadge() {
  const [info, setInfo] = useState<PlanBadgeInfo | null>(null);

  useEffect(() => {
    async function load() {
      const user = firebaseAuth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch("/api/subscriptions/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setInfo(await res.json());
    }
    load();
  }, []);

  if (!info) return null;

  const isActive = info.status === "active";
  const isFree = !info.plan || info.plan === "free";
  const planLabel = info.plan
    ? info.plan.charAt(0).toUpperCase() + info.plan.slice(1)
    : "Free";

  if (isFree) {
    return (
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <span className="text-[10px] font-semibold text-amber-400">Free plan</span>
          <a href="/#pricing" className="text-[10px] text-amber-400 hover:text-amber-200 underline underline-offset-2 transition-colors">
            Upgrade
          </a>
        </div>
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="px-3 pt-2">
        <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <span className="text-[10px] font-semibold text-green-400">{planLabel} plan</span>
        </div>
      </div>
    );
  }

  // pending/created/authenticated — show plan name with pending indicator
  return (
    <div className="px-3 pt-2">
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <span className="text-[10px] font-semibold text-blue-400">{planLabel} — pending</span>
        <a href="/#pricing" className="text-[10px] text-blue-400 hover:text-blue-200 underline underline-offset-2 transition-colors">
          Manage
        </a>
      </div>
    </div>
  );
}


function Sidebar({ onOpenGuide, failedCount }: { onOpenGuide: () => void; failedCount: number }) {
  const { setSegment, isIndividual, isCorporate } = useSegment();
  const { user, logOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { href: "/dashboard",          label: "Dashboard",   icon: <BarChart3 className="w-4 h-4" /> },
    { href: "/dashboard/create",   label: "Create Post", icon: <PenSquare className="w-4 h-4" /> },
    { href: "/dashboard/drafts",    label: "Drafts",      icon: <FileText className="w-4 h-4" /> },
    { href: "/dashboard/schedule",   label: "Schedule",    icon: <CalendarDays className="w-4 h-4" /> },
    { href: "/dashboard/campaigns",  label: "Campaigns",   icon: <Rocket className="w-4 h-4" /> },
    { href: "/dashboard/history",    label: "History",     icon: <Clock className="w-4 h-4" /> },
    { href: "/dashboard/analytics", label: "Analytics",  icon: <TrendingUp className="w-4 h-4" /> },
    { href: "/dashboard/memory",   label: "Memory",      icon: <Brain className="w-4 h-4" /> },
    { href: "/dashboard/settings", label: "Profile",    icon: <Settings className="w-4 h-4" /> },
    { href: "/dashboard/guide",    label: "Guide",       icon: <HelpCircle className="w-4 h-4" /> },
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
          <span className="text-white font-semibold text-sm tracking-tight">Cridl</span>
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
          const showBadge = href === "/dashboard/history" && failedCount > 0;
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
              <span className={`relative ${isActive ? "text-white" : "text-slate-500"}`}>
                {icon}
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                )}
              </span>
              {label}
              {showBadge && (
                <span className="ml-auto text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                  {failedCount}
                </span>
              )}
              {!showBadge && isActive && (
                <div className={`ml-auto w-1 h-4 rounded-full ${accentClass}`} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Plan badge */}
      <PlanBadge />

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
              onClick={onOpenGuide}
              className="text-slate-500 hover:text-blue-400 transition-colors shrink-0"
              title="Getting Started Guide"
            >
              <BookOpen className="w-3.5 h-3.5" />
            </button>
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

// CronPoller removed — cron route now only accepts CRON_SECRET / Vercel cron header,
// not Firebase user tokens, to prevent privilege escalation. cron-job.org handles triggering.

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showGuide, setShowGuide] = useState(false);

  // Redirect first-time users to onboarding page
  useEffect(() => {
    if (!user) return;
    const key = `cridl_guide_seen_${user.uid}`;
    if (!localStorage.getItem(key)) {
      // Don't redirect if already on onboarding (avoids loop)
      if (!pathname.startsWith("/onboarding")) {
        router.replace("/onboarding");
      }
    }
  }, [user, pathname, router]);

  const [failedCount, setFailedCount] = useState(0);

  // Poll for failed posts every 5 minutes to keep badge accurate
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch("/api/dashboard/data?segment=individual", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setFailedCount(data?.stats?.failed ?? 0);
      } catch { /* silent */ }
    };
    check();
    const id = setInterval(check, 5 * 60_000);
    return () => clearInterval(id);
  }, [user]);

  return (
    <>
      {/* ── Desktop layout: sidebar + main ── */}
      <div className="min-h-screen hidden md:flex bg-slate-50 text-slate-900">
        <Sidebar onOpenGuide={() => setShowGuide(true)} failedCount={failedCount} />
        <main className="flex-1 overflow-auto min-h-screen">
          <div key={pathname} className="h-full">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile layout: header + scrollable content + bottom nav ── */}
      <div className="flex flex-col min-h-screen md:hidden bg-slate-50 text-slate-900">
        <MobileHeader />
        <main className="flex-1 overflow-auto pb-20">
          {/* pb-20 = clears the 64px bottom nav */}
          <div key={pathname} className="h-full">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>

      {showGuide && <OnboardingModal onClose={() => setShowGuide(false)} />}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SegmentProvider>
        <DashboardShell>{children}</DashboardShell>
      </SegmentProvider>
    </AuthGuard>
  );
}
