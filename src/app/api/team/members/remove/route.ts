import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getOwnedTeam, removeMember, teamMemberId } from "@/lib/team";

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

  const body = await req.json().catch(() => ({}));
  const memberUid = String(body?.memberUid || "").trim();
  if (!memberUid) return NextResponse.json({ error: "memberUid required" }, { status: 400 });
  if (memberUid === uid) {
    return NextResponse.json({ error: "Use /api/team/leave to remove yourself" }, { status: 400 });
  }

  const team = await getOwnedTeam(uid);
  if (!team) return NextResponse.json({ error: "You don't own a team" }, { status: 403 });

  // Confirm membership exists before doing the work
  const memberSnap = await adminDb
    .collection("teamMembers")
    .doc(teamMemberId(team.id, memberUid))
    .get();
  if (!memberSnap.exists || memberSnap.data()?.status !== "active") {
    return NextResponse.json({ error: "Member not found on your team" }, { status: 404 });
  }

  try {
    await removeMember(team.id, memberUid);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[team/members/remove]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove member" },
      { status: 500 }
    );
  }
}
