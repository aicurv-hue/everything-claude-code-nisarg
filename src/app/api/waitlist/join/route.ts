import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  try {
    const { email, name, source } = await req.json();
    const key = (email as string)?.toLowerCase().trim();

    if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400, headers: CORS });
    }

    if (!adminDb) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503, headers: CORS });
    }

    const ref = adminDb.collection("waitlist").doc(key);
    const existing = await ref.get();

    if (existing.exists) {
      return NextResponse.json({ success: true, alreadyJoined: true }, { headers: CORS });
    }

    await ref.set({
      email: key,
      name: (name as string)?.trim() || null,
      source: (source as string)?.trim() || "cridl.com",
      status: "pending",
      created_at: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true }, { status: 201, headers: CORS });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500, headers: CORS });
  }
}
