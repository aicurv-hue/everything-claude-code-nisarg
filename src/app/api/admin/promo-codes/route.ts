import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

async function verifyAdmin(req: NextRequest): Promise<{ ok: boolean; uid?: string }> {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken || !adminAuth) return { ok: false };
    const decoded = await adminAuth.verifyIdToken(idToken);
    const isAdmin = ADMIN_EMAILS.includes(decoded.email?.toLowerCase() || "");
    return { ok: isAdmin, uid: decoded.uid };
  } catch { return { ok: false }; }
}

function randomCode(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function POST(req: NextRequest) {
  const { ok, uid } = await verifyAdmin(req);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminDb) return NextResponse.json({ error: "Server not configured." }, { status: 503 });

  try {
    const body = await req.json();
    const { trialDays, maxUses, expiresAt, label } = body;

    const code = `CRIDL-${randomCode(8)}`;

    const docData = {
      code,
      trialDays: Number(trialDays) || 15,
      maxUses: maxUses !== undefined && maxUses !== null && maxUses !== "" ? Number(maxUses) : null,
      expiresAt: expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
      usesCount: 0,
      usedBy: [],
      isActive: true,
      label: label || "",
      createdBy: uid || "",
      createdAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("promoCodes").doc(code).set(docData);

    return NextResponse.json({ code, trialDays: docData.trialDays, maxUses: docData.maxUses, label: docData.label });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ error: e.message || "Unexpected error." }, { status: 500 });
  }
}

/** PATCH /api/admin/promo-codes — edit a code (trialDays, expiresAt, isActive, label) */
export async function PATCH(req: NextRequest) {
  const { ok } = await verifyAdmin(req);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminDb) return NextResponse.json({ error: "Server not configured." }, { status: 503 });

  try {
    const { code, trialDays, expiresAt, isActive, label } = await req.json();
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (trialDays !== undefined) updates.trialDays = Number(trialDays);
    if (isActive  !== undefined) updates.isActive  = Boolean(isActive);
    if (label     !== undefined) updates.label     = label;
    if (expiresAt !== undefined) {
      updates.expiresAt = expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null;
    }

    await adminDb.collection("promoCodes").doc(code).update(updates);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** DELETE /api/admin/promo-codes — delete a code */
export async function DELETE(req: NextRequest) {
  const { ok } = await verifyAdmin(req);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminDb) return NextResponse.json({ error: "Server not configured." }, { status: 503 });

  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });
    await adminDb.collection("promoCodes").doc(code).delete();
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { ok } = await verifyAdmin(req);
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminDb) return NextResponse.json({ error: "Server not configured." }, { status: 503 });

  try {
    const snap = await adminDb.collection("promoCodes").orderBy("createdAt", "desc").get();
    const codes = snap.docs.map(doc => {
      const d = doc.data();
      return {
        code: d.code,
        label: d.label || "",
        trialDays: d.trialDays,
        maxUses: d.maxUses,
        usesCount: d.usesCount || 0,
        expiresAt: d.expiresAt ? (d.expiresAt as Timestamp).toDate().toISOString() : null,
        isActive: d.isActive,
        createdAt: d.createdAt ? (d.createdAt as Timestamp).toDate().toISOString() : null,
      };
    });
    return NextResponse.json({ codes });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ error: e.message || "Unexpected error." }, { status: 500 });
  }
}
