/**
 * Post Memory Layer
 *
 * Persistent, per-user, per-segment content memory.
 * Cortex reads this before generating to avoid repetition and build narrative progression.
 *
 * Storage: Firestore collection `post_memories` (+ localStorage mock fallback)
 * Design principle: summaries + keywords only — never full content — to minimise token cost.
 */

import { db, isMock } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PostMemory {
  id?: string;
  user_id: string;
  segment: "individual" | "corporate";
  post_id?: string;
  topic: string;
  audience: string;
  tone: string;
  /** 2-sentence max summary — what angle was taken, what was the core argument */
  summary: string;
  /** 5–10 keywords for relevance scoring — no stop-words, concrete nouns only */
  keywords: string[];
  /** Style fingerprint — captures HOW the user writes, not just what was covered */
  style_notes?: string;
  /**
   * How this memory was created:
   *   "auto"        — extracted automatically after a post went live via the tool
   *   "user_upload" — user manually pasted a post they wrote before using the tool
   *   "user_url"    — user submitted a LinkedIn post URL; content fetched via Jina Reader
   */
  source?: "auto" | "user_upload" | "user_url";
  /** Original post text — only stored for user_upload / user_url entries */
  raw_content?: string;
  /** Original URL — only stored for user_url entries */
  source_url?: string;
  /**
   * Hook type detected from the post's opening line — used to track hook variety
   * and suggest underused types in future generations.
   * Values: "stat" | "story" | "contrarian" | "question" | "observation"
   */
  hook_type?: string;
  created_at: any;
}

// ── Mock helpers (localStorage fallback) ───────────────────────────────────────

const MOCK_KEY = "mock_memories";

const getMockMemories = (): PostMemory[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MOCK_KEY) || "[]"); }
  catch { return []; }
};

const saveMockMemory = (memory: Omit<PostMemory, "id" | "created_at">): PostMemory => {
  const all = getMockMemories();
  const entry: PostMemory = {
    ...memory,
    id: Math.random().toString(36).substr(2, 9),
    created_at: { seconds: Date.now() / 1000 },
  };
  // Keep newest first, cap at 200 entries
  const updated = [entry, ...all].slice(0, 200);
  localStorage.setItem(MOCK_KEY, JSON.stringify(updated));
  return entry;
};

// ── Relevance scoring (zero AI tokens — pure JS) ──────────────────────────────

/**
 * Scores a memory entry against the current generation context.
 *
 * Scoring rules (backend-patterns skill — weighted signal approach):
 *   +2  per keyword that overlaps with topic words
 *   +1.5 if audience matches exactly
 *   +1  if tone matches
 *   -0.5 for each 30-day period older than 30 days (recency decay)
 */
function scoreMemory(
  memory: PostMemory,
  topic: string,
  audience: string,
  tone: string
): number {
  const topicWords = new Set(
    topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  let score = 0;

  // Keyword overlap
  for (const kw of memory.keywords) {
    const kwLower = kw.toLowerCase();
    if (topicWords.has(kwLower)) score += 2;
    // Partial match — topic words appear inside keyword phrase
    for (const tw of topicWords) {
      if (kwLower.includes(tw) || tw.includes(kwLower)) score += 0.5;
    }
  }

  // Audience match
  if (memory.audience?.toLowerCase() === audience?.toLowerCase()) score += 1.5;

  // Tone match
  if (memory.tone?.toLowerCase() === tone?.toLowerCase()) score += 1;

  // Recency decay — subtract 0.5 per 30-day period beyond the first 30 days
  const ageDays = memory.created_at?.seconds
    ? (Date.now() / 1000 - memory.created_at.seconds) / 86400
    : 0;
  if (ageDays > 30) score -= Math.floor(ageDays / 30) * 0.5;

  return score;
}

// ── Memory Service ─────────────────────────────────────────────────────────────

export const memoryService = {

  /** Delete a single memory entry by ID */
  async delete(id: string): Promise<void> {
    if (isMock || !db) {
      const filtered = getMockMemories().filter((m) => m.id !== id);
      localStorage.setItem(MOCK_KEY, JSON.stringify(filtered));
      return;
    }
    try {
      await deleteDoc(doc(db, "post_memories", id));
    } catch (err) {
      console.warn("[Memory] Failed to delete memory entry:", err);
    }
  },

  /**
   * Save a new memory entry after a post is generated.
   * Called fire-and-forget — failures are silent so generation is never blocked.
   */
  async save(memory: Omit<PostMemory, "id" | "created_at">): Promise<void> {
    try {
      if (isMock || !db) {
        saveMockMemory(memory);
        return;
      }
      await addDoc(collection(db, "post_memories"), {
        ...memory,
        created_at: serverTimestamp(),
      });
    } catch (err) {
      // Memory save failures must never crash the main generation flow
      console.warn("[Memory] Failed to save memory entry:", err);
    }
  },

  /**
   * Retrieve all memories for a user+segment, newest first, capped at 100.
   */
  async getAll(userId: string, segment: "individual" | "corporate"): Promise<PostMemory[]> {
    if (isMock || !db) {
      return getMockMemories()
        .filter((m) => m.user_id === userId && m.segment === segment)
        .slice(0, 100);
    }
    try {
      // Fetch recent 20 entries at DB level — enough for relevance scoring without over-reading
      const q = query(
        collection(db, "post_memories"),
        where("user_id", "==", userId),
        where("segment", "==", segment),
        orderBy("created_at", "desc"),
        limit(20)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() } as PostMemory));
    } catch (err) {
      console.warn("[Memory] Failed to load memories:", err);
      return [];
    }
  },

  /**
   * Retrieve the top-N most relevant memory entries for the current generation context.
   *
   * Algorithm (backend-patterns skill — relevance-first retrieval):
   *   1. Fetch all memories for user+segment (capped at 100)
   *   2. Score each entry against topic/audience/tone using JS scoring
   *   3. Sort by score descending
   *   4. If top scores are all zero (no relevant matches), fall back to 3 most recent
   *   5. Return top `limit` entries (default 5)
   */
  async getRelevant(
    userId: string,
    segment: "individual" | "corporate",
    topic: string,
    audience: string,
    tone: string,
    limit = 5
  ): Promise<PostMemory[]> {
    const all = await this.getAll(userId, segment);
    if (all.length === 0) return [];

    // Score and rank
    const scored = all
      .map((m) => ({ memory: m, score: scoreMemory(m, topic, audience, tone) }))
      .sort((a, b) => b.score - a.score);

    const topScore = scored[0]?.score ?? 0;

    // Fallback to 3 most recent if no relevant matches found
    if (topScore <= 0) {
      return all.slice(0, Math.min(3, limit));
    }

    return scored.slice(0, limit).map((s) => s.memory);
  },

  /**
   * Return aggregate stats for display on the memory dashboard.
   */
  async getStats(userId: string, segment: "individual" | "corporate") {
    const all = await this.getAll(userId, segment);
    const allKeywords = all.flatMap((m) => m.keywords);
    const keywordFreq: Record<string, number> = {};
    for (const kw of allKeywords) {
      keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
    }
    const topKeywords = Object.entries(keywordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([kw, count]) => ({ kw, count }));

    const toneBreakdown: Record<string, number> = {};
    for (const m of all) {
      toneBreakdown[m.tone] = (toneBreakdown[m.tone] || 0) + 1;
    }

    const uniqueTopics = [...new Set(all.map((m) => m.topic))];

    return {
      totalMemories: all.length,
      uniqueTopics: uniqueTopics.length,
      topKeywords,
      toneBreakdown,
      oldest: all[all.length - 1]?.created_at?.seconds
        ? new Date(all[all.length - 1].created_at.seconds * 1000)
        : null,
      newest: all[0]?.created_at?.seconds
        ? new Date(all[0].created_at.seconds * 1000)
        : null,
    };
  },
};
