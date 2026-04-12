import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { createHmac } from "crypto";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (expected !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body);
  const eventType: string = event.event;
  const now = FieldValue.serverTimestamp();

  try {
    if (eventType.startsWith("subscription.")) {
      const sub = event.payload?.subscription?.entity;
      if (!sub) return NextResponse.json({ ok: true });

      const subId: string = sub.id;
      const subRef = adminDb.collection("subscriptions").doc(subId);
      const subDoc = await subRef.get();
      const userId: string = subDoc.data()?.userId || sub.notes?.userId || "";

      if (eventType === "subscription.authenticated") {
        await subRef.update({ status: "authenticated", updatedAt: now });
      } else if (eventType === "subscription.activated") {
        const planName = subDoc.data()?.planName || null;
        await subRef.update({
          status: "active",
          currentPeriodStart: sub.current_start ? new Date(sub.current_start * 1000) : null,
          currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
          updatedAt: now,
        });
        if (userId) {
          await adminDb.collection("users").doc(userId).set(
            { plan: planName, planStatus: "active" },
            { merge: true }
          );
        }
      } else if (eventType === "subscription.charged") {
        const planName = subDoc.data()?.planName || null;
        const payment = event.payload?.payment?.entity;
        await subRef.update({
          status: "active",
          currentPeriodStart: sub.current_start ? new Date(sub.current_start * 1000) : null,
          currentPeriodEnd: sub.current_end ? new Date(sub.current_end * 1000) : null,
          updatedAt: now,
        });
        if (payment && userId) {
          await adminDb.collection("payments").doc(payment.id).set({
            userId,
            subscriptionId: subId,
            razorpayPaymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            status: "captured",
            createdAt: now,
          });
          await adminDb.collection("users").doc(userId).set(
            { plan: planName, planStatus: "active" },
            { merge: true }
          );
        }
      } else if (eventType === "subscription.cancelled") {
        await subRef.update({ status: "cancelled", updatedAt: now });
        if (userId) {
          await adminDb.collection("users").doc(userId).set(
            { planStatus: "cancelled" },
            { merge: true }
          );
        }
      } else if (eventType === "subscription.paused") {
        await subRef.update({ status: "paused", updatedAt: now });
        if (userId) {
          await adminDb.collection("users").doc(userId).set(
            { planStatus: "paused" },
            { merge: true }
          );
        }
      } else if (eventType === "subscription.resumed") {
        await subRef.update({ status: "active", updatedAt: now });
        if (userId) {
          await adminDb.collection("users").doc(userId).set(
            { planStatus: "active" },
            { merge: true }
          );
        }
      }
    } else if (eventType === "payment.failed") {
      const payment = event.payload?.payment?.entity;
      if (payment) {
        const subId = payment.subscription_id;
        let userId = "";
        if (subId) {
          const subDoc = await adminDb.collection("subscriptions").doc(subId).get();
          userId = subDoc.data()?.userId || "";
        }
        await adminDb.collection("payments").doc(payment.id).set({
          userId,
          subscriptionId: subId || null,
          razorpayPaymentId: payment.id,
          amount: payment.amount,
          currency: payment.currency,
          status: "failed",
          errorCode: payment.error_code || null,
          errorDescription: payment.error_description || null,
          createdAt: now,
        });
      }
    }
  } catch (err) {
    console.error("[webhook/razorpay] handler error", err);
    // Still return 200 — don't let Razorpay retry indefinitely
  }

  return NextResponse.json({ ok: true });
}
