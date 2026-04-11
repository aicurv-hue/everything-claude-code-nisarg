import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getRazorpay } from "@/lib/razorpay";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { subscriptionId } = await req.json();
    if (!subscriptionId) {
      return NextResponse.json({ error: "subscriptionId required" }, { status: 400 });
    }

    // Verify ownership
    const subDoc = await adminDb.collection("subscriptions").doc(subscriptionId).get();
    if (!subDoc.exists || subDoc.data()?.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await getRazorpay().subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: true } as never);

    const now = FieldValue.serverTimestamp();
    await adminDb.collection("subscriptions").doc(subscriptionId).update({
      status: "cancelled",
      updatedAt: now,
    });
    await adminDb.collection("users").doc(userId).set(
      { planStatus: "cancelled" },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[subscriptions/cancel]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
