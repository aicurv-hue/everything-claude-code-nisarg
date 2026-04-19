"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, UserCircle2, Building2, User, Brain, PenSquare, FileText, Clock, CalendarDays, LogOut, BookOpen, HelpCircle, TrendingUp, Rocket, CreditCard, Lightbulb, Zap, MoreHorizontal } from "lucide-react";
import { SegmentProvider, useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import OnboardingModal from "@/components/ui/OnboardingModal";
import QuickAddIdea from "@/components/ui/QuickAddIdea";
import BottomNav from "@/components/mobile/BottomNav";
import MobileHeader from "@/components/mobile/MobileHeader";
import { PlanStatusProvider, usePlanStatus } from "@/lib/context/planStatus";

function PlanBadge() {
  const { plan, status, loading } = usePlanStatus();
  if (loading) return null;

  const isFree   = !plan || plan === "free";
  const isTrial  = status === "trial";
  const isActive = status === "active";
  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Free";

  if (isFree) {
    return (
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--info-bg)] border border-[var(--border)]">
          <span className="text-[10px] font-semibold text-amber-400">Free plan</span>
          <Link href="/dashboard/billing" className="text-[10px] text-amber-400 hover:text-amber-200 underline underline-offset-2 transition-colors">Upgrade</Link>
        </div>
      </div>
    );
  }
  if (isTrial) {
    return (
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--info-bg)] border border-[var(--border)]">
          <span className="text-[10px] font-semibold text-violet-400">Trial active</span>
          <Link href="/dashboard/billing" className="text-[10px] text-violet-400 hover:text-violet-200 underline underline-offset-2 transition-colors">View</Link>
        </div>
      </div>
    );
  }
  if (isActive) {
    return (
      <div className="px-3 pt-2">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--info-bg)] border border-[var(--border)]">
          <span className="text-[11px] font-semibold text-[var(--text-sub)]">{planLabel} plan</span>
          <span className="text-[10px] font-bold text-[var(--text-muted)]">Usage</span>
        </div>
        <div className="text-[10px] text-[var(--text-muted)] px-3 mt-1">Posts go to your LinkedIn profile</div>
      </div>
    );
  }
  return (
    <div className="px-3 pt-2">
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--info-bg)] border border-[var(--border)]">
        <span className="text-[10px] font-semibold text-blue-400">{planLabel} — pending</span>
        <Link href="/dashboard/billing" className="text-[10px] text-blue-400 hover:text-blue-200 underline underline-offset-2 transition-colors">Manage</Link>
      </div>
    </div>
  );
}


function Sidebar({ onOpenGuide, failedCount }: { onOpenGuide: () => void; failedCount: number }) {
  const { setSegment, isIndividual, isCorporate } = useSegment();
  const { user, logOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const navGroups = [
    {
      label: null,
      items: [
        { href: "/dashboard",           label: "Home",        icon: <LayoutDashboard className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/create",    label: "Create Post", icon: <PenSquare className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/drafts",    label: "Drafts",      icon: <FileText className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/schedule",  label: "Schedule",    icon: <CalendarDays className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/campaigns", label: "Campaigns",   icon: <Zap className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/ideas",     label: "Idea Bank",   icon: <Lightbulb className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/history",   label: "History",     icon: <Clock className="w-[15px] h-[15px]" /> },
      ],
    },
    {
      label: "Insights",
      items: [
        { href: "/dashboard/analytics", label: "Analytics",  icon: <TrendingUp className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/memory",    label: "AI Memory",  icon: <Brain className="w-[15px] h-[15px]" /> },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/dashboard/settings", label: "Profile",  icon: <UserCircle2 className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/billing",  label: "Billing",  icon: <CreditCard className="w-[15px] h-[15px]" /> },
        { href: "/dashboard/guide",    label: "Guide",    icon: <BookOpen className="w-[15px] h-[15px]" /> },
      ],
    },
  ];

  return (
    <aside className="w-[220px] bg-[var(--sidebar)] flex flex-col shrink-0 h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-[18px] flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#2563eb] to-[oklch(55%_0.22_300)] flex items-center justify-center shrink-0">
          <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2} />
        </div>
        <span className="text-[var(--foreground)] font-bold text-[15px] tracking-[-0.02em]">Cridl</span>
      </div>

      {/* Segment Toggle */}
      <div className="px-3 pb-3">
        <div className="bg-[var(--toggle-bg)] rounded-lg p-[3px] flex gap-[2px]">
          <button
            onClick={() => setSegment("individual")}
            className={`flex-1 py-[5px] rounded-md text-[11.5px] font-medium transition-all ${
              isIndividual
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-sub)]"
            }`}
          >
            Personal
          </button>
          <button
            onClick={() => setSegment("corporate")}
            className={`flex-1 py-[5px] rounded-md text-[11.5px] font-medium transition-all ${
              isCorporate
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-sub)]"
            }`}
          >
            Company
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-2 flex-1 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label ?? "main"}>
            {group.label && (
              <p className="px-2.5 pt-3.5 pb-[5px] text-[9.5px] font-bold text-[var(--text-muted)] uppercase tracking-[0.1em]">
                {group.label}
              </p>
            )}
            <div className="space-y-[2px]">
              {group.items.map(({ href, label, icon }) => {
                const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
                const showBadge = href === "/dashboard/history" && failedCount > 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all ${
                      isActive
                        ? "bg-[var(--nav-active)] text-[var(--primary)] font-semibold"
                        : "text-[var(--text-sub)] hover:bg-[var(--nav-hover)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span className={isActive ? "text-[var(--primary)]" : "text-[var(--text-sub)]"}>
                      {icon}
                    </span>
                    <span className="flex-1">{label}</span>
                    {showBadge && (
                      <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                        {failedCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Plan badge */}
      <PlanBadge />

      {/* Bottom — user card */}
      <div className="px-3 py-2.5 border-t border-[var(--border)] flex items-center gap-[9px]">
        {user && (
          <>
            <div className="w-[30px] h-[30px] rounded-full bg-gradient-to-br from-[#2563eb]/80 to-[#2563eb] flex items-center justify-center shrink-0">
              <span className="text-white text-[11px] font-semibold">
                {(user.displayName || user.email || "U").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[var(--foreground)] text-[12px] font-semibold truncate">{user.displayName || "User"}</p>
              <p className="text-[var(--text-muted)] text-[10px] truncate">{user.email}</p>
            </div>
            <button
              onClick={async () => { await logOut(); router.replace("/login"); }}
              className="text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors shrink-0"
              title="More"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </>
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
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { status: planStatus, trialEndsAt } = usePlanStatus();
  const router = useRouter();
  const pathname = usePathname();
  const [showGuide, setShowGuide] = useState(false);
  const [trialBanner, setTrialBanner] = useState<{ daysRemaining: number } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (planStatus === "trial" && trialEndsAt) {
      const ms = new Date(trialEndsAt).getTime() - Date.now();
      if (ms > 0) {
        const daysRemaining = Math.ceil(ms / 86400000);
        setTrialBanner({ daysRemaining });
      }
    } else {
      setTrialBanner(null);
    }
  }, [planStatus, trialEndsAt]);

  // Redirect first-time users to onboarding page
  useEffect(() => {
    if (!user) return;
    const key = `cridl_guide_seen_${user.uid}`;
    if (!localStorage.getItem(key)) {
      // If account is older than 5 minutes, it's a returning user — skip onboarding
      const createdAt = user.metadata?.creationTime;
      if (createdAt) {
        const ageMs = Date.now() - new Date(createdAt).getTime();
        if (ageMs > 5 * 60 * 1000) {
          localStorage.setItem(key, "1");
          return;
        }
      }
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
      <div className="min-h-screen hidden md:flex bg-[var(--background)] text-[var(--foreground)]">
        <Sidebar onOpenGuide={() => setShowGuide(true)} failedCount={failedCount} />
        <main className="flex-1 overflow-auto min-h-screen bg-[var(--bg-sub)]" style={{ padding: '32px 36px' }}>
          {trialBanner && !bannerDismissed && (
            <div className="bg-amber-500/20 text-amber-400 text-sm font-medium px-4 py-2 flex items-center justify-between rounded-lg mb-4 border border-amber-500/30">
              <span>Trial active — {trialBanner.daysRemaining} day{trialBanner.daysRemaining !== 1 ? "s" : ""} remaining</span>
              <button onClick={() => setBannerDismissed(true)} className="ml-4 font-bold hover:opacity-70">×</button>
            </div>
          )}
          <div key={pathname} className="h-full">
            {children}
          </div>
        </main>
      </div>

      {/* ── Mobile layout: header + scrollable content + bottom nav ── */}
      <div className="flex flex-col min-h-screen md:hidden bg-[var(--background)] text-[var(--foreground)]">
        <MobileHeader />
        <main className="flex-1 overflow-auto pb-20">
          {/* pb-20 = clears the 64px bottom nav */}
          {trialBanner && !bannerDismissed && (
            <div className="bg-amber-500 text-black text-sm font-medium px-4 py-2 flex items-center justify-between">
              <span>Trial active — {trialBanner.daysRemaining} day{trialBanner.daysRemaining !== 1 ? "s" : ""} remaining</span>
              <button onClick={() => setBannerDismissed(true)} className="ml-4 font-bold hover:opacity-70">×</button>
            </div>
          )}
          <div key={pathname} className="h-full">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>

      {showGuide && <OnboardingModal onClose={() => setShowGuide(false)} />}
      <QuickAddIdea />
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <SegmentProvider>
        <PlanStatusProvider>
          <DashboardShell>{children}</DashboardShell>
        </PlanStatusProvider>
      </SegmentProvider>
    </AuthGuard>
  );
}
