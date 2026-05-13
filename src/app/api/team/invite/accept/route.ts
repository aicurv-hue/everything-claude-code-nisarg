import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getRazorpay } from "@/lib/razorpay";
import { getUserPlan, canUseTeam, getTeamSeatLimit } from "@/lib/checkSubscription";
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

  // Some Firebase auth providers don't include `email` in the JWT (phone-only,
  // custom token, etc.). Fall back to the email on the user doc before
  // rejecting — Cridl is email-primary so the user doc reliably has one.
  let callerEmail = user.email;
  if (!callerEmail) {
    const fallbackSnap = await adminDb.collection("users").doc(user.uid).get();
    callerEmail = String(fallbackSnap.data()?.email || "").toLowerCase();
  }
  if (!callerEmail || callerEmail !== String(invite.email).toLowerCase()) {
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

  // Verify the inviting owner still has team entitlement before allowing accept.
  // If the owner downgraded between invite-create and now we must not produce
  // a phantom team-member on a non-Business owner.
  const ownerPlan = await getUserPlan(invite.ownerUid as string);
  if (!canUseTeam(ownerPlan)) {
    return NextResponse.json(
      { error: "Inviter no longer has team access. Ask them to reactivate Business." },
      { status: 409 }
    );
  }

  // Auto-cancel invitee's active paid sub (no refund — by design). If the
  // cancel fails we abort the accept — silently downgrading the user while
  // their Razorpay sub keeps billing creates a payment/state mismatch.
  const userRef = adminDb.collection("users").doc(user.uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() || {};
  const subId = userData.subscriptionId as string | undefined;
  const planStatus = userData.planStatus as string | undefined;
  let cancelledSubId: string | null = null;
  if (subId && (planStatus === "active" || planStatus === "authenticated")) {
    try {
      await getRazorpay().subscriptions.cancel(subId, { cancel_at_cycle_end: false } as never);
      await adminDb.collection("subscriptions").doc(subId).set(
        { status: "cancelled", updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      cancelledSubId = subId;
    } catch (err) {
      console.error("[team/invite/accept] razorpay cancel failed", err);
      return NextResponse.json(
        { error: "Could not cancel your existing paid subscription. Try again in a minute or cancel it from Billing first." },
        { status: 502 }
      );
    }
  }

  const teamId = invite.teamId as string;
  const memberDocId = teamMemberId(teamId, user.uid);
  const memberRef = adminDb.collection("teamMembers").doc(memberDocId);
  const teamRef = adminDb.collection("teams").doc(teamId);
  const seatLimit = getTeamSeatLimit("business");

  try {
    await adminDb.runTransaction(async (tx) => {
      // Re-read invite — could have been revoked/expired/accepted concurrently.
      const inviteRecheck = await tx.get(inviteRef);
      if (!inviteRecheck.exists || inviteRecheck.data()?.status !== "pending") {
        throw new Error("INVITE_STATE_CHANGED");
      }

      const teamSnap = await tx.get(teamRef);
      if (!teamSnap.exists) throw new Error("TEAM_GONE");

      // Re-check seat cap inside the tx. Use single where(teamId) + JS filter
      // to comply with the project rule against composite queries.
      const membersSnap = await tx.get(
        adminDb.collection("teamMembers").where("teamId", "==", teamId)
      );
      const activeMembers = membersSnap.docs.filter(
        (d) => d.id !== memberDocId && d.data().status === "active"
      ).length;
      if (activeMembers + 1 > seatLimit) {
        throw new Error("SEAT_LIMIT");
      }

      const memberSnap = await tx.get(memberRef);
      const wasPreviouslyRemoved = memberSnap.exists && memberSnap.data()?.status === "removed";

      tx.set(
        memberRef,
        {
          teamId,
          memberUid: user.uid,
          ownerUid: invite.ownerUid,
          email: callerEmail,
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

      // Only stamp activeTeamId — getUserPlan() reads this to return "pro"
      // automatically. We do NOT overwrite plan/planStatus to "free": doing
      // so destroys the user's real plan state, and on leave/remove they'd
      // be unable to revert. Razorpay sub already cancelled above, so the
      // separate webhook will move planStatus → cancelled in its own time.
      const userUpdate: Record<string, unknown> = {
        activeTeamId: teamId,
        teamJoinedAt: FieldValue.serverTimestamp(),
      };
      if (cancelledSubId) {
        // Clear the local subscriptionId pointer so Billing UI doesn't try to
        // manage a now-cancelled subscription.
        userUpdate.subscriptionId = null;
      }
      tx.set(userRef, userUpdate, { merge: true });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    if (msg === "INVITE_STATE_CHANGED") {
      return NextResponse.json({ error: "This invite is no longer pending." }, { status: 410 });
    }
    if (msg === "TEAM_GONE") {
      return NextResponse.json({ error: "Team no longer exists." }, { status: 410 });
    }
    if (msg === "SEAT_LIMIT") {
      return NextResponse.json({ error: "Team is now at its seat limit. Ask the owner to free a seat." }, { status: 409 });
    }
    console.error("[team/invite/accept]", err);
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }

  return NextResponse.json({ success: true, teamId });
}
