import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken || !adminAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    if (!adminDb) {
      return NextResponse.json({ error: "DB not configured" }, { status: 503 });
    }

    const segment = req.nextUrl.searchParams.get("segment") || "individual";

    // Run posts + profile fetch in parallel
    const [postsSnap, profileSnap] = await Promise.all([
      adminDb
        .collection("posts")
        .where("user_id", "==", uid)
        .where("segment", "==", segment)
        .limit(100)
        .get(),
      adminDb.collection("profiles").doc(uid).get(),
    ]);

    const posts = postsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        created_at:   data.created_at?.seconds   ? { seconds: data.created_at.seconds }   : null,
        published_at: data.published_at?.seconds ? { seconds: data.published_at.seconds } : null,
        scheduled_at: data.scheduled_at?.seconds ? { seconds: data.scheduled_at.seconds } : null,
      };
    }).sort((a: any, b: any) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));

    const stats = {
      total:     posts.length,
      published: posts.filter((p: any) => p.status === "published").length,
      drafts:    posts.filter((p: any) => p.status === "draft").length,
      scheduled: posts.filter((p: any) => p.status === "scheduled").length,
      failed:    posts.filter((p: any) => p.status === "failed").length,
      lastWeek:  posts.filter((p: any) => {
        const ts = (p.published_at?.seconds || p.created_at?.seconds || 0) * 1000;
        return ts > Date.now() - 7 * 24 * 60 * 60 * 1000 && p.status === "published";
      }).length,
    };

    return NextResponse.json({
      stats,
      posts: posts.slice(0, 20),
      allPosts: posts,
      profile: profileSnap.exists ? profileSnap.data() : null,
    });
  } catch (e: any) {
    console.error("[dashboard/data]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
