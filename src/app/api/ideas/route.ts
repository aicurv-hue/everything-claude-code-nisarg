import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { ideaService } from "@/lib/db/ideas";

export const runtime = "nodejs";

async function getUid(req: NextRequest): Promise<string | null> {
  const h = req.headers.get("authorization") || "";
  if (!h.startsWith("Bearer ") || !adminAuth) return null;
  try {
    const d = await adminAuth.verifyIdToken(h.slice(7));
    return d.uid;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const segment = searchParams.get("segment") || "individual";
  const status = searchParams.get("status") || undefined;

  const ideas = await ideaService.getAll(uid, segment, status);
  return NextResponse.json({ ideas });
}

export async function POST(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const id = await ideaService.save({
    user_id: uid,
    segment: body.segment || "individual",
    title: body.title || "",
    description: body.description || "",
    pillar: body.pillar || null,
    suggestedTone: body.suggestedTone || null,
    suggestedAudience: body.suggestedAudience || null,
    source: body.source || "manual",
    status: "active",
  });

  return NextResponse.json({ id });
}

export async function PATCH(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, status, convertedPostId } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "Missing id or status" }, { status: 400 });

  await ideaService.updateStatus(id, status, convertedPostId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const uid = await getUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await ideaService.delete(id);
  return NextResponse.json({ ok: true });
}
