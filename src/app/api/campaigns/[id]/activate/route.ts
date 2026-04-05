import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

async function getUid(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth!.verifyIdToken(auth.slice(7));
    return decoded.uid;
  } catch { return null; }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: campaignId } = await params;
  const { start_date, timezone } = await req.json();
  if (!start_date) return NextResponse.json({ error: "start_date required" }, { status: 400 });

  const campaignRef = adminDb!.collection("campaigns").doc(campaignId);
  const campaignSnap = await campaignRef.get();
  if (!campaignSnap.exists || campaignSnap.data()?.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const campaign = campaignSnap.data()!;

  // Fetch all campaign posts then filter/sort in memory — avoids composite index requirement
  const postsSnap = await adminDb!.collection("posts")
    .where("campaign_id", "==", campaignId)
    .get();

  const draftDocs = postsSnap.docs
    .filter(d => d.data().status === "draft")
    .sort((a, b) => (a.data().campaign_position ?? 0) - (b.data().campaign_position ?? 0));

  if (draftDocs.length === 0) {
    return NextResponse.json({ error: "No draft posts found for this campaign. Generate posts first." }, { status: 400 });
  }

  const startMs = new Date(start_date).getTime();
  const frequencyMs = campaign.frequency_days * 24 * 60 * 60 * 1000;

  const batch = adminDb!.batch();

  draftDocs.forEach((d, i) => {
    const scheduledAt = new Date(startMs + i * frequencyMs);
    batch.update(d.ref, {
      status: "scheduled",
      scheduled_at: Timestamp.fromDate(scheduledAt),
      updated_at: FieldValue.serverTimestamp(),
    });
  });

  batch.update(campaignRef, {
    status: "active",
    start_date: Timestamp.fromDate(new Date(start_date)),
    timezone: timezone || "UTC",
    updated_at: FieldValue.serverTimestamp(),
  });

  await batch.commit();
  return NextResponse.json({ scheduled: draftDocs.length });
  } catch (err: any) {
    console.error("[activate] Error:", err);
    return NextResponse.json({ error: err.message || "Activation failed" }, { status: 500 });
  }
}
