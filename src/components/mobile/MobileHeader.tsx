"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useSegment } from "@/lib/context/segment";

const TITLES: Record<string, string> = {
  "/dashboard":           "Dashboard",
  "/dashboard/create":    "Create Post",
  "/dashboard/drafts":    "Drafts",
  "/dashboard/schedule":  "Schedule",
  "/dashboard/history":   "History",
  "/dashboard/analytics": "Analytics",
  "/dashboard/memory":    "Memory",
  "/dashboard/settings":  "Settings",
  "/dashboard/guide":     "Guide",
};

const BACK_ROUTES: Record<string, string> = {
  "/dashboard/create/preview": "/dashboard/create",
  "/dashboard/schedule/bulk":  "/dashboard/schedule",
};

export default function MobileHeader() {
  const pathname    = usePathname();
  const router      = useRouter();
  const { isCorporate } = useSegment();

  const title    = TITLES[pathname] ?? TITLES[Object.keys(TITLES).find(k => pathname.startsWith(k)) ?? ""] ?? "Cridl";
  const backHref = Object.keys(BACK_ROUTES).find(k => pathname.startsWith(k));
  const accentColor = isCorporate ? "#7C3AED" : "#0A66C2";

  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center h-14 px-4 bg-[var(--sidebar)] border-b border-white/[0.08] safe-area-top">
      {backHref ? (
        <button
          onClick={() => router.back()}
          className="w-8 h-8 -ml-1 flex items-center justify-center text-[var(--text-muted)] active:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      ) : (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${accentColor}, #0854a0)` }}>
          <span className="text-white font-bold text-xs">L</span>
        </div>
      )}
      <h1 className="flex-1 text-center text-sm font-semibold text-white">{title}</h1>
      {/* Spacer to keep title centred */}
      <div className="w-8" />
    </header>
  );
}
