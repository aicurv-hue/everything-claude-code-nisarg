"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Settings, Building2, User, Brain, PenSquare, FileText, Clock, CalendarDays } from "lucide-react";
import { SegmentProvider, useSegment } from "@/lib/context/segment";

function Sidebar() {
  const { setSegment, isIndividual, isCorporate } = useSegment();
  const pathname = usePathname();

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

      {/* Bottom context */}
      <div className="px-3 pb-5 pt-3 border-t border-white/[0.07]">
        <div className={`px-3 py-2.5 rounded-lg ${isCorporate ? "bg-violet-500/10" : "bg-[#0A66C2]/10"}`}>
          <p className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${isCorporate ? "text-violet-400" : "text-[#0A66C2]"}`}>
            {isIndividual ? "Personal Profile" : "Company Page"}
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {isIndividual ? "Posts go to your LinkedIn profile" : "Posts go to your company page"}
          </p>
        </div>
      </div>
    </aside>
  );
}

function CronPoller() {
  useEffect(() => {
    // Trigger the publish-due worker every 60 seconds in local dev
    // In production, Vercel Cron handles this via vercel.json
    const run = () => {
      fetch("/api/cron/publish-due", { method: "POST" }).catch(() => {});
    };
    run(); // fire immediately on mount
    const id = setInterval(run, 60_000);
    return () => clearInterval(id);
  }, []);
  return null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SegmentProvider>
      <CronPoller />
      <div className="min-h-screen flex bg-slate-50 text-slate-900">
        <Sidebar />
        <main className="flex-1 overflow-auto min-h-screen">
          {children}
        </main>
      </div>
    </SegmentProvider>
  );
}
