"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, PenSquare, FileText, CalendarDays, Zap, Lightbulb, Clock,
  TrendingUp, Brain, UserCircle2, CreditCard, BookOpen, LogOut, X,
} from "lucide-react";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { usePlanStatus } from "@/lib/context/planStatus";
import Logo from "@/components/ui/Logo";

const NAV_GROUPS = [
  {
    label: null as string | null,
    items: [
      { href: "/dashboard",           label: "Home",        Icon: LayoutDashboard },
      { href: "/dashboard/create",    label: "Create Post", Icon: PenSquare       },
      { href: "/dashboard/drafts",    label: "Drafts",      Icon: FileText        },
      { href: "/dashboard/schedule",  label: "Schedule",    Icon: CalendarDays    },
      { href: "/dashboard/campaigns", label: "Campaigns",   Icon: Zap             },
      { href: "/dashboard/ideas",     label: "Idea Bank",   Icon: Lightbulb       },
      { href: "/dashboard/history",   label: "History",     Icon: Clock           },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", Icon: TrendingUp },
      { href: "/dashboard/memory",    label: "AI Memory", Icon: Brain      },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/dashboard/settings", label: "Profile", Icon: UserCircle2 },
      { href: "/dashboard/billing",  label: "Billing", Icon: CreditCard  },
      { href: "/dashboard/guide",    label: "Guide",   Icon: BookOpen    },
    ],
  },
];

export default function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setSegment, isIndividual, isCorporate } = useSegment();
  const { user, logOut } = useAuth();
  const { plan, status, loading: planLoading } = usePlanStatus();

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Free";
  const isFree = !plan || plan === "free";
  const isTrial = status === "trial";

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />

      {/* Drawer */}
      <aside
        className={`absolute left-0 top-0 bottom-0 w-[82%] max-w-[300px] bg-[var(--sidebar)] border-r border-white/[0.08] shadow-2xl flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Header — logo + close */}
        <div className="px-4 h-14 flex items-center justify-between border-b border-white/[0.06] safe-area-top shrink-0">
          <Logo size="md" />
          <button
            onClick={onClose}
            className="w-8 h-8 -mr-1 flex items-center justify-center text-[var(--text-muted)] active:text-white"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segment toggle */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="bg-[var(--background)] rounded-lg p-[3px] flex gap-[2px] border border-[var(--border)]">
            <button
              onClick={() => setSegment("individual")}
              className={`flex-1 py-[7px] rounded-md text-[12px] font-semibold transition-all ${
                isIndividual ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text-muted)]"
              }`}
            >
              Personal
            </button>
            <button
              onClick={() => setSegment("corporate")}
              className={`flex-1 py-[7px] rounded-md text-[12px] font-semibold transition-all ${
                isCorporate ? "bg-[var(--primary)] text-white shadow-sm" : "text-[var(--text-muted)]"
              }`}
            >
              Company
            </button>
          </div>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label ?? "main"}>
              {group.label && (
                <p className="px-2.5 pt-3.5 pb-[5px] text-[9.5px] font-bold text-[var(--text-muted)] uppercase tracking-[0.1em]">
                  {group.label}
                </p>
              )}
              <div className="space-y-[2px]">
                {group.items.map(({ href, label, Icon }) => {
                  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onClose}
                      className={`flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-[13.5px] transition-all ${
                        isActive
                          ? "bg-[var(--nav-active)] text-[var(--primary)] font-semibold"
                          : "text-[var(--text-sub)] active:bg-[var(--nav-hover)]"
                      }`}
                    >
                      <Icon className={`w-[16px] h-[16px] ${isActive ? "text-[var(--primary)]" : "text-[var(--text-sub)]"}`} />
                      <span className="flex-1">{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Plan badge */}
        {!planLoading && (
          <div className="px-3 pt-2 shrink-0">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--info-bg)] border border-[var(--border)]">
              <span className={`text-[10.5px] font-semibold ${isFree ? "text-amber-400" : isTrial ? "text-violet-400" : "text-[var(--text-sub)]"}`}>
                {isFree ? "Free plan" : isTrial ? "Trial active" : `${planLabel} plan`}
              </span>
              {(isFree || isTrial) && (
                <Link
                  href="/dashboard/billing"
                  onClick={onClose}
                  className={`text-[10.5px] underline underline-offset-2 ${isFree ? "text-amber-400" : "text-violet-400"}`}
                >
                  {isFree ? "Upgrade" : "View"}
                </Link>
              )}
            </div>
          </div>
        )}

        {/* User card */}
        {user && (
          <div className="px-3 py-2.5 mt-2 border-t border-[var(--border)] flex items-center gap-[9px] shrink-0 safe-area-bottom">
            <div className="w-[32px] h-[32px] rounded-full bg-gradient-to-br from-[#2563eb]/80 to-[#2563eb] flex items-center justify-center shrink-0">
              <span className="text-white text-[11px] font-semibold">
                {(user.displayName || user.email || "U").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[var(--foreground)] text-[12.5px] font-semibold truncate">{user.displayName || "User"}</p>
              <p className="text-[var(--text-muted)] text-[10.5px] truncate">{user.email}</p>
            </div>
            <button
              onClick={async () => { onClose(); await logOut(); router.replace("/login"); }}
              className="w-8 h-8 flex items-center justify-center text-[var(--text-muted)] active:text-red-400 shrink-0"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
