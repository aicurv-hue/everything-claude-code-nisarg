import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getUserPlan, canUseTeam } from "@/lib/checkSubscription";
import {
  ensureTeamForOwner,
  getTeamSeatLimit,
  generateInviteToken,
  inviteExpiryMillis,
} from "@/lib/team";
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

  // Block inviting yourself
  const ownerSnap = await adminDb.collection("users").doc(uid).get();
  const ownerEmail = (ownerSnap.data()?.email || "").toLowerCase();
  if (ownerEmail && ownerEmail === email) {
    return NextResponse.json({ error: "You cannot invite yourself" }, { status: 400 });
  }

  // Owner with an existing team is always entitled to the Business seat cap,
  // even if their plan is mid-recovery — the cancel-with-team-members guard in
  // /api/subscriptions/cancel prevents the inconsistent state at the source.
  const seatLimit = Math.max(getTeamSeatLimit(plan), getTeamSeatLimit("business"));
  const inviteRef = adminDb.collection("teamInvites").doc();
  const inviteId = inviteRef.id;
  const token = generateInviteToken(inviteId);
  const expiresAt = Timestamp.fromMillis(inviteExpiryMillis());

  const inviterName =
    (ownerSnap.data()?.displayName as string) ||
    (ownerSnap.data()?.name as string) ||
    (ownerSnap.data()?.email as string) ||
    "A Cridl user";

  // Atomic seat-cap + duplicate-email + invite-create.
  // Reads done inside the transaction use single where(teamId) + JS filter to
  // comply with the project rule against composite queries.
  try {
    await adminDb.runTransaction(async (tx) => {
      const [membersSnap, invitesSnap] = await Promise.all([
        tx.get(adminDb.collection("teamMembers").where("teamId", "==", team.id)),
        tx.get(adminDb.collection("teamInvites").where("teamId", "==", team.id)),
      ]);
      const activeMembers = membersSnap.docs.filter((d) => d.data().status === "active").length;
      const pendingInvites = invitesSnap.docs.filter((d) => d.data().status === "pending");
      if (activeMembers + pendingInvites.length >= seatLimit) {
        throw new Error(`SEAT_LIMIT:${seatLimit}`);
      }
      const dupe = pendingInvites.some((d) => String(d.data().email || "").toLowerCase() === email);
      if (dupe) throw new Error("DUPLICATE_PENDING");

      tx.set(inviteRef, {
        teamId: team.id,
        ownerUid: uid,
        orgId: team.orgId || null,
        orgName: team.orgName || null,
        inviterName,
        email,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        expiresAt,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    if (msg.startsWith("SEAT_LIMIT:")) {
      const limit = msg.split(":")[1];
      return NextResponse.json({ error: `Seat limit reached (${limit}). Contact us to add more.` }, { status: 403 });
    }
    if (msg === "DUPLICATE_PENDING") {
      return NextResponse.json({ error: "An invite is already pending for this email" }, { status: 409 });
    }
    console.error("[team/invite]", err);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return NextResponse.json({
    success: true,
    inviteId,
    inviteUrl: appUrl ? `${appUrl}/invite/${encodeURIComponent(token)}` : null,
  });
}
