import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getRazorpay } from "@/lib/razorpay";
import { PLAN_IDS } from "@/lib/checkSubscription";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { planId } = await req.json();
    const VALID_PLAN_IDS = [
      process.env.RAZORPAY_PLAN_STARTER,
      process.env.RAZORPAY_PLAN_PRO,
      process.env.RAZORPAY_PLAN_BUSINESS,
    ].filter(Boolean);
    if (!planId || !VALID_PLAN_IDS.includes(planId)) {
      return NextResponse.json({ error: `Invalid plan ID: "${planId}". Valid: ${VALID_PLAN_IDS.join(", ")}` }, { status: 400 });
    }

    const trialEndsAt = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
    const planName = PLAN_IDS[planId];

    const subscription = await getRazorpay().subscriptions.create({
      plan_id: planId,
      total_count: 120,
      start_at: trialEndsAt,
      quantity: 1,
      notes: { userId },
    });

    const subId = subscription.id as string;
    const now = FieldValue.serverTimestamp();

    await adminDb.collection("subscriptions").doc(subId).set({
      userId,
      subscriptionId: subId,
      planId,
      planName,
      status: "created",
      trialEndsAt: new Date(trialEndsAt * 1000),
      currentPeriodStart: null,
      currentPeriodEnd: null,
      createdAt: now,
      updatedAt: now,
    });

    const userEmail = decoded.email || "";

    await adminDb.collection("users").doc(userId).set(
      { plan: planName, planStatus: "trialing", subscriptionId: subId, betaApproved: true },
      { merge: true }
    );

    if (userEmail) {
      await adminDb.collection("beta_access").doc(userEmail).set(
        { email: userEmail, approved: true, approvedAt: new Date().toISOString() },
        { merge: true }
      );
    }

    return NextResponse.json({ subscriptionId: subId });
  } catch (err: unknown) {
    console.error("[subscriptions/create]", err);
    // Razorpay throws plain objects, not Error instances
    let message = "Failed to create subscription";
    if (err instanceof Error) {
      message = err.message;
    } else if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      message = (e.error as Record<string, unknown>)?.description as string
        || (e.message as string)
        || JSON.stringify(err);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
