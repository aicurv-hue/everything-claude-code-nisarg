import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { generateIdeas } from "@/lib/ai/idea-generate";
import { ideaService } from "@/lib/db/ideas";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ") || !adminAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const d = await adminAuth.verifyIdToken(h.slice(7));
    uid = d.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { segment = "individual", count = 10 } = await req.json();

  // Fetch profile
  const profileDoc = await adminDb.collection("profiles").doc(uid).get();
  const profileData = profileDoc.data();
  const profile = profileData?.[segment] || {};

  // Fetch recent topics from memory for dedup — single where to avoid composite index
  const memSnap = await adminDb
    .collection("post_memories")
    .where("user_id", "==", uid)
    .limit(50)
    .get();
  const recentTopics = memSnap.docs
    .map((d) => d.data())
    .filter((d) => d.segment === segment)
    .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
    .slice(0, 20)
    .map((d) => d.topic)
    .filter(Boolean);

  const ideas = await generateIdeas(profile, recentTopics, segment, Math.min(count, 20));

  if (!ideas.length) {
    return NextResponse.json({ ideas: [], count: 0 });
  }

  // Batch save
  const ideaDocs = ideas.map((idea) => ({
    user_id: uid,
    segment: segment as "individual" | "corporate",
    title: idea.title,
    description: idea.description || "",
    pillar: idea.pillar || null,
    suggestedTone: idea.suggestedTone || null,
    suggestedAudience: idea.suggestedAudience || null,
    source: "ai_suggested" as const,
    status: "active" as const,
  }));

  await ideaService.saveBatch(ideaDocs);

  return NextResponse.json({ ideas: ideaDocs, count: ideaDocs.length });
}
