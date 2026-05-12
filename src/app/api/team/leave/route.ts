import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getActiveMembership, removeMember } from "@/lib/team";

export const runtime = "nodejs";

async function verifyToken(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !adminAuth) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const membership = await getActiveMembership(uid);
  if (!membership) {
    return NextResponse.json({ error: "You're not on a team" }, { status: 404 });
  }

  try {
    await removeMember(membership.teamId, uid);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[team/leave]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to leave team" },
      { status: 500 }
    );
  }
}
