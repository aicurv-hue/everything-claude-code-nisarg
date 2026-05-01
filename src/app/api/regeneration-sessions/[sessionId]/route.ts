import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import {
  appendTurn,
  createSession,
  deleteSession,
  getSession,
  MAX_TURNS,
} from "@/lib/db/regenerationSessions";

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

function isValidSessionId(id: string): boolean {
  // crypto.randomUUID format or 16-64 char alnum/dash — defensive cap
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(id);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await ctx.params;
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const session = await getSession(sessionId);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    session_id: session.session_id,
    initial_post: session.initial_post,
    segment: session.segment,
    turns: session.turns,
    regenerations_left: Math.max(0, MAX_TURNS - session.turns.length),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await ctx.params;
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const existing = await getSession(sessionId);

  // Create-on-first-write: client supplies initial_post + segment if no session exists yet
  if (!existing) {
    const {
      initial_post,
      segment,
      initial_image_prompt,
      user_comment,
      post_text,
      image_prompt,
      model_used,
    } = body || {};
    if (typeof initial_post !== "string" || !initial_post.trim()) {
      return NextResponse.json({ error: "Missing initial_post" }, { status: 400 });
    }
    const seg: "individual" | "corporate" = segment === "corporate" ? "corporate" : "individual";
    await createSession({
      sessionId,
      userId: uid,
      segment: seg,
      initialPost: initial_post,
      initialImagePrompt: initial_image_prompt ?? null,
      modelUsed: model_used ?? null,
    });

    // If a regen turn was supplied alongside session creation, append it
    if (typeof post_text === "string" && typeof user_comment === "string") {
      const r = await appendTurn(sessionId, {
        post_text,
        image_prompt: image_prompt ?? null,
        user_comment,
        model_used: model_used ?? null,
      });
      if (!r.ok) {
        return NextResponse.json({ error: r.reason }, { status: r.reason === "cap_reached" ? 429 : 500 });
      }
      return NextResponse.json({ ok: true, turn_index: r.turn_index, regenerations_left: r.remaining });
    }
    return NextResponse.json({ ok: true, turn_index: 0, regenerations_left: MAX_TURNS - 1 });
  }

  // Existing session — verify ownership, append a regen turn
  if (existing.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { user_comment, post_text, image_prompt, model_used } = body || {};
  if (typeof post_text !== "string" || !post_text.trim()) {
    return NextResponse.json({ error: "Missing post_text" }, { status: 400 });
  }

  const r = await appendTurn(sessionId, {
    post_text,
    image_prompt: image_prompt ?? null,
    user_comment: typeof user_comment === "string" ? user_comment : "",
    model_used: model_used ?? null,
  });
  if (!r.ok) {
    if (r.reason === "cap_reached") {
      return NextResponse.json({ error: "cap_reached", regenerations_left: 0 }, { status: 429 });
    }
    return NextResponse.json({ error: r.reason }, { status: 500 });
  }
  return NextResponse.json({ ok: true, turn_index: r.turn_index, regenerations_left: r.remaining });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await ctx.params;
  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }
  const existing = await getSession(sessionId);
  if (!existing) return NextResponse.json({ ok: true });
  if (existing.user_id !== uid) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteSession(sessionId);
  return NextResponse.json({ ok: true });
}
