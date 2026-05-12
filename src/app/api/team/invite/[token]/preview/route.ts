import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { verifyInviteToken } from "@/lib/team";

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

function tsToMillis(t: unknown): number | null {
  if (!t) return null;
  if (t instanceof Timestamp) return t.toMillis();
  const anyT = t as { toMillis?: () => number; seconds?: number };
  if (typeof anyT.toMillis === "function") return anyT.toMillis();
  if (typeof anyT.seconds === "number") return anyT.seconds * 1000;
  return null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const { token } = await ctx.params;
  const inviteId = verifyInviteToken(decodeURIComponent(token));
  if (!inviteId) return NextResponse.json({ error: "Invalid invite" }, { status: 400 });

  const inviteSnap = await adminDb.collection("teamInvites").doc(inviteId).get();
  if (!inviteSnap.exists) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  const invite = inviteSnap.data()!;

  const expiresMs = (invite.expiresAt as Timestamp)?.toMillis?.() || 0;
  const expired = expiresMs > 0 && expiresMs < Date.now();
  const emailMatches = !!user.email && user.email === String(invite.email).toLowerCase();

  // Fetch team meta + active member count to show in the preview
  const teamSnap = await adminDb.collection("teams").doc(invite.teamId as string).get();
  const teamData = teamSnap.data() || {};

  const membersSnap = await adminDb
    .collection("teamMembers")
    .where("teamId", "==", invite.teamId)
    .get();
  const activeMemberCount = membersSnap.docs.filter((d) => d.data().status === "active").length;

  return NextResponse.json({
    invite: {
      id: inviteId,
      status: invite.status,
      email: invite.email,
      inviterName: invite.inviterName || "A Cridl user",
      orgName: invite.orgName || teamData.orgName || null,
      teamId: invite.teamId,
      createdAt: tsToMillis(invite.createdAt),
      expiresAt: tsToMillis(invite.expiresAt),
      expired,
      emailMatches,
    },
    team: {
      memberCount: activeMemberCount,
      orgName: teamData.orgName || null,
    },
  });
}
