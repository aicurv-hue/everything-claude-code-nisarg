import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace("Bearer ", "");
    if (!idToken || !adminAuth) return false;
    const decoded = await adminAuth.verifyIdToken(idToken);
    return ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || "");
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminAuth || !adminDb) return NextResponse.json({ error: "Admin SDK not configured." }, { status: 503 });

  try {
    const [usersResult, allPostsSnap, scheduledSnap, publishedSnap, tokensSnap] = await Promise.all([
      adminAuth.listUsers(1000),
      adminDb.collection("posts").count().get(),
      adminDb.collection("posts").where("status", "==", "scheduled").count().get(),
      adminDb.collection("posts").where("status", "==", "published").count().get(),
      adminDb.collection("tokens").count().get(),
    ]);

    return NextResponse.json({
      totalUsers:        usersResult.users.length,
      totalPosts:        allPostsSnap.data().count,
      scheduledPosts:    scheduledSnap.data().count,
      publishedPosts:    publishedSnap.data().count,
      linkedInConnected: tokensSnap.data().count,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
