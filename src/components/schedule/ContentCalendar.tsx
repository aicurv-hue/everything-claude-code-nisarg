"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, List } from "lucide-react";
import { Post } from "@/lib/db/posts";

interface Props {
  posts: Post[];
  segment: "individual" | "corporate";
  onPostClick: (post: Post) => void;
}

const DAYS_SHORT   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS       = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const STATUS_PILL: Record<string, string> = {
  scheduled: "bg-amber-100 text-amber-800 border-amber-200",
  published: "bg-green-100 text-green-800 border-green-200",
  failed:    "bg-red-100 text-red-800 border-red-200",
  draft:     "bg-blue-100 text-blue-800 border-blue-200",
};

const STATUS_DOT: Record<string, string> = {
  scheduled: "bg-amber-500",
  published: "bg-green-500",
  failed:    "bg-red-500",
  draft:     "bg-blue-500",
};

function getPostDate(post: Post): Date | null {
  const secs = post.scheduled_at?.seconds || post.published_at?.seconds || post.created_at?.seconds;
  return secs ? new Date(secs * 1000) : null;
}

const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+5:30

function toISTMidnight(d: Date): string {
  // Returns "YYYY-MM-DD" string in IST for date comparison
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const mm  = String(ist.getUTCMonth() + 1).padStart(2, "0"); // getUTCMonth() is 0-indexed
  const dd  = String(ist.getUTCDate()).padStart(2, "0");
  return `${ist.getUTCFullYear()}-${mm}-${dd}`;
}

function isSameDay(a: Date, b: Date) {
  return toISTMidnight(a) === toISTMidnight(b);
}

export default function ContentCalendar({ posts: allPosts, segment, onPostClick }: Props) {
  const isCorp = segment === "corporate";
  const accent = isCorp ? "text-violet-600" : "text-[#0A66C2]";
  const accentBg = isCorp ? "bg-violet-600" : "bg-[#0A66C2]";

  // Drafts don't belong on the calendar — only show scheduled, published, failed
  const posts = allPosts.filter(p => p.status !== "draft");

  const [view, setView]         = useState<"month" | "list">("month");
  const [current, setCurrent]   = useState(new Date());

  // Derive year/month in IST so the calendar header reflects the IST date
  const nowIST = new Date(current.getTime() + IST_OFFSET_MS);
  const year  = nowIST.getUTCFullYear();
  const month = nowIST.getUTCMonth();

  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = new Date();

  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    // Build cells as UTC dates representing midnight IST for each calendar day
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, month, i + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const postsOnDay = (day: Date) =>
    posts.filter((p) => { const d = getPostDate(p); return d && isSameDay(d, day); });

  const prev = () => setCurrent(new Date(Date.UTC(year, month - 1, 1)));
  const next = () => setCurrent(new Date(Date.UTC(year, month + 1, 1)));

  // List view — sorted by date
  const sortedPosts = [...posts].sort((a, b) => {
    const as = a.scheduled_at?.seconds || a.created_at?.seconds || 0;
    const bs = b.scheduled_at?.seconds || b.created_at?.seconds || 0;
    return as - bs;
  });

  return (
    <div className="card overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prev} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <h2 className="text-base font-bold text-slate-900 min-w-[160px] text-center">
            {MONTHS[month]} {year}
          </h2>
          <button onClick={next} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => setCurrent(new Date())}
            className="px-3 py-1 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all"
          >
            Today
          </button>
        </div>

        {/* Legend + view toggle */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500">
            {[["scheduled","Scheduled"],["published","Published"],["failed","Failed"]].map(([s, l]) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                {l}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setView("month")}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${view === "month" ? `${accentBg} text-white shadow-sm` : "text-slate-500 hover:text-slate-700"}`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${view === "list" ? `${accentBg} text-white shadow-sm` : "text-slate-500 hover:text-slate-700"}`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Month view */}
      {view === "month" && (
        <div>
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
            {DAYS_SHORT.map((d) => (
              <div key={d} className="py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="bg-slate-50/50 min-h-[100px]" />;
              const isToday = isSameDay(day, today);
              const dayPosts = postsOnDay(day);
              const visible = dayPosts.slice(0, 2);
              const overflow = dayPosts.length - 2;

              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[100px] p-2 transition-colors ${dayPosts.length > 0 ? "hover:bg-slate-50" : ""}`}
                >
                  {/* Day number */}
                  <div className="flex justify-end mb-1.5">
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday ? `${accentBg} text-white` : "text-slate-500"
                    }`}>
                      {day.getUTCDate()}
                    </span>
                  </div>

                  {/* Post pills */}
                  <div className="space-y-1">
                    {visible.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => onPostClick(p)}
                        className={`w-full text-left px-2 py-1 rounded-md border text-[10px] font-medium truncate transition-all hover:shadow-sm ${STATUS_PILL[p.status] || STATUS_PILL.draft}`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${STATUS_DOT[p.status] || STATUS_DOT.draft}`} />
                        {p.topic || p.content.slice(0, 25)}
                      </button>
                    ))}
                    {overflow > 0 && (
                      <button
                        onClick={() => onPostClick(dayPosts[2])}
                        className="text-[10px] text-slate-400 hover:text-slate-600 pl-1"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="divide-y divide-slate-50">
          {sortedPosts.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">No posts this month.</div>
          ) : sortedPosts.map((p) => {
            const d = getPostDate(p);
            return (
              <button
                key={p.id}
                onClick={() => onPostClick(p)}
                className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4 group"
              >
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[p.status] || STATUS_DOT.draft}`} />

                {/* Date */}
                <div className="w-24 shrink-0">
                  <p className="text-xs font-semibold text-slate-700">
                    {d ? d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : "—"}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {d ? d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                </div>

                {/* Topic + content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium text-slate-800 group-hover:${accent} transition-colors truncate`}>
                    {p.topic || p.content.slice(0, 60)}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">{p.tone} · {p.segment}</p>
                </div>

                {/* Status badge */}
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border capitalize shrink-0 ${STATUS_PILL[p.status] || STATUS_PILL.draft}`}>
                  {p.status}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
