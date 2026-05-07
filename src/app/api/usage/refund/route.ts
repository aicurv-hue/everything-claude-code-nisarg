import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { refundUsage, UsageAction } from "@/lib/usageTracking";

export const runtime = "nodejs";

// Decrement a usage counter by 1 (floored at 0). Called by the image-poll
// edge route when fal.ai returns FAILED, so users aren't charged for jobs
// that never produced an image.
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

  await refundUsage(uid, action);
  return NextResponse.json({ refunded: true });
}
