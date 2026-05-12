import { adminDb } from "./firebase-admin";
import { getUserPlan, canUseTeam, getTeamSeatLimit, type PlanName } from "./checkSubscription";
import crypto from "crypto";

export type TeamMemberStatus = "active" | "removed";
export type TeamInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export interface TeamDoc {
  ownerUid: string;
  orgId: string | null;
  orgName: string | null;
  memberCount: number;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface TeamMemberDoc {
  teamId: string;
  memberUid: string;
  ownerUid: string;
  email: string;
  displayName: string | null;
  status: TeamMemberStatus;
  invitedBy: string;
  joinedAt: FirebaseFirestore.Timestamp;
  removedAt?: FirebaseFirestore.Timestamp;
}

const INVITE_TTL_DAYS = 7;

export function teamMemberId(teamId: string, memberUid: string): string {
  return `${teamId}_${memberUid}`;
}

/** Returns the team this user owns, or null. Owners can only own one team. */
export async function getOwnedTeam(ownerUid: string) {
  const snap = await adminDb.collection("teams").where("ownerUid", "==", ownerUid).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as TeamDoc) };
}

/** Returns the team this user is an active member of (excludes owner). */
export async function getActiveMembership(uid: string) {
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const activeTeamId = userSnap.data()?.activeTeamId as string | undefined;
  if (!activeTeamId) return null;

  const memberSnap = await adminDb.collection("teamMembers").doc(teamMemberId(activeTeamId, uid)).get();
  if (!memberSnap.exists) return null;
  const data = memberSnap.data() as TeamMemberDoc;
  if (data.status !== "active") return null;
  return { id: memberSnap.id, ...data };
}

/**
 * Effective plan for a user: their own plan, OR Pro if they are an active member
 * of a Business team (members inherit Pro-tier features while on a team).
 */
export async function getEffectivePlan(uid: string): Promise<PlanName> {
  const ownPlan = await getUserPlan(uid);
  if (ownPlan === "business" || ownPlan === "pro") return ownPlan;

  const membership = await getActiveMembership(uid);
  if (!membership) return ownPlan;

  return "pro";
}

/** Lazily create a team for this owner if they don't have one yet. */
export async function ensureTeamForOwner(ownerUid: string) {
  const existing = await getOwnedTeam(ownerUid);
  if (existing) return existing;

  const plan = await getUserPlan(ownerUid);
  if (!canUseTeam(plan)) {
    throw new Error("PLAN_NO_TEAM");
  }

  const { FieldValue } = await import("firebase-admin/firestore");
  const ref = adminDb.collection("teams").doc();
  const now = FieldValue.serverTimestamp();
  await ref.set({
    ownerUid,
    orgId: null,
    orgName: null,
    memberCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const snap = await ref.get();
  return { id: ref.id, ...(snap.data() as TeamDoc) };
}

/** Count active members for a team (excludes owner). */
export async function countActiveMembers(teamId: string): Promise<number> {
  const snap = await adminDb
    .collection("teamMembers")
    .where("teamId", "==", teamId)
    .get();
  return snap.docs.filter((d) => d.data().status === "active").length;
}

/** Count pending invites for a team. */
export async function countPendingInvites(teamId: string): Promise<number> {
  const snap = await adminDb
    .collection("teamInvites")
    .where("teamId", "==", teamId)
    .get();
  return snap.docs.filter((d) => d.data().status === "pending").length;
}

export function getInviteSigningSecret(): string {
  const secret = process.env.INVITE_SIGNING_SECRET;
  if (!secret) throw new Error("INVITE_SIGNING_SECRET not configured");
  return secret;
}

/** Generate an opaque, signed invite token. Token = inviteId.signature. */
export function generateInviteToken(inviteId: string): string {
  const sig = crypto.createHmac("sha256", getInviteSigningSecret()).update(inviteId).digest("hex").slice(0, 32);
  return `${inviteId}.${sig}`;
}

export function verifyInviteToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const inviteId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", getInviteSigningSecret()).update(inviteId).digest("hex").slice(0, 32);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return inviteId;
}

export function inviteExpiryMillis(): number {
  return Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export async function canManageTeam(uid: string, teamId: string): Promise<boolean> {
  const teamSnap = await adminDb.collection("teams").doc(teamId).get();
  if (!teamSnap.exists) return false;
  return teamSnap.data()?.ownerUid === uid;
}

export { getTeamSeatLimit };
