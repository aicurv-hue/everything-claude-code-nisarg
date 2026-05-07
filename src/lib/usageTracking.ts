import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserPlan, PLAN_LIMITS, PlanName } from "./checkSubscription";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Get the billing cycle key for a user.
 * - Paid users: based on currentPeriodStart from their subscription
 * - Free/trial users: calendar month (YYYY-MM)
 */
async function getBillingCycleKey(userId: string): Promise<{ key: string; cycleStart: Date | null; cycleEnd: Date | null }> {
  const userDoc = await adminDb.collection("users").doc(userId).get();
  const userData = userDoc.data() || {};
  const subscriptionId = userData.subscriptionId;

  if (subscriptionId && userData.planStatus === "active") {
    const subDoc = await adminDb.collection("subscriptions").doc(subscriptionId).get();
    const sub = subDoc.data();
    if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
      const start = sub.currentPeriodStart.toDate ? sub.currentPeriodStart.toDate() : new Date(sub.currentPeriodStart);
      const end = sub.currentPeriodEnd.toDate ? sub.currentPeriodEnd.toDate() : new Date(sub.currentPeriodEnd);
      // Use ISO date of cycle start as the key
      const key = start.toISOString().slice(0, 10);
      return { key, cycleStart: start, cycleEnd: end };
    }
  }

  // Free/trial users: calendar month
  return { key: currentMonthKey(), cycleStart: null, cycleEnd: null };
}

function usageDocId(userId: string, cycleKey: string): string {
  return `${userId}_${cycleKey}`;
}

export interface MonthlyUsage {
  postsGenerated: number;
  imagesGenerated: number;
  faceImagesGenerated: number;
  uid: string;
  month: string;
  cycleStart: string | null;
  cycleEnd: string | null;
}

export async function getMonthlyUsage(userId: string): Promise<MonthlyUsage> {
  const { key, cycleStart, cycleEnd } = await getBillingCycleKey(userId);
  const snap = await adminDb.collection("usage").doc(usageDocId(userId, key)).get();
  const base: MonthlyUsage = {
    postsGenerated: 0,
    imagesGenerated: 0,
    faceImagesGenerated: 0,
    uid: userId,
    month: key,
    cycleStart: cycleStart?.toISOString() || null,
    cycleEnd: cycleEnd?.toISOString() || null,
  };
  if (!snap.exists) return base;
  return { ...base, ...(snap.data() as Partial<MonthlyUsage>), cycleStart: cycleStart?.toISOString() || null, cycleEnd: cycleEnd?.toISOString() || null };
}

export type UsageAction = "post" | "image" | "faceImage";

function getFieldAndLimit(plan: PlanName, action: UsageAction): { field: string; limit: number } {
  const limits = PLAN_LIMITS[plan];
  if (action === "post")      return { field: "postsGenerated",      limit: limits.postsPerMonth };
  if (action === "image")     return { field: "imagesGenerated",     limit: limits.imagesPerMonth };
  if (action === "faceImage") return { field: "faceImagesGenerated", limit: limits.faceImagesPerMonth };
  throw new Error("Unknown action");
}

export interface UsageCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: PlanName;
}

export async function checkAndIncrementUsage(
  userId: string,
  action: UsageAction
): Promise<UsageCheckResult> {
  return checkAndIncrementBulk(userId, action, 1);
}

/**
 * Decrement a usage counter by 1, floored at 0. Used when an image job that was
 * pre-counted on submit ends up FAILED on the fal side — we don't want to charge
 * users for jobs that never produced an image.
 */
export async function refundUsage(userId: string, action: UsageAction): Promise<void> {
  const plan = await getUserPlan(userId);
  const { field } = getFieldAndLimit(plan, action);
  const { key } = await getBillingCycleKey(userId);
  const docRef = adminDb.collection("usage").doc(usageDocId(userId, key));

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists) return;
    const current: number = (snap.data()![field] as number) ?? 0;
    if (current <= 0) return;
    tx.update(docRef, { [field]: current - 1 });
  });
}

export async function checkAndIncrementBulk(
  userId: string,
  action: UsageAction,
  count: number
): Promise<UsageCheckResult> {
  const plan = await getUserPlan(userId);
  const { field, limit } = getFieldAndLimit(plan, action);
  const { key } = await getBillingCycleKey(userId);
  const docRef = adminDb.collection("usage").doc(usageDocId(userId, key));
  const month = key;

  let allowed = false;
  let finalUsed = 0;

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const current: number = snap.exists ? ((snap.data()![field] as number) ?? 0) : 0;

    if (current + count > limit) {
      allowed = false;
      finalUsed = current;
      return;
    }

    allowed = true;
    finalUsed = current + count;

    if (snap.exists) {
      tx.update(docRef, { [field]: FieldValue.increment(count) });
    } else {
      tx.set(docRef, {
        uid: userId,
        month,
        postsGenerated: 0,
        imagesGenerated: 0,
        faceImagesGenerated: 0,
        [field]: count,
      });
    }
  });

  return { allowed, used: finalUsed, limit, plan };
}
