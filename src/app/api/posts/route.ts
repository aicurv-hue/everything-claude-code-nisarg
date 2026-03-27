import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

/** Convert an ISO string or existing Timestamp-like object to a Firestore Timestamp */
function toFirestoreTimestamp(val: any): Timestamp | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val;
  if (typeof val === "string") return Timestamp.fromDate(new Date(val));
  if (val.seconds) return new Timestamp(val.seconds, val.nanoseconds || 0);
  return undefined;
}

function convertTimestamp(ts: any) {
  if (!ts) return null;
  if (ts.toDate) return { seconds: Math.floor(ts.toDate().getTime() / 1000) };
  if (ts.seconds) return { seconds: ts.seconds };
  return null;
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

export async function GET(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const segment = req.nextUrl.searchParams.get("segment");

  try {
    const snapshot = await adminDb
      .collection("posts")
      .where("user_id", "==", uid)
      .orderBy("created_at", "desc")
      .get();

    let posts = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        created_at:   convertTimestamp(data.created_at),
        updated_at:   convertTimestamp(data.updated_at),
        published_at: convertTimestamp(data.published_at),
        scheduled_at: convertTimestamp(data.scheduled_at),
      } as Record<string, any>;
    });

    if (segment) {
      posts = posts.filter((p) => p.segment === segment);
    }

    // Sort by the most meaningful timestamp per status:
    //  - published  → published_at desc  (latest live post first)
    //  - scheduled  → scheduled_at asc   (next upcoming post first)
    //  - draft/failed → created_at desc  (newest first)
    posts.sort((a, b) => {
      const getTs = (p: Record<string, any>) => {
        if (p.status === "published") return p.published_at?.seconds ?? p.created_at?.seconds ?? 0;
        if (p.status === "scheduled") return p.scheduled_at?.seconds ?? p.created_at?.seconds ?? 0;
        return p.created_at?.seconds ?? 0;
      };
      const tsA = getTs(a);
      const tsB = getTs(b);
      // Scheduled: ascending (soonest first); everything else: descending
      if (a.status === "scheduled" && b.status === "scheduled") return tsA - tsB;
      return tsB - tsA;
    });

    return NextResponse.json({ posts });
  } catch (err: any) {
    console.error("[/api/posts GET]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const { post } = await req.json();
    const postData = {
      ...post,
      user_id: uid,
      created_at: FieldValue.serverTimestamp(),
      // Convert scheduled_at ISO string to Firestore Timestamp so cron can compare correctly
      ...(post.scheduled_at ? { scheduled_at: toFirestoreTimestamp(post.scheduled_at) } : {}),
      ...(post.published_at ? { published_at: toFirestoreTimestamp(post.published_at) } : {}),
    };

    const ref = await adminDb.collection("posts").add(postData);
    return NextResponse.json({ id: ref.id, ...post, user_id: uid });
  } catch (err: any) {
    console.error("[/api/posts POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const docRef = adminDb.collection("posts").doc(id);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.user_id !== uid) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    const sanitized = { ...updates };
    if (sanitized.scheduled_at) sanitized.scheduled_at = toFirestoreTimestamp(sanitized.scheduled_at);
    if (sanitized.published_at) sanitized.published_at = toFirestoreTimestamp(sanitized.published_at);
    await docRef.update({ ...sanitized, updated_at: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/posts PATCH]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const docRef = adminDb.collection("posts").doc(id);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.user_id !== uid) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/posts DELETE]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
