import { adminDb } from "../firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface ContentIdea {
  id?: string;
  user_id: string;
  segment: "individual" | "corporate";
  title: string;
  description?: string;
  pillar?: string | null;
  suggestedTone?: string | null;
  suggestedAudience?: string | null;
  source: "manual" | "ai_suggested";
  status: "active" | "used" | "archived";
  convertedPostId?: string;
  convertedAt?: FirebaseFirestore.Timestamp | null;
  created_at?: FirebaseFirestore.Timestamp;
}

const col = () => adminDb.collection("content_ideas");

export const ideaService = {
  async getAll(
    userId: string,
    segment: string,
    statusFilter?: string
  ): Promise<ContentIdea[]> {
    // Single where clause to avoid composite index requirement; filter in memory
    const snap = await col()
      .where("user_id", "==", userId)
      .limit(200)
      .get();

    let ideas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ContentIdea))
      .filter((i) => i.segment === segment)
      .sort((a, b) => {
        const ta = (a.created_at as any)?.seconds ?? 0;
        const tb = (b.created_at as any)?.seconds ?? 0;
        return tb - ta;
      });

    if (statusFilter) ideas = ideas.filter((i) => i.status === statusFilter);
    return ideas.slice(0, 100);
  },

  async save(idea: Omit<ContentIdea, "id" | "created_at">): Promise<string> {
    const ref = await col().add({
      ...idea,
      created_at: FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async saveBatch(ideas: Omit<ContentIdea, "id" | "created_at">[]): Promise<string[]> {
    const batch = adminDb.batch();
    const ids: string[] = [];
    for (const idea of ideas) {
      const ref = col().doc();
      ids.push(ref.id);
      batch.set(ref, { ...idea, created_at: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    return ids;
  },

  async updateStatus(
    id: string,
    status: "used" | "archived",
    convertedPostId?: string
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (convertedPostId) {
      update.convertedPostId = convertedPostId;
      update.convertedAt = FieldValue.serverTimestamp();
    }
    await col().doc(id).update(update);
  },

  async delete(id: string): Promise<void> {
    await col().doc(id).delete();
  },
};
