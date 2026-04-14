import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserPlan, canUseCampaigns } from "@/lib/checkSubscription";

async function getUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth!.verifyIdToken(auth.slice(7));
    return decoded.uid;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const segment = req.nextUrl.searchParams.get("segment") || "individual";
  const snap = await adminDb!.collection("campaigns")
    .where("user_id", "==", uid)
    .where("segment", "==", segment)
    .orderBy("created_at", "desc")
    .get();
  const campaigns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ campaigns });
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = await getUserPlan(uid);
  if (!canUseCampaigns(plan)) {
    return NextResponse.json({ error: "Campaigns require Pro or Business plan" }, { status: 403 });
  }

  const body = await req.json();
  const { name, topic, audience, tone, length, post_count, frequency_days, segment, timezone, custom_instructions } = body;
  if (!name || !topic || !segment) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  if (post_count < 2 || post_count > 10) return NextResponse.json({ error: "post_count must be 2–10" }, { status: 400 });
  if (frequency_days < 1 || frequency_days > 30) return NextResponse.json({ error: "frequency_days must be 1–30" }, { status: 400 });
  const ref = await adminDb!.collection("campaigns").add({
    user_id: uid, name, topic, audience: audience || "", tone: tone || "professional",
    length: length || "medium", post_count, frequency_days,
    segment, timezone: timezone || "UTC",
    custom_instructions: custom_instructions || "",
    status: "draft",
    created_at: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ id: ref.id });
}

export async function PATCH(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...patch } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ref = adminDb!.collection("campaigns").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.user_id !== uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ALLOWED_PATCH_FIELDS = ["name", "topic", "audience", "tone", "length", "post_count", "frequency_days", "status", "custom_instructions", "timezone"];
  const safePatch = Object.fromEntries(
    Object.entries(patch).filter(([k]) => ALLOWED_PATCH_FIELDS.includes(k))
  );
  await ref.update({ ...safePatch, updated_at: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ref = adminDb!.collection("campaigns").doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.user_id !== uid) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await ref.delete();
  const postsSnap = await adminDb!.collection("posts").where("campaign_id", "==", id).get();
  if (postsSnap.docs.length > 0) {
    const batch = adminDb!.batch();
    postsSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return NextResponse.json({ ok: true });
}
