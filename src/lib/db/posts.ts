import { db, isMock } from "@/lib/firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp
} from "firebase/firestore";

export interface Post {
  id?: string;
  user_id: string;
  account_id: string;
  content: string;
  status: "draft" | "scheduled" | "published" | "failed";
  topic: string;
  tone: string;
  audience: string;
  length?: "short" | "medium" | "long";
  custom_instructions?: string;
  segment: "individual" | "corporate";
  research_data: any;
  linkedin_post_id?: string;
  image_url?: string;
  scheduled_at?: any;
  schedule_timezone?: string;
  best_time_applied?: boolean;
  published_at?: any;
  created_at: any;
  updated_at?: any;
}

const COLLECTION = "posts";

// ── Mock helpers (localStorage fallback) ─────────────────────────────────────

const getMockPosts = (): Post[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("mock_posts") || "[]"); }
  catch { return []; }
};

const saveMockPost = (post: any): Post => {
  const all = getMockPosts();
  const newPost: Post = {
    ...post,
    id: Math.random().toString(36).substr(2, 9),
    created_at: { seconds: Date.now() / 1000 },
  };
  try {
    localStorage.setItem("mock_posts", JSON.stringify([newPost, ...all]));
  } catch {
    // QuotaExceededError — retry without research_data and without image data URLs
    const slim = { ...newPost, research_data: {} };
    if (typeof slim.image_url === "string" && slim.image_url.startsWith("data:")) {
      slim.image_url = undefined;
    }
    try {
      localStorage.setItem("mock_posts", JSON.stringify([slim, ...all]));
    } catch {
      // Last resort: evict oldest half and retry
      const trimmed = all.slice(0, Math.floor(all.length / 2));
      localStorage.setItem("mock_posts", JSON.stringify([slim, ...trimmed]));
    }
  }
  return newPost;
};

const updateMockPost = (id: string, updates: Partial<Post>) => {
  const all = getMockPosts();
  // Strip data: URLs from updates — they blow localStorage quota
  const safeUpdates = { ...updates };
  if (typeof safeUpdates.image_url === "string" && safeUpdates.image_url.startsWith("data:")) {
    delete safeUpdates.image_url;
  }
  const updated = all.map((p) => p.id === id ? { ...p, ...safeUpdates } : p);
  try {
    localStorage.setItem("mock_posts", JSON.stringify(updated));
  } catch { /* non-critical update */ }
};

/**
 * Firestore rejects `undefined` field values — replace with `null` before any write.
 * This is a no-op for localStorage (JSON.stringify already drops undefined).
 */
function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === undefined ? null : v])
  );
}

// ── Post Service ──────────────────────────────────────────────────────────────

export const postService = {

  /** Save a generated post as a draft */
  async createDraft(post: Omit<Post, "id" | "created_at" | "status">) {
    if (isMock || !db) return saveMockPost({ ...post, status: "draft" });
    return await addDoc(collection(db, COLLECTION), stripUndefined({
      ...post,
      status: "draft",
      created_at: serverTimestamp(),
    }));
  },

  /**
   * Save a successfully published post.
   * linkedInPostId proves it actually went live — this is what drives the
   * "Live on LinkedIn" and "Published Last Week" counters on the dashboard.
   */
  async createPublished(
    post: Omit<Post, "id" | "created_at" | "status">,
    linkedInPostId: string,
    imageUrl?: string
  ) {
    const publishedPost = {
      ...post,
      status: "published" as const,
      linkedin_post_id: linkedInPostId,
      image_url: imageUrl || null,
      published_at: isMock || !db ? { seconds: Date.now() / 1000 } : serverTimestamp(),
      created_at: isMock || !db ? { seconds: Date.now() / 1000 } : serverTimestamp(),
    };

    if (isMock || !db) return saveMockPost(publishedPost);
    return await addDoc(collection(db, COLLECTION), stripUndefined({ ...publishedPost, created_at: serverTimestamp(), published_at: serverTimestamp() }));
  },

  /** Mark a draft as published after LinkedIn confirms it went live */
  async markPublished(id: string, linkedInPostId: string, imageUrl?: string) {
    const updates: Partial<Post> = {
      status: "published",
      linkedin_post_id: linkedInPostId,
      ...(imageUrl && { image_url: imageUrl }),
    };

    if (isMock || !db) {
      updateMockPost(id, { ...updates, published_at: { seconds: Date.now() / 1000 } });
      return;
    }
    return await updateDoc(doc(db, COLLECTION, id), {
      ...updates,
      published_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  },

  /** Mark a post as failed (generated but didn't make it to LinkedIn) */
  async markFailed(id: string) {
    if (isMock || !db) {
      updateMockPost(id, { status: "failed" });
      return;
    }
    return await updateDoc(doc(db, COLLECTION, id), {
      status: "failed",
      updated_at: serverTimestamp(),
    });
  },

  async updatePost(id: string, updates: Partial<Post>) {
    if (isMock || !db) { updateMockPost(id, updates); return; }
    return await updateDoc(doc(db, COLLECTION, id), stripUndefined({ ...updates, updated_at: serverTimestamp() }));
  },

  async deletePost(id: string) {
    if (isMock || !db) {
      localStorage.setItem("mock_posts", JSON.stringify(getMockPosts().filter((p) => p.id !== id)));
      return;
    }
    return await deleteDoc(doc(db, COLLECTION, id));
  },

  async getDrafts(userId: string): Promise<Post[]> {
    const all = await this.getAll(userId);
    return all.filter((p) => p.status === "draft");
  },

  async getScheduled(userId: string): Promise<Post[]> {
    const all = await this.getAll(userId);
    return all.filter((p) => p.status === "scheduled");
  },

  async getPublished(userId: string): Promise<Post[]> {
    const all = await this.getAll(userId);
    return all.filter((p) => p.status === "published");
  },

  async getAll(userId: string): Promise<Post[]> {
    if (isMock || !db) {
      return getMockPosts()
        .filter((p) => p.user_id === userId)
        .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
    }
    const snapshot = await getDocs(collection(db, COLLECTION));
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() } as Post))
      .filter((p) => p.user_id === userId)
      .sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
  },

  /** Schedule a post for future publishing */
  async createScheduled(
    post: Omit<Post, "id" | "created_at" | "status">,
    scheduledAt: Date,
    timezone: string,
    bestTimeApplied = false
  ): Promise<Post> {
    const payload = {
      ...post,
      status: "scheduled" as const,
      scheduled_at: { seconds: scheduledAt.getTime() / 1000 },
      schedule_timezone: timezone,
      best_time_applied: bestTimeApplied,
    };
    if (isMock || !db) return saveMockPost(payload);
    const ref = await addDoc(collection(db, COLLECTION), stripUndefined({
      ...payload,
      scheduled_at: scheduledAt,
      created_at: serverTimestamp(),
    }));
    return { ...payload, id: ref.id, created_at: { seconds: Date.now() / 1000 } };
  },

  /** Update the scheduled time on an existing post */
  async reschedulePost(id: string, scheduledAt: Date, timezone: string): Promise<void> {
    const updates = {
      scheduled_at: { seconds: scheduledAt.getTime() / 1000 },
      schedule_timezone: timezone,
      status: "scheduled" as const,
    };
    if (isMock || !db) { updateMockPost(id, updates); return; }
    await updateDoc(doc(db, COLLECTION, id), {
      scheduled_at: scheduledAt,
      schedule_timezone: timezone,
      status: "scheduled",
      updated_at: serverTimestamp(),
    });
  },

  /** Bulk-create multiple scheduled posts (from CSV upload) */
  async createBulkScheduled(
    posts: Array<Omit<Post, "id" | "created_at" | "status"> & { scheduled_at: Date; schedule_timezone: string }>
  ): Promise<{ created: Post[]; errors: Array<{ index: number; reason: string }> }> {
    const created: Post[] = [];
    const errors: Array<{ index: number; reason: string }> = [];
    for (let i = 0; i < posts.length; i++) {
      try {
        const { scheduled_at: sa, schedule_timezone: tz, ...rest } = posts[i];
        const p = await this.createScheduled(rest, sa, tz);
        created.push(p);
      } catch (e: any) {
        errors.push({ index: i, reason: e?.message || "Unknown error" });
      }
    }
    return { created, errors };
  },

  /** Get posts within a date range for the calendar view */
  async getByDateRange(
    userId: string,
    from: Date,
    to: Date,
    segment?: "individual" | "corporate"
  ): Promise<Post[]> {
    const all = await this.getAll(userId);
    return all.filter((p) => {
      if (segment && p.segment !== segment) return false;
      const ts = (p.scheduled_at?.seconds || p.published_at?.seconds || p.created_at?.seconds || 0) * 1000;
      return ts >= from.getTime() && ts <= to.getTime();
    });
  },

  /** Aggregated stats — optionally scoped to a segment */
  async getStats(userId: string, segment?: "individual" | "corporate") {
    const all = await this.getAll(userId);
    const scoped = segment ? all.filter((p) => p.segment === segment) : all;
    const published = scoped.filter((p) => p.status === "published");
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const lastWeek = published.filter((p) => {
      const ts = p.published_at?.seconds
        ? p.published_at.seconds * 1000
        : p.created_at?.seconds * 1000;
      return ts > oneWeekAgo;
    });

    return {
      total: scoped.length,
      published: published.length,
      drafts: scoped.filter((p) => p.status === "draft").length,
      scheduled: scoped.filter((p) => p.status === "scheduled").length,
      failed: scoped.filter((p) => p.status === "failed").length,
      lastWeek: lastWeek.length,
    };
  },
};
