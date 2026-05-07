import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/utils/requireAdmin";

function randomCode(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join("");
}

export async function POST(req: NextRequest) {
  const adminEmail = await requireAdmin(req); const ok = !!adminEmail; const uid = undefined;
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminDb) return NextResponse.json({ error: "Server not configured." }, { status: 503 });

  try {
    const body = await req.json();
    const { trialDays, maxUses, expiresAt, label } = body;

    const resolvedPlan = "business";

    const code = `CRIDL-${randomCode(8)}`;

    const docData = {
      code,
      plan: resolvedPlan,
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

    return NextResponse.json({ code, plan: resolvedPlan, trialDays: docData.trialDays, maxUses: docData.maxUses, label: docData.label });
  } catch (err: unknown) {
    const e = err as Error;
    return NextResponse.json({ error: e.message || "Unexpected error." }, { status: 500 });
  }
}

/** PATCH /api/admin/promo-codes — edit a code (trialDays, expiresAt, isActive, label) */
export async function PATCH(req: NextRequest) {
  const ok = !!(await requireAdmin(req));
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
  const ok = !!(await requireAdmin(req));
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
  const ok = !!(await requireAdmin(req));
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!adminDb) return NextResponse.json({ error: "Server not configured." }, { status: 503 });

  try {
    const snap = await adminDb.collection("promoCodes").orderBy("createdAt", "desc").get();
    const codes = snap.docs.map(doc => {
      const d = doc.data();
      return {
        code: d.code,
        label: d.label || "",
        plan: d.plan || "starter",
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
