import { adminDb } from "./firebase-admin";
import { getUserPlan, canUseTeam, getTeamSeatLimit } from "./checkSubscription";
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

/**
 * Shared removal logic for both owner-initiated remove and member-initiated leave.
 * Idempotent — calling it on an already-removed member is a no-op.
 *
 * Effects:
 *  - Sets teamMembers/{teamId_memberUid}.status = "removed", stamps removedAt
 *  - Decrements teams/{teamId}.memberCount (guarded against double-decrement)
 *  - Clears users/{memberUid}.activeTeamId — getUserPlan reverts to actual plan
 *  - Reassigns any team corporate posts authored by the member: authorUid →
 *    ownerUid (so removed member loses edit access), originalAuthorUid kept
 *    for history. authorDisplayName left as-is so "Posted by" UI still shows
 *    the original drafter.
 */
export async function removeMember(teamId: string, memberUid: string): Promise<void> {
  const { FieldValue } = await import("firebase-admin/firestore");
  const teamRef = adminDb.collection("teams").doc(teamId);
  const memberRef = adminDb.collection("teamMembers").doc(teamMemberId(teamId, memberUid));
  const userRef = adminDb.collection("users").doc(memberUid);

  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) throw new Error("Team not found");
  const ownerUid = teamSnap.data()?.ownerUid as string;

  // 1) Member status flip + team count + user activeTeamId in one transaction
  await adminDb.runTransaction(async (tx) => {
    const m = await tx.get(memberRef);
    if (!m.exists) return;
    const data = m.data()!;
    if (data.status === "removed") return; // idempotent

    tx.update(memberRef, {
      status: "removed",
      removedAt: FieldValue.serverTimestamp(),
    });
    tx.update(teamRef, {
      memberCount: FieldValue.increment(-1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      userRef,
      { activeTeamId: FieldValue.delete(), teamRemovedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  });

  // 2) Reassign authorUid on team corporate posts they drafted
  // Single where(teamId) + JS filter — no composite index needed.
  const postsSnap = await adminDb.collection("posts").where("teamId", "==", teamId).get();
  const toReassign = postsSnap.docs.filter((d) => {
    const p = d.data();
    return p.authorUid === memberUid && p.segment === "corporate";
  });

  if (toReassign.length > 0) {
    // Firestore batch supports up to 500 writes
    for (let i = 0; i < toReassign.length; i += 450) {
      const batch = adminDb.batch();
      for (const doc of toReassign.slice(i, i + 450)) {
        const data = doc.data();
        batch.update(doc.ref, {
          originalAuthorUid: data.authorUid,
          authorUid: ownerUid,
          updated_at: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
  }
}

export { getTeamSeatLimit };
