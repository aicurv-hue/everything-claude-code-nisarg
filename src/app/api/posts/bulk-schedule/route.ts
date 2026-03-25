import { NextRequest, NextResponse } from "next/server";
import { postService } from "@/lib/db/posts";

export async function POST(req: NextRequest) {
  try {
    const { posts, segment = "individual", timezone, userId } = await req.json();

    if (!Array.isArray(posts) || posts.length === 0)
      return NextResponse.json({ error: "No posts provided" }, { status: 400 });
    if (posts.length > 500)
      return NextResponse.json({ error: "Maximum 500 posts per upload" }, { status: 400 });

    const mapped = posts.map((row: any) => ({
      user_id:    userId || "anonymous",
      account_id: "personal-account",
      // content is optional — if blank, a placeholder is stored and Neel generates at publish time
      content:    row.content || `[Pending generation] ${row.topic}`,
      topic:      row.topic,
      tone:       row.tone || "professional",
      audience:   row.audience || "",
      length:     (row.length as any) || "medium",
      segment:    segment as "individual" | "corporate",
      research_data: {},
      scheduled_at:      new Date(row.scheduled_at),
      schedule_timezone: row.timezone || timezone || "UTC",
    }));

    const result = await postService.createBulkScheduled(mapped);

    return NextResponse.json({
      scheduled: result.created.length,
      errors:    result.errors.length,
      errorDetails: result.errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
