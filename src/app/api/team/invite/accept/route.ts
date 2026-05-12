import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getRazorpay } from "@/lib/razorpay";
import {
  verifyInviteToken,
  getActiveMembership,
  getOwnedTeam,
  teamMemberId,
} from "@/lib/team";

export const runtime = "nodejs";

async function verifyAuth(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !adminAuth) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid, email: (decoded.email || "").toLowerCase() };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const inviteToken = String(body?.token || "").trim();
  if (!inviteToken) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const inviteId = verifyInviteToken(inviteToken);
  if (!inviteId) return NextResponse.json({ error: "Invalid invite" }, { status: 400 });

  const inviteRef = adminDb.collection("teamInvites").doc(inviteId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  const invite = inviteSnap.data()!;
  if (invite.status !== "pending") {
    return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 410 });
  }
  const expiresMs = (invite.expiresAt as Timestamp)?.toMillis?.() || 0;
  if (expiresMs && expiresMs < Date.now()) {
    await inviteRef.update({ status: "expired" });
    return NextResponse.json({ error: "Invite expired" }, { status: 410 });
  }

  if (!user.email || user.email !== String(invite.email).toLowerCase()) {
    return NextResponse.json(
      { error: "This invite is for a different email address", invitedEmail: invite.email },
      { status: 403 }
    );
  }

  // One team at a time
  const ownTeam = await getOwnedTeam(user.uid);
  if (ownTeam) {
    return NextResponse.json(
      { error: "You already own a team. Remove your members before joining another team." },
      { status: 409 }
    );
  }
  const existingMembership = await getActiveMembership(user.uid);
  if (existingMembership) {
    return NextResponse.json(
      { error: "You're already on a team. Leave your current team before joining another." },
      { status: 409 }
    );
  }

  // Auto-cancel invitee's active paid sub (no refund — by design)
  const userRef = adminDb.collection("users").doc(user.uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const subId = userData.subscriptionId as string | undefined;
  const planStatus = userData.planStatus as string | undefined;
  if (subId && (planStatus === "active" || planStatus === "authenticated")) {
    try {
      await getRazorpay().subscriptions.cancel(subId, { cancel_at_cycle_end: false } as never);
      await adminDb.collection("subscriptions").doc(subId).set(
        { status: "cancelled", updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    } catch (err) {
      console.error("[team/invite/accept] razorpay cancel failed", err);
      // Proceed regardless — owner can clean up manually if needed
    }
  }

  const teamId = invite.teamId as string;
  const memberDocId = teamMemberId(teamId, user.uid);
  const memberRef = adminDb.collection("teamMembers").doc(memberDocId);
  const teamRef = adminDb.collection("teams").doc(teamId);

  await adminDb.runTransaction(async (tx) => {
    const teamSnap = await tx.get(teamRef);
    if (!teamSnap.exists) throw new Error("Team no longer exists");

    const memberSnap = await tx.get(memberRef);
    const wasPreviouslyRemoved = memberSnap.exists && memberSnap.data()?.status === "removed";

    tx.set(
      memberRef,
      {
        teamId,
        memberUid: user.uid,
        ownerUid: invite.ownerUid,
        email: user.email,
        displayName: userData.displayName || userData.name || null,
        status: "active",
        invitedBy: invite.ownerUid,
        joinedAt: memberSnap.exists ? memberSnap.data()?.joinedAt : FieldValue.serverTimestamp(),
        rejoinedAt: wasPreviouslyRemoved ? FieldValue.serverTimestamp() : null,
      },
      { merge: true }
    );

    tx.update(teamRef, {
      memberCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.update(inviteRef, {
      status: "accepted",
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedByUid: user.uid,
    });

    tx.set(
      userRef,
      {
        activeTeamId: teamId,
        plan: "free",
        planStatus: "free",
        subscriptionId: null,
        teamJoinedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return NextResponse.json({ success: true, teamId });
}
