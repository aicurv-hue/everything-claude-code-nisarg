import { NextRequest, NextResponse } from "next/server";
import { suggestionService } from "@/lib/db/schedule-suggestions";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL          = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash";

function nextOccurrence(dayOfWeek: number, hour: number, minute = 0): string {
  const now = new Date();
  const result = new Date(now);
  result.setHours(hour, minute, 0, 0);
  const diff = (dayOfWeek - now.getDay() + 7) % 7 || (result <= now ? 7 : 0);
  result.setDate(result.getDate() + diff);
  return result.toISOString();
}

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

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
    const body = await req.json();
    const userId = uid || body.userId || "demo-user";
    const rawSegment = body.segment || "individual";
    const forceRefresh = body.forceRefresh || false;
    const segment = (rawSegment === "corporate" ? "corporate" : "individual") as "individual" | "corporate";

    // Return cached if valid
    if (!forceRefresh) {
      const cached = await suggestionService.getValid(userId, segment);
      if (cached) return NextResponse.json(cached);
    }

    // Analyse past published posts via Admin SDK
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      // Return sensible defaults without AI when key not set
      const defaults = [
        { slot: nextOccurrence(2, 9),  day_of_week: "Tuesday",   time_label: "9:00 AM",  score: 88, reasoning: "B2B audiences are most active Tuesday mornings before meetings begin." },
        { slot: nextOccurrence(4, 17), day_of_week: "Thursday",  time_label: "5:00 PM",  score: 82, reasoning: "End-of-day Thursday sees high scroll activity as professionals wind down." },
        { slot: nextOccurrence(3, 12), day_of_week: "Wednesday", time_label: "12:00 PM", score: 76, reasoning: "Midweek lunch breaks are a strong secondary engagement window on LinkedIn." },
      ];
      const result = { user_id: userId, segment, suggestions: defaults, posts_analyzed: segPosts.length };
      await suggestionService.save(result);
      return NextResponse.json({ ...result, generated_at: { seconds: Date.now() / 1000 }, expires_at: { seconds: (Date.now() + 7*24*3600*1000) / 1000 } });
    }

    const prompt = `You are a LinkedIn growth strategist. Analyze this posting pattern and recommend 3 optimal future posting slots.

Segment: ${segment}
Posts analyzed: ${segPosts.length}
Past posting frequency by day+hour: ${JSON.stringify(freq)}

Known LinkedIn engagement windows: B2B professionals engage most Tue–Thu 8–10am and 5–6pm. Avoid weekends and Mondays.

Return ONLY a JSON array of exactly 3 objects, no markdown:
[{"day_of_week":"Tuesday","hour":9,"minute":0,"time_label":"9:00 AM","score":88,"reasoning":"One sentence explaining why."}]`;

    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, temperature: 0.3, messages: [{ role: "user", content: prompt }] }),
    });

    const aiData = await res.json();
    const raw    = aiData.choices?.[0]?.message?.content || "[]";

    let parsed: any[] = [];
    try {
      parsed = JSON.parse(raw.replace(/```json?|```/g, "").trim());
      if (!Array.isArray(parsed)) parsed = [];
    } catch {
      console.warn("[best-time] AI returned non-JSON, using defaults");
      parsed = [];
    }

    // Fall back to defaults if AI returned nothing usable
    if (parsed.length === 0) {
      const defaults = [
        { slot: nextOccurrence(2, 9),  day_of_week: "Tuesday",   time_label: "9:00 AM",  score: 88, reasoning: "B2B audiences are most active Tuesday mornings." },
        { slot: nextOccurrence(4, 17), day_of_week: "Thursday",  time_label: "5:00 PM",  score: 82, reasoning: "End-of-day Thursday sees high scroll activity." },
        { slot: nextOccurrence(3, 12), day_of_week: "Wednesday", time_label: "12:00 PM", score: 76, reasoning: "Midweek lunch breaks are a strong engagement window." },
      ];
      const result = { user_id: userId, segment, suggestions: defaults, posts_analyzed: segPosts.length };
      await suggestionService.save(result);
      return NextResponse.json({ ...result, generated_at: { seconds: Date.now() / 1000 }, expires_at: { seconds: (Date.now() + 7*24*3600*1000) / 1000 } });
    }

    const suggestions = parsed
      .map((s: any) => {
        const dayIdx = DAYS.indexOf(s.day_of_week);
        if (dayIdx === -1) return null; // skip invalid day names
        return {
          slot:        nextOccurrence(dayIdx, s.hour, s.minute || 0),
          day_of_week: s.day_of_week,
          time_label:  s.time_label,
          score:       Math.min(100, Math.max(0, s.score)),
          reasoning:   s.reasoning,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const result = { user_id: userId, segment, suggestions, posts_analyzed: segPosts.length };
    await suggestionService.save(result);
    return NextResponse.json({ ...result, generated_at: { seconds: Date.now() / 1000 }, expires_at: { seconds: (Date.now() + 7*24*3600*1000) / 1000 } });

  } catch (err: any) {
    console.error("best-time error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await verifyToken(req);
  const body = await req.json().catch(() => ({}));
  const userId = uid || body.userId || "demo-user";
  const segment = body.segment || "individual";
  await suggestionService.invalidate(userId, segment);
  return NextResponse.json({ ok: true });
}
