import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getUserPlan, canUseCorporate } from "@/lib/checkSubscription";
import { getActiveMembership, getOwnedTeam } from "@/lib/team";

/** Convert an ISO string or existing Timestamp-like object to a Firestore Timestamp */
function toFirestoreTimestamp(val: any): Timestamp | undefined {
  if (!val) return undefined;
  if (val instanceof Timestamp) return val;
  if (typeof val === "string") return Timestamp.fromDate(new Date(val));
  if (val.seconds) return new Timestamp(val.seconds, val.nanoseconds || 0);
  return undefined;
}

function convertTimestamp(ts: any) {
  if (!ts) return null;
  if (ts.toDate) return { seconds: Math.floor(ts.toDate().getTime() / 1000) };
  if (ts.seconds) return { seconds: ts.seconds };
  return null;
}

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

/**
 * Resolves the team context for the caller:
 *  - "owner"  → caller owns a team (own team posts use user_id=caller, teamId stamped)
 *  - "member" → caller is an active member of someone else's team
 *  - "none"   → caller has no team affiliation
 */
async function resolveTeamContext(uid: string): Promise<
  | { role: "owner"; teamId: string; ownerUid: string }
  | { role: "member"; teamId: string; ownerUid: string }
  | { role: "none" }
> {
  const [ownTeam, membership] = await Promise.all([
    getOwnedTeam(uid),
    getActiveMembership(uid),
  ]);
  if (ownTeam) return { role: "owner", teamId: ownTeam.id, ownerUid: uid };
  if (membership) return { role: "member", teamId: membership.teamId, ownerUid: membership.ownerUid };
  return { role: "none" };
}

export async function GET(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  const segment = req.nextUrl.searchParams.get("segment");

  try {
    const ctx = await resolveTeamContext(uid);

    // Own posts (user_id == uid). For team owners this already includes all
    // team corporate posts because they were written with user_id=ownerUid.
    const ownSnap = await adminDb.collection("posts").where("user_id", "==", uid).get();
    const seen = new Set<string>();
    let posts: Record<string, any>[] = ownSnap.docs.map((d) => {
      const data = d.data();
      seen.add(d.id);
      return {
        id: d.id,
        ...data,
        created_at:   convertTimestamp(data.created_at),
        updated_at:   convertTimestamp(data.updated_at),
        published_at: convertTimestamp(data.published_at),
        scheduled_at: convertTimestamp(data.scheduled_at),
      } as Record<string, any>;
    });

    // Members also see all corporate posts shared in their team.
    if (ctx.role === "member") {
      const teamSnap = await adminDb.collection("posts").where("teamId", "==", ctx.teamId).get();
      for (const d of teamSnap.docs) {
        if (seen.has(d.id)) continue;
        const data = d.data();
        if (data.segment !== "corporate") continue;
        posts.push({
          id: d.id,
          ...data,
          created_at:   convertTimestamp(data.created_at),
          updated_at:   convertTimestamp(data.updated_at),
          published_at: convertTimestamp(data.published_at),
          scheduled_at: convertTimestamp(data.scheduled_at),
        });
        seen.add(d.id);
      }
    }

    if (segment) posts = posts.filter((p) => p.segment === segment);

    posts.sort((a, b) => {
      const getTs = (p: Record<string, any>) => {
        if (p.status === "published") return p.published_at?.seconds ?? p.created_at?.seconds ?? 0;
        if (p.status === "scheduled") return p.scheduled_at?.seconds ?? p.created_at?.seconds ?? 0;
        return p.created_at?.seconds ?? 0;
      };
      const tsA = getTs(a);
      const tsB = getTs(b);
      if (a.status === "scheduled" && b.status === "scheduled") return tsA - tsB;
      return tsB - tsA;
    });

    return NextResponse.json({ posts });
  } catch (err: any) {
    console.error("[/api/posts GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const { post } = await req.json();
    const isCorporate = post?.segment === "corporate";

    let postOwnerUid = uid;
    let teamId: string | null = null;
    let authorDisplayName: string | null = null;

    if (isCorporate) {
      const ctx = await resolveTeamContext(uid);

      if (ctx.role === "member") {
        // Member → post routes to team owner so cron uses owner's LinkedIn token
        // and usage pools against the owner's plan quota.
        postOwnerUid = ctx.ownerUid;
        teamId = ctx.teamId;
        // Owner's plan is the effective plan for the post — they're Business by
        // definition (you can't have members without it), so corporate is allowed.
      } else if (ctx.role === "owner") {
        // Owner posting on their own corporate page — keep user_id=self, stamp
        // teamId so members can see the post.
        postOwnerUid = uid;
        teamId = ctx.teamId;
        const plan = await getUserPlan(uid);
        if (!canUseCorporate(plan)) {
          return NextResponse.json({ error: "Company page posting requires Pro or Business plan" }, { status: 403 });
        }
      } else {
        // Solo Pro/Business user with no team
        const plan = await getUserPlan(uid);
        if (!canUseCorporate(plan)) {
          return NextResponse.json({ error: "Company page posting requires Pro or Business plan" }, { status: 403 });
        }
      }

      // Capture drafter's display name for "Posted by" UI
      const drafterSnap = await adminDb.collection("users").doc(uid).get();
      const d = drafterSnap.data() || {};
      authorDisplayName = (d.displayName as string) || (d.name as string) || (d.email as string) || null;
    }

    // Allowlist — only these fields can be set by clients on create
    const POST_ALLOWED = new Set(["content", "topic", "tone", "audience", "length", "custom_instructions",
      "image_url", "image_mode", "image_hook", "image_prompt", "scheduled_at", "schedule_timezone",
      "best_time_applied", "status", "segment", "organization_id", "campaign_id", "research",
      "image_urls", "is_carousel", "carousel_title"]);
    const sanitizedPost: Record<string, any> = {};
    if (post) {
      for (const [k, v] of Object.entries(post)) {
        if (POST_ALLOWED.has(k)) sanitizedPost[k] = v;
      }
    }

    const postData: Record<string, any> = {
      ...sanitizedPost,
      user_id: postOwnerUid,
      authorUid: uid,
      ...(authorDisplayName ? { authorDisplayName } : {}),
      ...(teamId ? { teamId } : {}),
      created_at: FieldValue.serverTimestamp(),
      ...(sanitizedPost.scheduled_at ? { scheduled_at: toFirestoreTimestamp(sanitizedPost.scheduled_at) } : {}),
      ...(sanitizedPost.published_at ? { published_at: toFirestoreTimestamp(sanitizedPost.published_at) } : {}),
    };

    const ref = await adminDb.collection("posts").add(postData);
    return NextResponse.json({ id: ref.id, ...post, user_id: postOwnerUid, authorUid: uid, teamId });
  } catch (err: any) {
    console.error("[/api/posts POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** True if uid is the post's owner (user_id) or its drafter (authorUid). */
function canEditPost(data: FirebaseFirestore.DocumentData | undefined, uid: string): boolean {
  if (!data) return false;
  return data.user_id === uid || data.authorUid === uid;
}

export async function PATCH(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const docRef = adminDb.collection("posts").doc(id);
    const snap = await docRef.get();
    if (!snap.exists || !canEditPost(snap.data(), uid)) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    const ALLOWED = new Set(["content", "topic", "tone", "audience", "length", "custom_instructions",
      "image_url", "image_mode", "image_hook", "image_prompt", "scheduled_at", "schedule_timezone",
      "best_time_applied", "status", "failed_reason",
      "image_urls", "is_carousel", "carousel_title"]);
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (ALLOWED.has(k)) sanitized[k] = v;
    }
    if (sanitized.scheduled_at) sanitized.scheduled_at = toFirestoreTimestamp(sanitized.scheduled_at);
    if (sanitized.published_at) sanitized.published_at = toFirestoreTimestamp(sanitized.published_at);
    await docRef.update({ ...sanitized, updated_at: FieldValue.serverTimestamp() });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/posts PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await verifyToken(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!adminDb) return NextResponse.json({ error: "Admin SDK unavailable" }, { status: 503 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const docRef = adminDb.collection("posts").doc(id);
    const snap = await docRef.get();
    if (!snap.exists || !canEditPost(snap.data(), uid)) {
      return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
    }

    const ownerUid = snap.data()?.user_id;
    await docRef.delete();

    // Clean up linked memory entry (best-effort — non-blocking)
    adminDb.collection("post_memories")
      .where("post_id", "==", id)
      .where("user_id", "==", ownerUid)
      .get()
      .then((s) => Promise.all(s.docs.map((d) => d.ref.delete())))
      .catch(() => {});

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[/api/posts DELETE]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
