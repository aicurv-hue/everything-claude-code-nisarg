import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { generateInviteToken } from "@/lib/team";

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

export async function GET(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
  if (!user.email) return NextResponse.json({ invites: [] });

  const snap = await adminDb.collection("teamInvites").where("email", "==", user.email).get();

  const now = Date.now();
  const invites = snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        teamId: data.teamId as string,
        ownerUid: data.ownerUid as string,
        orgName: (data.orgName as string) || null,
        inviterName: (data.inviterName as string) || "A Cridl user",
        status: data.status as string,
        createdAt: tsToMillis(data.createdAt),
        expiresAt: tsToMillis(data.expiresAt),
        token: generateInviteToken(d.id),
      };
    })
    .filter((i) => {
      if (i.status !== "pending") return false;
      if (i.expiresAt && i.expiresAt < now) return false;
      return true;
    });

  return NextResponse.json({ invites });
}
