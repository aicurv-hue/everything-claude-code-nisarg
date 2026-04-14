import { adminDb } from "./firebase-admin";

export type PlanName = "free" | "starter" | "pro" | "business";

export const PLAN_LIMITS = {
  free:     { postsPerMonth: 10,  imagesPerMonth: 5,   faceImagesPerMonth: 0,  profiles: 1, companyPages: 0, campaigns: false, corporate: false },
  starter:  { postsPerMonth: 45,  imagesPerMonth: 20,  faceImagesPerMonth: 5,  profiles: 1, companyPages: 0, campaigns: false, corporate: false },
  pro:      { postsPerMonth: 100, imagesPerMonth: 50,  faceImagesPerMonth: 10, profiles: 1, companyPages: 1, campaigns: true,  corporate: true  },
  business: { postsPerMonth: 9999, imagesPerMonth: 100, faceImagesPerMonth: 20, profiles: 3, companyPages: 3, campaigns: true,  corporate: true  },
} as const;

export const PLAN_IDS: Record<string, PlanName> = {
  [(process.env.RAZORPAY_PLAN_STARTER || "").trim()]: "starter",
  [(process.env.RAZORPAY_PLAN_PRO || "").trim()]: "pro",
  [(process.env.RAZORPAY_PLAN_BUSINESS || "").trim()]: "business",
};

export async function getUserPlan(userId: string): Promise<PlanName> {
  const doc = await adminDb.collection("users").doc(userId).get();
  if (!doc.exists) return "free";
  const data = doc.data() || {};

  // Active trial overrides planStatus (trial is a separate grant)
  if (data.trialActive === true) {
    const trialExpiry = data.trialExpiresAt?.toMillis ? data.trialExpiresAt.toMillis() : (data.trialExpiresAt || 0);
    if (trialExpiry > Date.now()) {
      return "starter";
    }
  }

  // Cancelled or paused subscriptions lose paid quota immediately
  if (data.planStatus === "cancelled" || data.planStatus === "paused") {
    return "free";
  }

  return (data.plan as PlanName) || "free";
}

export async function getUserLimits(userId: string) {
  const plan = await getUserPlan(userId);
  return PLAN_LIMITS[plan];
}

export function canUseCampaigns(plan: string): boolean {
  const limits = PLAN_LIMITS[plan as PlanName] ?? PLAN_LIMITS.free;
  return limits.campaigns;
}

export function canUseCorporate(plan: string): boolean {
  const limits = PLAN_LIMITS[plan as PlanName] ?? PLAN_LIMITS.free;
  return limits.corporate;
}

export async function canUserPerformAction(
  userId: string,
  action: "post" | "image" | "profile" | "companyPage"
): Promise<boolean> {
  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  if (action === "post") return limits.postsPerMonth > 0;
  if (action === "image") return limits.imagesPerMonth > 0;
  if (action === "profile") return limits.profiles > 0;
  if (action === "companyPage") return limits.companyPages > 0;
  return false;
}
