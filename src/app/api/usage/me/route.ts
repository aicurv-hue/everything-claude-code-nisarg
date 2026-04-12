import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getMonthlyUsage } from "@/lib/usageTracking";
import { getUserPlan, PLAN_LIMITS } from "@/lib/checkSubscription";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await adminAuth!.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const [usage, plan] = await Promise.all([getMonthlyUsage(uid), getUserPlan(uid)]);
  const limits = PLAN_LIMITS[plan];

  return NextResponse.json({ ...usage, plan, limits }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=15" } });
}
