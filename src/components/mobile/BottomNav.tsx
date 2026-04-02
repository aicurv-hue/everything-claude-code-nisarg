"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, PenSquare, CalendarDays, Clock, Settings } from "lucide-react";
import { useSegment } from "@/lib/context/segment";

const NAV_ITEMS = [
  { href: "/dashboard",          label: "Home",     icon: BarChart3    },
  { href: "/dashboard/create",   label: "Create",   icon: PenSquare    },
  { href: "/dashboard/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/dashboard/history",  label: "History",  icon: Clock        },
  { href: "/dashboard/settings", label: "Settings", icon: Settings     },
];

export default function BottomNav() {
  const pathname   = usePathname();
  const { isCorporate } = useSegment();
  const activeColor = isCorporate ? "#7C3AED" : "#0A66C2";

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-white/[0.08] md:hidden safe-area-bottom">
      <div className="flex items-stretch h-16">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-w-0 transition-opacity active:opacity-60"
            >
              <Icon
                className="w-5 h-5 shrink-0"
                style={{ color: isActive ? activeColor : "#64748b" }}
              />
              <span
                className="text-[10px] font-medium leading-none truncate"
                style={{ color: isActive ? activeColor : "#64748b" }}
              >
                {label}
              </span>
              {isActive && (
                <span
                  className="absolute bottom-0 w-10 h-0.5 rounded-full"
                  style={{ backgroundColor: activeColor }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
