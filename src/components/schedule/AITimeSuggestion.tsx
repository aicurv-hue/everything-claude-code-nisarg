"use client";

import { Sparkles, RefreshCw, Clock } from "lucide-react";

interface Suggestion {
  slot: string;
  day_of_week: string;
  time_label: string;
  score: number;
  reasoning: string;
}

interface Props {
  suggestions: Suggestion[];
  isLoading: boolean;
  onSelect: (slot: string) => void;
  onRefresh: () => void;
  isCorporate?: boolean;
}

export default function AITimeSuggestion({ suggestions, isLoading, onSelect, onRefresh, isCorporate }: Props) {
  const accent      = isCorporate ? "#7C3AED" : "#0A66C2";
  const accentLight = isCorporate ? "bg-violet-50 border-violet-200" : "bg-blue-500/10 border-blue-800/40";
  const accentText  = isCorporate ? "text-violet-400" : "text-[var(--primary)]";
  const btnClass    = isCorporate
    ? "bg-violet-600 hover:bg-violet-700 text-white"
    : "bg-[var(--primary)] hover:opacity-90 text-white";

  if (isLoading) {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-[var(--text-sub)]">AI Best Times</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-[var(--toggle-bg)] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!suggestions.length) {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-[var(--foreground)]">AI Best Times</span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">No available time slots for this date. Try selecting a different date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-[var(--foreground)]">AI Best Times</span>
          <span className="text-[10px] text-[var(--text-muted)]">· click to apply</span>
        </div>
        <button
          onClick={onRefresh}
          className="w-6 h-6 rounded-md hover:bg-[var(--toggle-bg)] flex items-center justify-center transition-all"
          title="Refresh recommendations"
        >
          <RefreshCw className="w-3 h-3 text-[var(--text-muted)]" />
        </button>
      </div>

      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s.slot)}
          className={`w-full text-left p-3 rounded-xl border-2 transition-all hover:shadow-sm ${
            i === 0 ? `border-2 ${accentLight}` : "border-[var(--border)] bg-[var(--card)] hover:border-slate-300"
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <span className={`text-xs font-bold ${i === 0 ? accentText : "text-[var(--foreground)]"}`}>
                {s.day_of_week}
              </span>
              <span className="text-xs text-[var(--text-muted)] ml-1.5 flex items-center gap-1 inline-flex">
                <Clock className="w-3 h-3" /> {s.time_label}
              </span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              s.score >= 85 ? "bg-green-100 text-emerald-400" :
              s.score >= 70 ? "bg-amber-100 text-amber-400" :
              "bg-[var(--toggle-bg)] text-[var(--text-sub)]"
            }`}>
              {s.score}%
            </span>
          </div>
          {/* Score bar */}
          <div className="h-1 w-full bg-[var(--toggle-bg)] rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${s.score}%`, backgroundColor: accent }}
            />
          </div>
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">{s.reasoning}</p>
        </button>
      ))}
    </div>
  );
}
