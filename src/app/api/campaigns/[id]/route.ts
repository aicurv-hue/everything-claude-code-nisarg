import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function getUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth!.verifyIdToken(auth.slice(7));
    return decoded.uid;
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaignSnap = await adminDb!.collection("campaigns").doc(params.id).get();
  if (!campaignSnap.exists || campaignSnap.data()?.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const postsSnap = await adminDb!.collection("posts")
    .where("campaign_id", "==", params.id)
    .orderBy("campaign_position", "asc")
    .get();

  const posts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ campaign: { id: campaignSnap.id, ...campaignSnap.data() }, posts });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ref = adminDb!.collection("campaigns").doc(params.id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await ref.delete();
  const postsSnap = await adminDb!.collection("posts").where("campaign_id", "==", params.id).get();
  if (postsSnap.docs.length > 0) {
    const batch = adminDb!.batch();
    postsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return NextResponse.json({ ok: true });
}
