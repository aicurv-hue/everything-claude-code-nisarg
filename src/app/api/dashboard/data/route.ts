import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(req: NextRequest) {
  // Verify Firebase auth token
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

    // Fetch posts for this user
    const postsSnap = await adminDb
      .collection("posts")
      .where("user_id", "==", uid)
      .get();

    const posts = postsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        // Convert Firestore Timestamps to plain seconds objects for JSON serialization
        created_at: data.created_at?.seconds ? { seconds: data.created_at.seconds } : null,
        published_at: data.published_at?.seconds ? { seconds: data.published_at.seconds } : null,
        scheduled_at: data.scheduled_at?.seconds ? { seconds: data.scheduled_at.seconds } : null,
      };
    }).sort((a: any, b: any) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));

    const segmentedPosts = posts.filter((p: any) => p.segment === segment);

    const stats = {
      total: segmentedPosts.length,
      published: segmentedPosts.filter((p: any) => p.status === "published").length,
      drafts: segmentedPosts.filter((p: any) => p.status === "draft").length,
      scheduled: segmentedPosts.filter((p: any) => p.status === "scheduled").length,
      failed: segmentedPosts.filter((p: any) => p.status === "failed").length,
      lastWeek: segmentedPosts.filter((p: any) => {
        const ts = (p.published_at?.seconds || p.created_at?.seconds || 0) * 1000;
        return ts > Date.now() - 7 * 24 * 60 * 60 * 1000 && p.status === "published";
      }).length,
    };

    // Fetch profile
    const profileSnap = await adminDb.collection("profiles").doc(uid).get();
    const profile = profileSnap.exists ? profileSnap.data() : null;

    return NextResponse.json({
      stats,
      posts: segmentedPosts.slice(0, 20),
      allPosts: segmentedPosts,
      profile,
    });
  } catch (e: any) {
    console.error("[dashboard/data]", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
