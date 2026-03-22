"use client";

import { useState, useEffect } from "react";
import { X, CalendarDays, Clock, Globe } from "lucide-react";
import AITimeSuggestion from "./AITimeSuggestion";

interface Props {
  onSchedule: (scheduledAt: Date, timezone: string, bestTimeApplied: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
  userId?: string;
  segment?: "individual" | "corporate";
  initialDate?: Date;
}

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function toLocalTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function SchedulePicker({ onSchedule, onCancel, isLoading, userId = "demo-user", segment = "individual", initialDate }: Props) {
  const isCorporate = segment === "corporate";
  const accent      = isCorporate ? "bg-violet-600 hover:bg-violet-700" : "bg-[#0A66C2] hover:bg-[#0854a0]";
  const focusRing   = isCorporate ? "focus:ring-violet-500/20 focus:border-violet-500" : "focus:ring-[#0A66C2]/20 focus:border-[#0A66C2]";

  const init     = initialDate || new Date(Date.now() + 24 * 3600 * 1000);
  const [date, setDate]             = useState(toLocalDateString(init));
  const [time, setTime]             = useState("09:00");
  const [timezone]                  = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [aiLoading, setAiLoading]   = useState(true);
  const [bestApplied, setBestApplied] = useState(false);

  const inputClass = `w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all ${focusRing}`;

  useEffect(() => {
    setAiLoading(true);
    fetch("/api/ai/best-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, segment }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.suggestions) setSuggestions(d.suggestions); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [userId, segment]);

  const handleApplySuggestion = (slot: string) => {
    const d = new Date(slot);
    setDate(toLocalDateString(d));
    setTime(toLocalTimeString(d));
    setBestApplied(true);
  };

  const handleRefreshAI = () => {
    setAiLoading(true);
    setSuggestions([]);
    fetch("/api/ai/best-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, segment, forceRefresh: true }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.suggestions) setSuggestions(d.suggestions); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  };

  const [submitError, setSubmitError] = useState<string | null>(null);

  const minDate = toLocalDateString(new Date(Date.now() + 10 * 60 * 1000));

  // isValid: full datetime must be at least 10 min in the future
  const selectedDt = new Date(`${date}T${time}`);
  const isValid = !isNaN(selectedDt.getTime()) && selectedDt.getTime() > Date.now() + 10 * 60 * 1000;

  const handleSubmit = () => {
    const dt = new Date(`${date}T${time}`);
    if (isNaN(dt.getTime())) {
      setSubmitError("Please enter a valid date and time.");
      return;
    }
    if (dt.getTime() <= Date.now() + 10 * 60 * 1000) {
      setSubmitError("Please choose a time at least 10 minutes in the future.");
      return;
    }
    setSubmitError(null);
    onSchedule(dt, timezone, bestApplied);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCorporate ? "bg-violet-100" : "bg-blue-100"}`}>
              <CalendarDays className={`w-4 h-4 ${isCorporate ? "text-violet-600" : "text-[#0A66C2]"}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Schedule Post</p>
              <p className="text-[11px] text-slate-400">Pick a date & time</p>
            </div>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Date & Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" /> Date
              </label>
              <input
                type="date"
                value={date}
                min={minDate}
                onChange={(e) => { setDate(e.target.value); setBestApplied(false); setSubmitError(null); }}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => { setTime(e.target.value); setBestApplied(false); setSubmitError(null); }}
                className={inputClass}
              />
            </div>
          </div>

          {/* Timezone */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500 truncate">{timezone}</span>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100" />

          {/* AI suggestions */}
          <AITimeSuggestion
            suggestions={suggestions}
            isLoading={aiLoading}
            onSelect={handleApplySuggestion}
            onRefresh={handleRefreshAI}
            isCorporate={isCorporate}
          />

        </div>

        {/* Footer */}
        {submitError && (
          <div className="px-6 pb-2">
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
          </div>
        )}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isLoading}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 ${accent}`}
          >
            {isLoading ? "Scheduling…" : "Confirm Schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
