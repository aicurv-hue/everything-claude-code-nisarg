"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Menu } from "lucide-react";
import { useSegment } from "@/lib/context/segment";
import MobileMenu from "./MobileMenu";

const TITLES: Record<string, string> = {
  "/dashboard":           "Dashboard",
  "/dashboard/create":    "Create Post",
  "/dashboard/drafts":    "Drafts",
  "/dashboard/schedule":  "Schedule",
  "/dashboard/campaigns": "Campaigns",
  "/dashboard/ideas":     "Idea Bank",
  "/dashboard/history":   "History",
  "/dashboard/analytics": "Analytics",
  "/dashboard/memory":    "AI Memory",
  "/dashboard/settings":  "Settings",
  "/dashboard/billing":   "Billing",
  "/dashboard/guide":     "Guide",
};

const BACK_ROUTES: Record<string, string> = {
  "/dashboard/create/preview": "/dashboard/create",
  "/dashboard/schedule/bulk":  "/dashboard/schedule",
};

export default function MobileHeader() {
  const pathname = usePathname();
  const router   = useRouter();
  const { isCorporate } = useSegment();
  const [menuOpen, setMenuOpen] = useState(false);

  const title    = TITLES[pathname] ?? TITLES[Object.keys(TITLES).find(k => pathname.startsWith(k)) ?? ""] ?? "Cridl";
  const backHref = Object.keys(BACK_ROUTES).find(k => pathname.startsWith(k));
  const accentColor = isCorporate ? "#7C3AED" : "#0A66C2";

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 flex items-center h-14 px-3 bg-[var(--sidebar)] border-b border-white/[0.08] safe-area-top">
        {backHref ? (
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center text-[var(--text-muted)] active:text-white transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => setMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center text-[var(--text-muted)] active:text-white transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex-1 flex items-center justify-center gap-2">
          {!backHref && (
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${accentColor}, #0854a0)` }}>
              <span className="text-white font-bold text-[10px]">L</span>
            </div>
          )}
          <h1 className="text-sm font-semibold text-white truncate">{title}</h1>
        </div>
        {/* Spacer to keep title centred */}
        <div className="w-9" />
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
