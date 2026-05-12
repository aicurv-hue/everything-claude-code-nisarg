import { adminDb } from "./firebase-admin";

export type PlanName = "free" | "starter" | "pro" | "business";

export const PLAN_LIMITS = {
  free:     { postsPerMonth: 5,    imagesPerMonth: 2,    faceImagesPerMonth: 0,  profiles: 1, companyPages: 0, campaigns: false, corporate: false, carousel: false, teamSize: 0 },
  starter:  { postsPerMonth: 30,   imagesPerMonth: 10,   faceImagesPerMonth: 5,  profiles: 1, companyPages: 0, campaigns: false, corporate: false, carousel: false, teamSize: 0 },
  pro:      { postsPerMonth: 100,  imagesPerMonth: 50,   faceImagesPerMonth: 20, profiles: 1, companyPages: 1, campaigns: true,  corporate: true,  carousel: true,  teamSize: 0 },
  business: { postsPerMonth: 9999, imagesPerMonth: 9999, faceImagesPerMonth: 9999, profiles: 3, companyPages: 3, campaigns: true,  corporate: true,  carousel: true,  teamSize: 5 },
} as const;

export const PLAN_IDS: Record<string, PlanName> = {
  [(process.env.RAZORPAY_PLAN_STARTER || "").trim()]: "starter",
  [(process.env.RAZORPAY_PLAN_PRO || "").trim()]: "pro",
  [(process.env.RAZORPAY_PLAN_BUSINESS || "").trim()]: "business",
  [(process.env.RAZORPAY_PLAN_STARTER_YEARLY || "").trim()]: "starter",
  [(process.env.RAZORPAY_PLAN_PRO_YEARLY || "").trim()]: "pro",
  [(process.env.RAZORPAY_PLAN_BUSINESS_YEARLY || "").trim()]: "business",
};

const OWNER_UIDS = ["iYmoobFP0ChkrYZzDLQokuKcXcw2"];

export async function getUserPlan(userId: string): Promise<PlanName> {
  if (OWNER_UIDS.includes(userId)) return "business";
  const doc = await adminDb.collection("users").doc(userId).get();
  if (!doc.exists) return "free";
  const data = doc.data() || {};

  // Active trial overrides planStatus (trial is a separate grant)
  if (data.trialActive === true) {
    const trialExpiry = data.trialExpiresAt?.toMillis ? data.trialExpiresAt.toMillis() : (data.trialExpiresAt || 0);
    if (trialExpiry > Date.now()) {
      const trialPlan = data.plan as string;
      if (trialPlan === "starter" || trialPlan === "pro" || trialPlan === "business") return trialPlan;
      return "business";
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

export function canUseCarousel(plan: string): boolean {
  const limits = PLAN_LIMITS[plan as PlanName] ?? PLAN_LIMITS.free;
  return limits.carousel;
}

export function canUseTeam(plan: string): boolean {
  const limits = PLAN_LIMITS[plan as PlanName] ?? PLAN_LIMITS.free;
  return limits.teamSize > 0;
}

export function getTeamSeatLimit(plan: string): number {
  const limits = PLAN_LIMITS[plan as PlanName] ?? PLAN_LIMITS.free;
  return limits.teamSize;
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
