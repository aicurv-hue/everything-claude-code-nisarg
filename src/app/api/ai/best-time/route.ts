import { NextRequest, NextResponse } from "next/server";
import { suggestionService } from "@/lib/db/schedule-suggestions";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { withDateContext } from "@/lib/ai/currentContext";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL          = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
const FALLBACK_MODEL = "google/gemini-2.5-flash";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** Build an ISO slot string for a given date + hour:minute in the user's timezone */
function buildSlot(dateStr: string, hour: number, minute: number, tz: string): string {
  const timeStr = `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
  // Parse as if UTC, then adjust by tz offset
  const approx = new Date(`${dateStr}T${timeStr}:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  });
  const parts = formatter.formatToParts(approx);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
  const offsetMs = approx.getTime() - Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return new Date(approx.getTime() + offsetMs).toISOString();
}

/** Get current time in a timezone as total minutes since midnight */
function nowMinutesInTz(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date());
  const h = parseInt(parts.find(p => p.type === "hour")!.value) % 24;
  const m = parseInt(parts.find(p => p.type === "minute")!.value);
  return h * 60 + m;
}

/** Get today's date string in a timezone */
function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
}

/** LinkedIn best times by day (0=Sun..6=Sat) — research-backed defaults */
const BEST_TIMES: Record<number, { hour: number; min: number; score: number; reason: string }[]> = {
  0: [ // Sunday
    { hour: 10, min: 0, score: 52, reason: "Late Sunday morning catches casual weekend scrollers planning for the week." },
    { hour: 17, min: 0, score: 48, reason: "Sunday evening sees some prep-for-Monday LinkedIn activity." },
    { hour: 14, min: 0, score: 44, reason: "Early Sunday afternoon has minimal but steady passive browsing." },
  ],
  1: [ // Monday
    { hour: 8, min: 0, score: 72, reason: "Monday 8 AM catches professionals checking LinkedIn before the week starts." },
    { hour: 12, min: 0, score: 68, reason: "Monday lunch break sees moderate engagement as people ease into the week." },
    { hour: 17, min: 0, score: 64, reason: "End-of-day Monday has moderate scroll activity after first-day tasks." },
  ],
  2: [ // Tuesday
    { hour: 9, min: 0, score: 90, reason: "Tuesday 9 AM is peak B2B engagement — professionals check feeds before meetings." },
    { hour: 12, min: 0, score: 84, reason: "Tuesday lunch hour is a top engagement window for thought leadership content." },
    { hour: 17, min: 30, score: 78, reason: "Tuesday evening wind-down drives high scroll and comment activity." },
  ],
  3: [ // Wednesday
    { hour: 9, min: 0, score: 86, reason: "Midweek mornings see strong feed engagement from decision-makers." },
    { hour: 12, min: 0, score: 82, reason: "Wednesday lunch is a prime secondary window — high share rates on thought pieces." },
    { hour: 17, min: 0, score: 76, reason: "Wednesday EOD sees consistent engagement as professionals browse before leaving." },
  ],
  4: [ // Thursday
    { hour: 9, min: 0, score: 88, reason: "Thursday morning engagement rivals Tuesday — strong for B2B audiences." },
    { hour: 17, min: 0, score: 84, reason: "Thursday 5 PM captures high scroll activity as professionals wind down for the week." },
    { hour: 12, min: 30, score: 78, reason: "Thursday lunch sees professionals actively engaging before Friday wind-down." },
  ],
  5: [ // Friday
    { hour: 9, min: 0, score: 70, reason: "Friday morning still has decent B2B reach but drops compared to mid-week." },
    { hour: 12, min: 0, score: 62, reason: "Friday lunch engagement is moderate — lighter content performs well." },
    { hour: 15, min: 0, score: 56, reason: "Early Friday afternoon catches people wrapping up with casual browsing." },
  ],
  6: [ // Saturday
    { hour: 10, min: 0, score: 50, reason: "Saturday mid-morning has niche engagement from weekend professionals." },
    { hour: 14, min: 0, score: 46, reason: "Saturday afternoon has low but targeted reach — less competition for attention." },
    { hour: 17, min: 0, score: 42, reason: "Saturday evening sees minimal but present professional browsing." },
  ],
};

function formatTimeLabel(hour: number, min: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const h = hour % 12 || 12;
  return min === 0 ? `${h}:00 ${ampm}` : `${h}:${String(min).padStart(2, "0")} ${ampm}`;
}

/** Generate default suggestions for a specific date, respecting 30-min buffer if today */
function getDefaultsForDate(targetDate: string, tz: string) {
  const todayStr = todayInTz(tz);
  const isToday = targetDate === todayStr;
  const nowMins = isToday ? nowMinutesInTz(tz) : -1;
  const minMins = isToday ? nowMins + 30 : 0; // 30 min buffer

  // Get day of week for target date
  const [y, m, d] = targetDate.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();
  const dayName = DAYS[dayOfWeek];

  const candidates = BEST_TIMES[dayOfWeek] || BEST_TIMES[2]; // fallback to Tuesday
  const filtered = candidates
    .filter(c => (c.hour * 60 + c.min) >= minMins)
    .map(c => ({
      slot: buildSlot(targetDate, c.hour, c.min, tz),
      day_of_week: dayName,
      time_label: formatTimeLabel(c.hour, c.min),
      score: c.score,
      reasoning: c.reason,
    }));

  // If all times have passed today, suggest next available 30-min-rounded slot
  if (filtered.length === 0 && isToday) {
    const nextMin = Math.ceil(minMins / 30) * 30;
    if (nextMin < 24 * 60) {
      const h = Math.floor(nextMin / 60);
      const mi = nextMin % 60;
      filtered.push({
        slot: buildSlot(targetDate, h, mi, tz),
        day_of_week: dayName,
        time_label: formatTimeLabel(h, mi),
        score: 60,
        reasoning: "Nearest available time slot — posting sooner keeps your content timely.",
      });
    }
  }

  return filtered.slice(0, 3);
}

async function verifyToken(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !adminAuth) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await verifyToken(req);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const userId = uid;
    const rawSegment = body.segment || "individual";
    const forceRefresh = body.forceRefresh || false;
    const targetDate = body.targetDate || null; // YYYY-MM-DD string
    const tz = body.timezone || "Asia/Calcutta";
    const segment = (rawSegment === "corporate" ? "corporate" : "individual") as "individual" | "corporate";

    // If targetDate is provided, generate date-specific suggestions (no caching for date-specific)
    if (targetDate) {
      // Analyse past published posts for AI-enhanced suggestions
      let segPosts: any[] = [];
      if (adminDb) {
        try {
          const snap = await adminDb.collection("posts")
            .where("user_id", "==", userId)
            .where("status", "==", "published")
            .get();
          segPosts = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((p: any) => p.segment === segment)
            .slice(0, 30);
        } catch { /* ignore */ }
      }

      const freq: Record<string, number> = {};
      for (const p of segPosts) {
        const secs = p.published_at?.seconds || p.created_at?.seconds;
        if (!secs) continue;
        const d = new Date(secs * 1000);
        const key = `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}`;
        freq[key] = (freq[key] || 0) + 1;
      }

      const todayStr = todayInTz(tz);
      const isToday = targetDate === todayStr;
      const nowMins = isToday ? nowMinutesInTz(tz) : -1;
      const minMins = isToday ? nowMins + 30 : 0;

      const [y, mo, da] = targetDate.split("-").map(Number);
      const dayOfWeek = new Date(y, mo - 1, da).getDay();
      const dayName = DAYS[dayOfWeek];

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey || segPosts.length < 3) {
        // Use research-backed defaults for the specific day
        const defaults = getDefaultsForDate(targetDate, tz);
        return NextResponse.json({ user_id: userId, segment, suggestions: defaults, posts_analyzed: segPosts.length });
      }

      // AI-enhanced: ask for best times on this specific day
      const minTimeStr = isToday ? `Earliest allowed time: ${formatTimeLabel(Math.floor(minMins / 60), minMins % 60)} (30 min from now). Do NOT suggest times before this.` : "";

      const prompt = `You are a LinkedIn growth strategist. Recommend 3 optimal posting TIMES for ${dayName}, ${targetDate}.

Segment: ${segment}
User's timezone: ${tz}
Posts analyzed: ${segPosts.length}
Past posting frequency by day+hour: ${JSON.stringify(freq)}
${minTimeStr}

LinkedIn engagement research:
- Tue-Thu 8-10 AM: Peak B2B engagement, professionals check feeds before meetings
- Tue-Thu 12-1 PM: Strong lunch-break engagement window
- Tue-Thu 5-6 PM: End-of-day scroll activity, high engagement
- Mon/Fri: Moderate engagement, lower than mid-week
- Weekends: Low engagement but less competition

Return ONLY a JSON array of exactly 3 objects sorted by score descending, no markdown:
[{"hour":9,"minute":0,"time_label":"9:00 AM","score":88,"reasoning":"One sentence why this time works for ${dayName}."}]`;

      let parsed: any[] = [];
      for (const m of [MODEL, FALLBACK_MODEL]) {
        try {
          const res = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: m, temperature: 0.3, messages: withDateContext([{ role: "user", content: prompt }]) }),
          });
          const aiData = await res.json();
          const raw = aiData.choices?.[0]?.message?.content || "[]";
          try {
            const candidate = JSON.parse(raw.replace(/```json?|```/g, "").trim());
            if (Array.isArray(candidate) && candidate.length > 0) { parsed = candidate; break; }
          } catch { /* try next model */ }
        } catch { /* try next model */ }
      }
      try {

        if (parsed.length > 0) {
          const suggestions = parsed
            .filter((s: any) => {
              const totalMin = (s.hour || 0) * 60 + (s.minute || 0);
              return totalMin >= minMins;
            })
            .map((s: any) => ({
              slot: buildSlot(targetDate, s.hour, s.minute || 0, tz),
              day_of_week: dayName,
              time_label: s.time_label || formatTimeLabel(s.hour, s.minute || 0),
              score: Math.min(100, Math.max(0, s.score)),
              reasoning: s.reasoning,
            }))
            .slice(0, 3);

          if (suggestions.length > 0) {
            return NextResponse.json({ user_id: userId, segment, suggestions, posts_analyzed: segPosts.length });
          }
        }
      } catch { /* fall through to defaults */ }

      // Fallback to research-backed defaults
      const defaults = getDefaultsForDate(targetDate, tz);
      return NextResponse.json({ user_id: userId, segment, suggestions: defaults, posts_analyzed: segPosts.length });
    }

    // Legacy: no targetDate — return cached generic suggestions
    if (!forceRefresh) {
      const cached = await suggestionService.getValid(userId, segment);
      if (cached) return NextResponse.json(cached);
    }

    const defaults = getDefaultsForDate(todayInTz(tz), tz);
    const result = { user_id: userId, segment, suggestions: defaults, posts_analyzed: 0 };
    await suggestionService.save(result);
    return NextResponse.json({ ...result, generated_at: { seconds: Date.now() / 1000 }, expires_at: { seconds: (Date.now() + 7*24*3600*1000) / 1000 } });

  } catch (err: any) {
    console.error("best-time error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const segment = body.segment || "individual";
  await suggestionService.invalidate(uid, segment);
  return NextResponse.json({ ok: true });
}
