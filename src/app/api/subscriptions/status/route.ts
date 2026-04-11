import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const userDoc = await adminDb.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};
    const plan = userData.plan || "free";
    const planStatus = userData.planStatus || "free";
    const subscriptionId = userData.subscriptionId || null;

    if (!subscriptionId) {
      return NextResponse.json({ plan: "free", status: "free" });
    }

    const subDoc = await adminDb.collection("subscriptions").doc(subscriptionId).get();
    const sub = subDoc.data() || {};

    return NextResponse.json({
      plan,
      status: planStatus,
      subscriptionId,
      trialEndsAt: sub.trialEndsAt?.toDate?.()?.toISOString() || null,
      currentPeriodEnd: sub.currentPeriodEnd?.toDate?.()?.toISOString() || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[subscriptions/status]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
