import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (!adminDb) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const { displayName } = await req.json();

  // Only create if profile doesn't already exist
  const ref = adminDb.collection("profiles").doc(uid);
  const snap = await ref.get();
  if (snap.exists) return NextResponse.json({ exists: true });

  await ref.set({
    lastActiveSegment: "individual",
    individual: {
      fullName: displayName || "",
      currentRole: "",
      niche: "",
      writingStyle: "",
      targetAudience: "",
      audienceProblems: "",
      uniquePerspective: "",
      brandVoice: "",
      contentGoals: "",
      primaryModel: "google/gemini-2.0-flash-001",
    },
    corporate: {
      companyName: "",
      industry: "",
      linkedinOrganizationId: "",
    },
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ created: true });
}
