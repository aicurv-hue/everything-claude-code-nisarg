import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const OWNER_UIDS = ["iYmoobFP0ChkrYZzDLQokuKcXcw2"];
    if (OWNER_UIDS.includes(userId)) {
      return NextResponse.json({
        plan: "business",
        status: "active",
        billingPeriod: null,
        currentPeriodEnd: null,
        subscriptionId: null,
        isOwner: true,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const userDoc = await adminDb.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};
    const plan = userData.plan || "free";
    const planStatus = userData.planStatus || "free";
    const subscriptionId = userData.subscriptionId || null;

    // Always check active promo trial first — takes priority over everything
    if (userData.trialActive === true) {
      const trialExpiry = userData.trialExpiresAt?.toMillis
        ? userData.trialExpiresAt.toMillis()
        : (userData.trialExpiresAt || 0);
      if (trialExpiry > Date.now()) {
        const trialPlan = (plan === "starter" || plan === "pro" || plan === "business") ? plan : "business";
        return NextResponse.json({
          plan: trialPlan,
          status: "trial",
          trialEndsAt: new Date(trialExpiry).toISOString(),
        }, { headers: { "Cache-Control": "no-store" } });
      }
    }

    if (!subscriptionId) {
      return NextResponse.json({ plan: "free", status: "free" }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
    }

    const subDoc = await adminDb.collection("subscriptions").doc(subscriptionId).get();
    const sub = subDoc.data() || {};

    // Determine billing period from planId
    const YEARLY_PLAN_IDS = [
      process.env.RAZORPAY_PLAN_STARTER_YEARLY,
      process.env.RAZORPAY_PLAN_PRO_YEARLY,
      process.env.RAZORPAY_PLAN_BUSINESS_YEARLY,
    ].filter(Boolean).map(id => id!.trim());
    const billingPeriod = sub.planId && YEARLY_PLAN_IDS.includes(sub.planId) ? "yearly" : "monthly";

    return NextResponse.json({
      plan,
      status: planStatus,
      subscriptionId,
      billingPeriod,
      trialEndsAt: sub.trialEndsAt?.toDate?.()?.toISOString() || null,
      currentPeriodEnd: sub.currentPeriodEnd?.toDate?.()?.toISOString() || null,
    }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[subscriptions/status]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
