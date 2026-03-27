import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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
    const { posts, segment = "individual", timezone } = body;
    const userId = uid;

    if (!Array.isArray(posts) || posts.length === 0)
      return NextResponse.json({ error: "No posts provided" }, { status: 400 });
    if (posts.length > 500)
      return NextResponse.json({ error: "Maximum 500 posts per upload" }, { status: 400 });

    if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

    const created: string[] = [];
    const errors: { index: number; error: string }[] = [];

    const minScheduleTime = Date.now() + 60_000; // must be at least 1 minute in the future

    for (let i = 0; i < posts.length; i++) {
      const row = posts[i];
      try {
        const scheduledAt = new Date(row.scheduled_at);
        if (isNaN(scheduledAt.getTime())) throw new Error("Invalid scheduled_at date");
        if (scheduledAt.getTime() < minScheduleTime) throw new Error("scheduled_at must be at least 1 minute in the future");

        const postData = {
          user_id:    userId,
          account_id: "personal-account",
          status:     "scheduled",
          content:    row.content || `[Pending generation] ${row.topic}`,
          topic:      row.topic,
          tone:       row.tone || "professional",
          audience:   row.audience || "",
          length:     row.length || "medium",
          segment:    segment as "individual" | "corporate",
          research_data: {},
          scheduled_at:      scheduledAt,
          schedule_timezone: row.timezone || timezone || "UTC",
          created_at: FieldValue.serverTimestamp(),
        };
        const ref = await adminDb.collection("posts").add(postData);
        created.push(ref.id);
      } catch (err: any) {
        errors.push({ index: i, error: err.message });
      }
    }

    return NextResponse.json({
      scheduled: created.length,
      errors:    errors.length,
      errorDetails: errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
