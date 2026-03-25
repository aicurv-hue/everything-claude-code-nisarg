import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

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

export async function GET(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const doc = await adminDb.collection("profiles").doc(uid).get();
    return NextResponse.json({ profile: doc.exists ? doc.data() : null });
  } catch (err: any) {
    console.error("[/api/profiles GET]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const { profile } = await req.json();
    await adminDb.collection("profiles").doc(uid).set(
      { ...profile, updated_at: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/profiles POST]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
