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

const TOKEN_WARNING_DAYS = 14;

type LinkedInState = "healthy" | "warning" | "expired" | "disconnected";
type PlanState = "healthy" | "warning";

async function buildOwnerHealth(ownerUid: string, ownerUserData: FirebaseFirestore.DocumentData) {
  // LinkedIn — refresh_expires_at is the real "must reconnect" deadline.
  // access_token auto-refreshes silently until then via /api/linkedin/status.
  const tokenSnap = await adminDb!.collection("tokens").doc(ownerUid).get();
  const tokenData = tokenSnap.exists ? tokenSnap.data() : null;
  const hasAccess = !!tokenData?.access_token;
  const refreshExpiresAt: number | null =
    typeof tokenData?.refresh_expires_at === "number" ? tokenData.refresh_expires_at : null;

  let linkedinState: LinkedInState;
  let daysLeft: number | null = null;
  if (!hasAccess) {
    linkedinState = "disconnected";
  } else if (refreshExpiresAt === null) {
    linkedinState = "healthy"; // legacy token without refresh_expires_at — assume valid
  } else {
    const msLeft = refreshExpiresAt - Date.now();
    daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    if (msLeft <= 0) linkedinState = "expired";
    else if (daysLeft < TOKEN_WARNING_DAYS) linkedinState = "warning";
    else linkedinState = "healthy";
  }

  // Plan — anything not "active" or "trial" is a warning for the member.
  const plan: string = (ownerUserData.plan as string) || "free";
  const planStatus: string = (ownerUserData.planStatus as string) || "free";
  const planHealthy = planStatus === "active" || planStatus === "trial";
  const planState: PlanState = planHealthy ? "healthy" : "warning";

  // Renewal/end date only filled when unhealthy — keeps the healthy UI clean.
  let renewsAt: number | null = null;
  if (!planHealthy && typeof ownerUserData.subscriptionId === "string") {
    const subSnap = await adminDb!.collection("subscriptions").doc(ownerUserData.subscriptionId).get();
    renewsAt = tsToMillis(subSnap.data()?.currentPeriodEnd);
  }

  return {
    linkedin: { state: linkedinState, daysLeft, refreshExpiresAt },
    plan: { state: planState, plan, status: planStatus, renewsAt },
  };
}

export async function GET(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const plan = await getUserPlan(uid);
  const team = await getOwnedTeam(uid);

  // If the caller owns a team, surface the Business seat cap regardless of
  // current plan state — the cancel-with-members guard prevents a downgraded
  // owner from ever holding a team, but during webhook lag we don't want the
  // settings UI to render "0 of 0 seats" while members still appear.
  const effectiveSeatLimit = team
    ? Math.max(getTeamSeatLimit(plan), getTeamSeatLimit("business"))
    : getTeamSeatLimit(plan);

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
    let ownerHealth: Awaited<ReturnType<typeof buildOwnerHealth>> | null = null;

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
      try {
        ownerHealth = await buildOwnerHealth(membership.ownerUid, ownerData);
      } catch {
        ownerHealth = null;
      }
    }

    return NextResponse.json({
      team: null,
      membership: membershipInfo,
      ownerHealth,
      plan,
      canUseTeam: canUseTeam(plan),
      seatLimit: effectiveSeatLimit,
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
