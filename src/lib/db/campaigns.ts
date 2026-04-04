import { db, isMock } from "@/lib/firebase";
import {
  collection, addDoc, getDoc, getDocs, doc,
  query, where, orderBy, updateDoc, deleteDoc,
  serverTimestamp, writeBatch
} from "firebase/firestore";

export interface Campaign {
  id?: string;
  user_id: string;
  segment: "individual" | "corporate";
  name: string;
  topic: string;
  audience: string;
  tone: string;
  length: "short" | "medium" | "long";
  post_count: number;
  frequency_days: number;
  start_date?: any;
  timezone?: string;
  status: "draft" | "active" | "paused" | "completed";
  organization_id?: string;
  custom_instructions?: string;
  created_at?: any;
  updated_at?: any;
}

const COLLECTION = "campaigns";

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export const campaignService = {
  async create(data: Omit<Campaign, "id" | "created_at" | "updated_at">): Promise<string> {
    if (isMock || !db) {
      const id = `mock-campaign-${Date.now()}`;
      const campaigns = JSON.parse(localStorage.getItem("campaigns") || "[]");
      campaigns.unshift({ ...data, id, created_at: new Date().toISOString() });
      localStorage.setItem("campaigns", JSON.stringify(campaigns));
      return id;
    }
    const ref = await addDoc(collection(db, COLLECTION), {
      ...stripUndefined(data),
      status: data.status || "draft",
      created_at: serverTimestamp(),
    });
    return ref.id;
  },

  async get(id: string, userId: string): Promise<Campaign | null> {
    if (isMock || !db) {
      const campaigns = JSON.parse(localStorage.getItem("campaigns") || "[]");
      return campaigns.find((c: Campaign) => c.id === id && c.user_id === userId) || null;
    }
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    const data = snap.data() as Campaign;
    if (data.user_id !== userId) return null;
    return { ...data, id: snap.id };
  },

  async list(userId: string, segment: string): Promise<Campaign[]> {
    if (isMock || !db) {
      const campaigns = JSON.parse(localStorage.getItem("campaigns") || "[]");
      return campaigns.filter((c: Campaign) => c.user_id === userId && c.segment === segment);
    }
    const q = query(
      collection(db, COLLECTION),
      where("user_id", "==", userId),
      where("segment", "==", segment),
      orderBy("created_at", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ ...d.data(), id: d.id } as Campaign));
  },

  async update(id: string, userId: string, patch: Partial<Campaign>): Promise<void> {
    if (isMock || !db) {
      const campaigns = JSON.parse(localStorage.getItem("campaigns") || "[]");
      const idx = campaigns.findIndex((c: Campaign) => c.id === id && c.user_id === userId);
      if (idx !== -1) campaigns[idx] = { ...campaigns[idx], ...patch };
      localStorage.setItem("campaigns", JSON.stringify(campaigns));
      return;
    }
    await updateDoc(doc(db, COLLECTION, id), { ...stripUndefined(patch), updated_at: serverTimestamp() });
  },

  async delete(id: string, userId: string): Promise<void> {
    if (isMock || !db) {
      const campaigns = JSON.parse(localStorage.getItem("campaigns") || "[]");
      localStorage.setItem("campaigns", JSON.stringify(campaigns.filter((c: Campaign) => !(c.id === id && c.user_id === userId))));
      return;
    }
    await deleteDoc(doc(db, COLLECTION, id));
    const postsSnap = await getDocs(query(collection(db, "posts"), where("campaign_id", "==", id)));
    if (postsSnap.docs.length > 0) {
      const batch = writeBatch(db);
      postsSnap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  },
};
