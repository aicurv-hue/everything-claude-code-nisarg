import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { checkAndIncrementUsage, UsageAction } from "@/lib/usageTracking";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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

  const { action } = await req.json() as { action: UsageAction };
  if (!action || !["post", "image", "faceImage"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const result = await checkAndIncrementUsage(uid, action);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: `Monthly ${action} limit reached. Upgrade your plan to continue.`,
        code: "LIMIT_EXCEEDED",
        limit: result.limit,
        used: result.used,
        plan: result.plan,
        upgradeUrl: "/#pricing",
      },
      { status: 429 }
    );
  }

  return NextResponse.json({ allowed: true, used: result.used, limit: result.limit, plan: result.plan });
}
