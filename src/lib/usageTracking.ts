import { adminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserPlan, PLAN_LIMITS, PlanName } from "./checkSubscription";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function usageDocId(userId: string): string {
  return `${userId}_${currentMonthKey()}`;
}

export interface MonthlyUsage {
  postsGenerated: number;
  imagesGenerated: number;
  faceImagesGenerated: number;
  uid: string;
  month: string;
}

export async function getMonthlyUsage(userId: string): Promise<MonthlyUsage> {
  const snap = await adminDb.collection("usage").doc(usageDocId(userId)).get();
  const base: MonthlyUsage = {
    postsGenerated: 0,
    imagesGenerated: 0,
    faceImagesGenerated: 0,
    uid: userId,
    month: currentMonthKey(),
  };
  if (!snap.exists) return base;
  return { ...base, ...(snap.data() as Partial<MonthlyUsage>) };
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

export async function checkAndIncrementBulk(
  userId: string,
  action: UsageAction,
  count: number
): Promise<UsageCheckResult> {
  const plan = await getUserPlan(userId);
  const { field, limit } = getFieldAndLimit(plan, action);
  const docRef = adminDb.collection("usage").doc(usageDocId(userId));
  const month = currentMonthKey();

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
