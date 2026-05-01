/**
 * POST /api/tokens/save
 *
 * Internal endpoint — saves a LinkedIn token to Firestore via Admin SDK.
 * Called fire-and-forget from the OAuth callback (which runs on Edge Runtime
 * and cannot use the Firebase client SDK reliably).
 *
 * This route runs on Node.js runtime so adminDb is fully available.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  // Internal-only endpoint — require shared secret unconditionally.
  // Without this gate, anyone could overwrite any user's LinkedIn token in Firestore.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    console.error("[tokens/save] INTERNAL_API_SECRET not configured — refusing all requests");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  }
  if (req.headers.get("x-internal-secret") !== internalSecret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      user_id,
      access_token,
      refresh_token,
      user_sub,
      user_name,
      user_email,
      user_picture,
      expires_at,
      refresh_expires_at,
    } = body;

    if (!user_id || !access_token) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!adminDb) {
      console.warn("[tokens/save] adminDb unavailable — token not persisted");
      return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });
    }

    await adminDb.collection("tokens").doc(user_id).set({
      user_id,
      access_token,
      refresh_token:      refresh_token ?? null,
      user_sub:           user_sub ?? "",
      user_name:          user_name ?? "",
      user_email:         user_email ?? "",
      user_picture:       user_picture ?? "",
      expires_at:         expires_at ?? null,
      refresh_expires_at: refresh_expires_at ?? null,
      updated_at:         FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[tokens/save] Token saved for user ${user_id}`);
    return NextResponse.json({ saved: true });
  } catch (err: any) {
    console.error("[tokens/save] Failed:", err?.message || err);
    return NextResponse.json({ error: "Token save failed" }, { status: 500 });
  }
}
