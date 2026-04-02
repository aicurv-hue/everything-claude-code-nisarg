"use client";

import { useState, useEffect } from "react";
import { X, CalendarDays, Clock, Globe } from "lucide-react";
import AITimeSuggestion from "./AITimeSuggestion";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface Props {
  onSchedule: (scheduledAt: Date, timezone: string, bestTimeApplied: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
  userId?: string;
  segment?: "individual" | "corporate";
  initialDate?: Date;
}

/** Format a Date as YYYY-MM-DD in the given timezone */
function toTZDateString(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
}

/** Format a Date as HH:MM in the given timezone */
function toTZTimeString(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

/**
 * Convert a local date string + time string in a given timezone to a UTC Date.
 * Uses the Intl API to determine the UTC offset for that timezone at that moment.
 */
function localToUtc(dateStr: string, timeStr: string, tz: string): Date {
  // Treat dateStr+timeStr as UTC to get an approximate timestamp
  const approx = new Date(`${dateStr}T${timeStr}:00Z`);
  // Determine what that UTC time looks like in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(approx);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
  // The UTC offset at this moment (ms): approx UTC - how it appears in tz as UTC
  const offsetMs = approx.getTime() - Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  // Apply offset: local time in tz → UTC
  return new Date(approx.getTime() + offsetMs);
}

export default function SchedulePicker({ onSchedule, onCancel, isLoading, userId = "demo-user", segment = "individual", initialDate }: Props) {
  const isCorporate = segment === "corporate";
  const accent      = isCorporate ? "bg-violet-600 hover:bg-violet-700" : "bg-[#0A66C2] hover:bg-[#0854a0]";
  const focusRing   = isCorporate ? "focus:ring-violet-500/20 focus:border-violet-500" : "focus:ring-[#0A66C2]/20 focus:border-[#0A66C2]";

  // Detect browser timezone on mount
  const [timezone] = useState<string>(() =>
    typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC"
  );

  const init = initialDate || new Date(Date.now() + 24 * 3600 * 1000);
  const [date, setDate]             = useState(() => toTZDateString(init, timezone));
  const [time, setTime]             = useState("09:00");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [aiLoading, setAiLoading]   = useState(true);
  const [bestApplied, setBestApplied] = useState(false);

  const inputClass = `w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 transition-all ${focusRing}`;

  const DEFAULT_SUGGESTIONS = [
    { slot: "", day_of_week: "Tuesday",   time_label: "9:00 AM",  score: 88, reasoning: "B2B audiences are most active Tuesday mornings before meetings begin." },
    { slot: "", day_of_week: "Thursday",  time_label: "5:00 PM",  score: 82, reasoning: "End-of-day Thursday sees high scroll activity as professionals wind down." },
    { slot: "", day_of_week: "Wednesday", time_label: "12:00 PM", score: 76, reasoning: "Midweek lunch breaks are a strong secondary engagement window on LinkedIn." },
  ];

  const fetchSuggestions = async (forceRefresh = false) => {
    setAiLoading(true);
    if (forceRefresh) setSuggestions([]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/ai/best-time", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId, segment, ...(forceRefresh ? { forceRefresh: true } : {}) }),
      });
      const d = await res.json();
      if (d.suggestions?.length) {
        setSuggestions(d.suggestions);
      } else {
        setSuggestions(DEFAULT_SUGGESTIONS);
      }
    } catch {
      setSuggestions(DEFAULT_SUGGESTIONS);
    } finally {
      clearTimeout(timer);
      setAiLoading(false);
    }
  };

  useEffect(() => { fetchSuggestions(); }, [userId, segment]); // eslint-disable-line

  const handleApplySuggestion = (slot: string) => {
    const d = new Date(slot);
    setDate(toTZDateString(d, timezone));
    setTime(toTZTimeString(d, timezone));
    setBestApplied(true);
  };

  const [submitError, setSubmitError] = useState<string | null>(null);

  const minDate = toTZDateString(new Date(), timezone);
  const selectedDt = localToUtc(date, time, timezone);
  const isValid = !isNaN(selectedDt.getTime());

  const handleSubmit = () => {
    const dt = localToUtc(date, time, timezone);
    if (isNaN(dt.getTime())) {
      setSubmitError("Please enter a valid date and time.");
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
            onRefresh={() => fetchSuggestions(true)}
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
