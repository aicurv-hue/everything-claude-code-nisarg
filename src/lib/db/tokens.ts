/**
 * LinkedIn token storage — persists access/refresh tokens so the
 * scheduled-post worker can post on behalf of the user without cookies.
 */
import { db, isMock } from "@/lib/firebase";
import {
  collection, doc, setDoc, getDoc, getDocs, serverTimestamp,
} from "firebase/firestore";

export interface LinkedInTokenRecord {
  user_id:             string;
  access_token:        string;
  refresh_token?:      string;
  user_sub:            string;
  user_name:           string;
  user_email:          string;
  user_picture:        string;
  expires_at:          number;   // unix ms
  refresh_expires_at?: number;   // unix ms
  updated_at:          any;
}

const COLLECTION  = "linkedin_tokens";
const MOCK_KEY    = "mock_linkedin_tokens";

function getMockTokens(): LinkedInTokenRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(MOCK_KEY) || "[]"); } catch { return []; }
}

export const tokenService = {

  /** Save (or overwrite) tokens for a user after OAuth callback */
  async save(record: Omit<LinkedInTokenRecord, "updated_at">): Promise<void> {
    if (isMock || !db) {
      const all = getMockTokens().filter(t => t.user_id !== record.user_id);
      try {
        localStorage.setItem(MOCK_KEY, JSON.stringify([{ ...record, updated_at: { seconds: Date.now() / 1000 } }, ...all]));
      } catch { /* non-critical */ }
      return;
    }
    await setDoc(doc(collection(db, COLLECTION), record.user_id), {
      ...record,
      updated_at: serverTimestamp(),
    });
  },

  /** Get tokens for a user — used by the scheduled post worker */
  async get(userId: string): Promise<LinkedInTokenRecord | null> {
    if (isMock || !db) {
      return getMockTokens().find(t => t.user_id === userId) || null;
    }
    const snap = await getDoc(doc(collection(db, COLLECTION), userId));
    return snap.exists() ? (snap.data() as LinkedInTokenRecord) : null;
  },

  /** Get all token records — worker iterates over all users with due posts */
  async getAll(): Promise<LinkedInTokenRecord[]> {
    if (isMock || !db) return getMockTokens();
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map(d => d.data() as LinkedInTokenRecord);
  },

  /** Update access token after a refresh */
  async updateAccessToken(userId: string, accessToken: string, expiresAt: number): Promise<void> {
    if (isMock || !db) {
      const all = getMockTokens().map(t =>
        t.user_id === userId ? { ...t, access_token: accessToken, expires_at: expiresAt } : t
      );
      try { localStorage.setItem(MOCK_KEY, JSON.stringify(all)); } catch { /* non-critical */ }
      return;
    }
    await setDoc(doc(collection(db, COLLECTION), userId), {
      access_token: accessToken,
      expires_at:   expiresAt,
      updated_at:   serverTimestamp(),
    }, { merge: true });
  },
};
