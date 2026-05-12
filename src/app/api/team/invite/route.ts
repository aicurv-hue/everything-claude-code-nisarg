import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getUserPlan, canUseTeam } from "@/lib/checkSubscription";
import {
  ensureTeamForOwner,
  countActiveMembers,
  countPendingInvites,
  getTeamSeatLimit,
  generateInviteToken,
  inviteExpiryMillis,
} from "@/lib/team";
import { sendTeamInviteEmail } from "@/lib/email/resend";

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
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const plan = await getUserPlan(uid);
  if (!canUseTeam(plan)) {
    return NextResponse.json({ error: "Team is available on the Business plan only" }, { status: 403 });
  }

  const team = await ensureTeamForOwner(uid);

  const [activeMembers, pendingInvites] = await Promise.all([
    countActiveMembers(team.id),
    countPendingInvites(team.id),
  ]);
  const seatLimit = getTeamSeatLimit(plan);
  if (activeMembers + pendingInvites >= seatLimit) {
    return NextResponse.json(
      { error: `Seat limit reached (${seatLimit}). Contact us to add more.` },
      { status: 403 }
    );
  }

  // Block inviting yourself
  const ownerSnap = await adminDb.collection("users").doc(uid).get();
  const ownerEmail = (ownerSnap.data()?.email || "").toLowerCase();
  if (ownerEmail && ownerEmail === email) {
    return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });
  }

  // Block duplicate pending invite for the same email
  const existing = await adminDb
    .collection("teamInvites")
    .where("teamId", "==", team.id)
    .where("email", "==", email)
    .get();
  const hasPending = existing.docs.some((d) => d.data().status === "pending");
  if (hasPending) {
    return NextResponse.json({ error: "An invite is already pending for this email" }, { status: 409 });
  }

  const inviteRef = adminDb.collection("teamInvites").doc();
  const inviteId = inviteRef.id;
  const token = generateInviteToken(inviteId);
  const expiresAt = Timestamp.fromMillis(inviteExpiryMillis());

  await inviteRef.set({
    teamId: team.id,
    ownerUid: uid,
    orgId: team.orgId || null,
    email,
    status: "pending",
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });

  try {
    const inviterName = (ownerSnap.data()?.displayName as string) || (ownerSnap.data()?.name as string) || "Your colleague";
    const teamLabel = team.orgName ? `${team.orgName} on Cridl` : "the Cridl team";
    await sendTeamInviteEmail({ to: email, inviterName, teamLabel, inviteToken: token });
  } catch (err) {
    console.error("[team/invite] email send failed", err);
    // Don't fail the invite — owner can copy the link from the response
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return NextResponse.json({
    success: true,
    inviteId,
    inviteUrl: appUrl ? `${appUrl}/invite/${encodeURIComponent(token)}` : null,
  });
}
