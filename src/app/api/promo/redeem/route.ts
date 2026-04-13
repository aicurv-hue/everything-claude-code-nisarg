import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: "Server not configured." }, { status: 503 });
  }

  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = await req.json();
    const code: string = (body.code || "").toString().trim().toUpperCase();
    if (!code) return NextResponse.json({ error: "Code is required." }, { status: 400 });

    const promoRef = adminDb.collection("promoCodes").doc(code);
    const userRef = adminDb.collection("users").doc(uid);

    let trialExpiresAtMs = 0;

    await adminDb.runTransaction(async (tx) => {
      const promoSnap = await tx.get(promoRef);
      if (!promoSnap.exists) throw Object.assign(new Error("Code not found."), { status: 404 });

      const promo = promoSnap.data()!;

      if (promo.isActive !== true) throw Object.assign(new Error("Code is inactive."), { status: 400 });

      const expiresAt = promo.expiresAt as Timestamp | null;
      if (expiresAt !== null && expiresAt?.toMillis() < Date.now()) {
        throw Object.assign(new Error("Code has expired."), { status: 400 });
      }

      if (promo.maxUses !== null && (promo.usesCount ?? 0) >= promo.maxUses) {
        throw Object.assign(new Error("Code has reached its usage limit."), { status: 400 });
      }

      const usedBy: string[] = promo.usedBy || [];
      if (usedBy.includes(uid)) {
        throw Object.assign(new Error("Code already redeemed by this account."), { status: 400 });
      }

      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};

      if (userData.trialActive === true) {
        const trialExpiry = userData.trialExpiresAt?.toMillis ? userData.trialExpiresAt.toMillis() : 0;
        if (trialExpiry > Date.now()) {
          throw Object.assign(new Error("You already have an active trial."), { status: 400 });
        }
      }

      const paid = ["starter", "pro", "business"];
      if (paid.includes(userData.plan) && userData.planStatus !== "trial") {
        throw Object.assign(new Error("Not available on paid plans."), { status: 400 });
      }

      const trialDays: number = promo.trialDays || 15;
      const promoPlan: string = ["starter", "pro", "business"].includes(promo.plan) ? promo.plan : "starter";
      trialExpiresAtMs = Date.now() + trialDays * 86400000;
      const trialExpiresAtTs = Timestamp.fromMillis(trialExpiresAtMs);

      tx.update(promoRef, {
        usesCount: FieldValue.increment(1),
        usedBy: FieldValue.arrayUnion(uid),
      });

      tx.set(userRef, {
        trialActive: true,
        trialExpiresAt: trialExpiresAtTs,
        promoCodeUsed: code,
        plan: promoPlan,
        planStatus: "trial",
      }, { merge: true });
    });

    const daysRemaining = Math.ceil((trialExpiresAtMs - Date.now()) / 86400000);

    return NextResponse.json({
      success: true,
      trialExpiresAt: new Date(trialExpiresAtMs).toISOString(),
      daysRemaining,
    });
  } catch (err: unknown) {
    const e = err as Error & { status?: number };
    const status = e.status || 500;
    return NextResponse.json({ error: e.message || "Unexpected error." }, { status });
  }
}
