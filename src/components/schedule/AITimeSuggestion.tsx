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
  const accentLight = isCorporate ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200";
  const accentText  = isCorporate ? "text-violet-700" : "text-[#0A66C2]";
  const btnClass    = isCorporate
    ? "bg-violet-600 hover:bg-violet-700 text-white"
    : "bg-[#0A66C2] hover:bg-[#0854a0] text-white";

  if (isLoading) {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-slate-600">AI Best Times</span>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!suggestions.length) {
    return (
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-slate-700">AI Best Times</span>
        </div>
        <p className="text-xs text-slate-400">No available time slots for this date. Try selecting a different date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-semibold text-slate-700">AI Best Times</span>
          <span className="text-[10px] text-slate-400">· click to apply</span>
        </div>
        <button
          onClick={onRefresh}
          className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center transition-all"
          title="Refresh recommendations"
        >
          <RefreshCw className="w-3 h-3 text-slate-400" />
        </button>
      </div>

      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSelect(s.slot)}
          className={`w-full text-left p-3 rounded-xl border-2 transition-all hover:shadow-sm ${
            i === 0 ? `border-2 ${accentLight}` : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div>
              <span className={`text-xs font-bold ${i === 0 ? accentText : "text-slate-700"}`}>
                {s.day_of_week}
              </span>
              <span className="text-xs text-slate-500 ml-1.5 flex items-center gap-1 inline-flex">
                <Clock className="w-3 h-3" /> {s.time_label}
              </span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              s.score >= 85 ? "bg-green-100 text-green-700" :
              s.score >= 70 ? "bg-amber-100 text-amber-700" :
              "bg-slate-100 text-slate-600"
            }`}>
              {s.score}%
            </span>
          </div>
          {/* Score bar */}
          <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${s.score}%`, backgroundColor: accent }}
            />
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">{s.reasoning}</p>
        </button>
      ))}
    </div>
  );
}
