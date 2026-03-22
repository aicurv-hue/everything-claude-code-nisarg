import { db, isMock } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp } from "firebase/firestore";

export interface TimeSuggestion {
  slot: string;         // ISO 8601 datetime
  day_of_week: string;
  time_label: string;
  score: number;        // 0–100
  reasoning: string;
}

export interface ScheduleSuggestion {
  id?: string;
  user_id: string;
  segment: "individual" | "corporate";
  generated_at: any;
  expires_at: any;
  suggestions: TimeSuggestion[];
  posts_analyzed: number;
}

const COLLECTION = "schedule_suggestions";
const MOCK_KEY   = "mock_schedule_suggestions";
const TTL_MS     = 7 * 24 * 60 * 60 * 1000; // 7 days

const getMock = (): ScheduleSuggestion[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MOCK_KEY) || "[]"); } catch { return []; }
};

export const suggestionService = {
  async getValid(userId: string, segment: "individual" | "corporate"): Promise<ScheduleSuggestion | null> {
    const now = Date.now();
    if (isMock || !db) {
      const all = getMock();
      return all.find((s) => s.user_id === userId && s.segment === segment && (s.expires_at?.seconds || 0) * 1000 > now) || null;
    }
    const snap = await getDocs(collection(db, COLLECTION));
    const found = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as ScheduleSuggestion))
      .find((s) => s.user_id === userId && s.segment === segment && (s.expires_at?.seconds || 0) * 1000 > now);
    return found || null;
  },

  async save(suggestion: Omit<ScheduleSuggestion, "id" | "generated_at" | "expires_at">): Promise<void> {
    const now = Date.now();
    const payload: ScheduleSuggestion = {
      ...suggestion,
      generated_at: { seconds: now / 1000 },
      expires_at: { seconds: (now + TTL_MS) / 1000 },
    };
    if (isMock || !db) {
      const all = getMock().filter((s) => !(s.user_id === suggestion.user_id && s.segment === suggestion.segment));
      localStorage.setItem(MOCK_KEY, JSON.stringify([payload, ...all]));
      return;
    }
    await addDoc(collection(db, COLLECTION), {
      ...suggestion,
      generated_at: serverTimestamp(),
      expires_at: new Date(now + TTL_MS),
    });
  },

  async invalidate(userId: string, segment: "individual" | "corporate"): Promise<void> {
    if (isMock || !db) {
      const filtered = getMock().filter((s) => !(s.user_id === userId && s.segment === segment));
      localStorage.setItem(MOCK_KEY, JSON.stringify(filtered));
      return;
    }
    const snap = await getDocs(collection(db, COLLECTION));
    for (const d of snap.docs) {
      const data = d.data() as ScheduleSuggestion;
      if (data.user_id === userId && data.segment === segment) await deleteDoc(doc(db, COLLECTION, d.id));
    }
  },
};
