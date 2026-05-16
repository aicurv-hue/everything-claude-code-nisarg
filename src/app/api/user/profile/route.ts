/**
 * GET /api/user/profile
 *
 * Returns the authenticated user's profile from Firestore. For team members,
 * also includes `teamOwnerCorporate` so the preview page can render the team
 * owner's corporate identity (name + org ID) when drafting company-page posts —
 * the member's own corporate fields are empty by design.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getActiveMembership } from "@/lib/team";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken || !adminAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    if (!adminDb) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }

    const snap = await adminDb.collection("profiles").doc(uid).get();
    const profile = snap.exists ? (snap.data() || {}) : {};

    // Surface team owner's corporate identity for active members so the
    // preview UI can show the right org name + pass the right org ID when
    // drafting company-page posts. Best-effort: a missing owner profile just
    // omits the field — the publish route resolves it server-side anyway.
    let teamOwnerCorporate: { name?: string; linkedinOrganizationId?: string } | undefined;
    try {
      const membership = await getActiveMembership(uid);
      if (membership) {
        const ownerSnap = await adminDb.collection("profiles").doc(membership.ownerUid).get();
        const ownerCorp = ownerSnap.data()?.corporate || {};
        teamOwnerCorporate = {
          name: ownerCorp.name,
          linkedinOrganizationId: ownerCorp.linkedinOrganizationId,
        };
      }
    } catch {
      // non-fatal — solo / non-member flow unaffected
    }

    return NextResponse.json({ ...profile, ...(teamOwnerCorporate ? { teamOwnerCorporate } : {}) });
  } catch {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
