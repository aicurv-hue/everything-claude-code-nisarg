import { adminDb } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const MAX_TURNS = 10;
const COLLECTION = "regeneration_sessions";

export interface RegenTurn {
  turn_index: number;          // 0 = initial anchor
  post_text: string;
  image_prompt?: string | null;
  user_comment: string | null; // null on turn 0 (anchor)
  model_used?: string | null;
  created_at: any;
}

export interface RegenerationSession {
  session_id: string;
  user_id: string;
  segment: "individual" | "corporate";
  initial_post: string;        // denormalized anchor
  turns: RegenTurn[];          // append-only, capped at MAX_TURNS
  created_at: any;
  updated_at: any;
}

export async function getSession(sessionId: string): Promise<RegenerationSession | null> {
  if (!adminDb) return null;
  const snap = await adminDb.collection(COLLECTION).doc(sessionId).get();
  if (!snap.exists) return null;
  return snap.data() as RegenerationSession;
}

export async function createSession(args: {
  sessionId: string;
  userId: string;
  segment: "individual" | "corporate";
  initialPost: string;
  initialImagePrompt?: string | null;
  modelUsed?: string | null;
}): Promise<void> {
  if (!adminDb) return;
  const now = FieldValue.serverTimestamp();
  const turn0: RegenTurn = {
    turn_index: 0,
    post_text: args.initialPost,
    image_prompt: args.initialImagePrompt ?? null,
    user_comment: null,
    model_used: args.modelUsed ?? null,
    created_at: Timestamp.now(),
  };
  await adminDb.collection(COLLECTION).doc(args.sessionId).set({
    session_id: args.sessionId,
    user_id: args.userId,
    segment: args.segment,
    initial_post: args.initialPost,
    turns: [turn0],
    created_at: now,
    updated_at: now,
  });
}

export async function appendTurn(
  sessionId: string,
  turn: Omit<RegenTurn, "turn_index" | "created_at">
): Promise<{ ok: true; turn_index: number; remaining: number } | { ok: false; reason: "not_found" | "cap_reached" }> {
  if (!adminDb) return { ok: false, reason: "not_found" };
  const ref = adminDb.collection(COLLECTION).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "not_found" };
  const data = snap.data() as RegenerationSession;
  if ((data.turns?.length ?? 0) >= MAX_TURNS) {
    return { ok: false, reason: "cap_reached" };
  }
  const nextIndex = data.turns.length;
  const newTurn: RegenTurn = {
    ...turn,
    turn_index: nextIndex,
    created_at: Timestamp.now(),
  };
  await ref.update({
    turns: FieldValue.arrayUnion(newTurn),
    updated_at: FieldValue.serverTimestamp(),
  });
  return { ok: true, turn_index: nextIndex, remaining: Math.max(0, MAX_TURNS - (nextIndex + 1)) };
}

export async function deleteSession(sessionId: string): Promise<void> {
  if (!adminDb) return;
  await adminDb.collection(COLLECTION).doc(sessionId).delete().catch(() => {});
}
