"use client";

import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  text: string;
  /** Where the tooltip appears relative to the icon. Default: "top" */
  position?: "top" | "bottom" | "left" | "right";
  /** Optional example string shown in a code-style block below the main text */
  example?: string;
  /** Width of the tooltip panel. Default: "w-64" */
  width?: string;
}

/**
 * A small ❓ icon that reveals an explanation tooltip on hover.
 * Usage: place it inline next to any label.
 *
 * <HelpTooltip
 *   text="ICP is your ideal customer profile — the exact type of person most likely to buy from you."
 *   example="e.g. SaaS founders at seed stage with 5–20 person teams"
 * />
 */
export function HelpTooltip({ text, position = "top", example, width = "w-64" }: HelpTooltipProps) {
  const positionClass = {
    top:    "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left:   "right-full top-1/2 -translate-y-1/2 mr-2",
    right:  "left-full top-1/2 -translate-y-1/2 ml-2",
  }[position];

  const arrowClass = {
    top:    "top-full left-1/2 -translate-x-1/2 border-t-slate-800",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-800",
    left:   "left-full top-1/2 -translate-y-1/2 border-l-slate-800",
    right:  "right-full top-1/2 -translate-y-1/2 border-r-slate-800",
  }[position];

  return (
    <span className="relative inline-flex items-center group">
      <HelpCircle className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--primary)] cursor-help transition-colors" />
      <span
        className={`pointer-events-none absolute z-50 ${positionClass} ${width} rounded-lg bg-[var(--card)] border border-[var(--border)] px-3 py-2.5 shadow-xl
          opacity-0 group-hover:opacity-100 transition-opacity duration-150`}
      >
        <p className="text-[12px] text-[var(--foreground)] leading-relaxed">{text}</p>
        {example && (
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)] bg-[var(--border)]/40 rounded px-2 py-1 leading-relaxed italic">
            {example}
          </p>
        )}
        {/* Arrow */}
        <span className={`absolute border-4 border-transparent ${arrowClass}`} />
      </span>
    </span>
  );
}

interface FieldHintProps {
  children: React.ReactNode;
}

/**
 * A subtle always-visible hint line below a form field.
 * Use for short context clues that don't need to be hidden.
 */
export function FieldHint({ children }: FieldHintProps) {
  return (
    <p className="mt-1.5 text-[11px] text-[var(--text-muted)] leading-relaxed">{children}</p>
  );
}
