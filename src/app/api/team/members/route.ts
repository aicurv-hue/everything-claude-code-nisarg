import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { getUserPlan, canUseTeam, getTeamSeatLimit } from "@/lib/checkSubscription";
import { getOwnedTeam, getActiveMembership } from "@/lib/team";

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

function tsToMillis(t: unknown): number | null {
  if (!t) return null;
  if (t instanceof Timestamp) return t.toMillis();
  const anyT = t as { toMillis?: () => number; seconds?: number };
  if (typeof anyT.toMillis === "function") return anyT.toMillis();
  if (typeof anyT.seconds === "number") return anyT.seconds * 1000;
  return null;
}

export async function GET(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const plan = await getUserPlan(uid);
  const team = await getOwnedTeam(uid);

  if (!team) {
    // No owned team — caller might still be an active member of someone else's
    // team. Return that membership so the UI can render a "Leave team" panel.
    const membership = await getActiveMembership(uid);
    let membershipInfo: {
      teamId: string;
      ownerUid: string;
      ownerName: string | null;
      ownerEmail: string | null;
      joinedAt: number | null;
    } | null = null;

    if (membership) {
      const ownerSnap = await adminDb.collection("users").doc(membership.ownerUid).get();
      const ownerData = ownerSnap.data() || {};
      const joinedAtMs = tsToMillis(membership.joinedAt);
      membershipInfo = {
        teamId: membership.teamId,
        ownerUid: membership.ownerUid,
        ownerName: (ownerData.displayName as string) || (ownerData.name as string) || null,
        ownerEmail: (ownerData.email as string) || null,
        joinedAt: joinedAtMs,
      };
    }

    return NextResponse.json({
      team: null,
      membership: membershipInfo,
      plan,
      canUseTeam: canUseTeam(plan),
      seatLimit: getTeamSeatLimit(plan),
      members: [],
      pendingInvites: [],
    });
  }

  const [membersSnap, invitesSnap] = await Promise.all([
    adminDb.collection("teamMembers").where("teamId", "==", team.id).get(),
    adminDb.collection("teamInvites").where("teamId", "==", team.id).get(),
  ]);

  const members = membersSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        memberUid: data.memberUid,
        email: data.email,
        displayName: data.displayName || null,
        status: data.status,
        joinedAt: tsToMillis(data.joinedAt),
        removedAt: tsToMillis(data.removedAt),
      };
    })
    .filter((m) => m.status === "active");

  const pendingInvites = invitesSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        email: data.email,
        status: data.status,
        createdAt: tsToMillis(data.createdAt),
        expiresAt: tsToMillis(data.expiresAt),
      };
    })
    .filter((i) => i.status === "pending");

  return NextResponse.json({
    team: { id: team.id, orgId: team.orgId, orgName: team.orgName },
    membership: null,
    plan,
    canUseTeam: canUseTeam(plan),
    seatLimit: getTeamSeatLimit(plan),
    members,
    pendingInvites,
  });
}
