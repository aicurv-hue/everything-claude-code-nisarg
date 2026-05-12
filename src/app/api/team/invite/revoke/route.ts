import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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
  const inviteId = String(body?.inviteId || "").trim();
  if (!inviteId) return NextResponse.json({ error: "inviteId required" }, { status: 400 });

  const inviteRef = adminDb.collection("teamInvites").doc(inviteId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = inviteSnap.data()!;
  if (data.ownerUid !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (data.status !== "pending") {
    return NextResponse.json({ error: `Invite is ${data.status}` }, { status: 409 });
  }

  await inviteRef.update({ status: "revoked", revokedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ success: true });
}
