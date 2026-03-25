import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

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

function convertTimestamp(ts: any) {
  if (!ts) return null;
  if (ts.toDate) return { seconds: Math.floor(ts.toDate().getTime() / 1000) };
  if (ts.seconds) return { seconds: ts.seconds };
  return null;
}

export async function GET(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const segment = req.nextUrl.searchParams.get("segment");

  try {
    const snapshot = await adminDb
      .collection("post_memories")
      .where("user_id", "==", uid)
      .get();

    let entries = snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        created_at: convertTimestamp(data.created_at),
      } as Record<string, any>;
    });

    if (segment) {
      entries = entries.filter((e) => e.segment === segment);
    }

    // Sort newest first
    entries.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));

    return NextResponse.json({ entries });
  } catch (err: any) {
    console.error("[/api/memory GET]", err);
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

    const docRef = adminDb.collection("post_memories").doc(id);
    const snap = await docRef.get();
    if (!snap.exists || snap.data()?.user_id !== uid) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/memory DELETE]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
