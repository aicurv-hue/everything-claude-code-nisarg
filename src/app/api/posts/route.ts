import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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
    const snapshot = await adminDb.collection("posts").where("user_id", "==", uid).get();
    let posts = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        created_at: convertTimestamp(data.created_at),
        updated_at: convertTimestamp(data.updated_at),
        published_at: convertTimestamp(data.published_at),
        scheduled_at: convertTimestamp(data.scheduled_at),
      } as Record<string, any>;
    });

    if (segment) {
      posts = posts.filter((p) => p.segment === segment);
    }

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

    await docRef.update({ ...updates, updated_at: FieldValue.serverTimestamp() });
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
