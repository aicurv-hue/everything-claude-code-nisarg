import { adminDb } from "../firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface VoiceDNA {
  user_id: string;
  segment: "individual" | "corporate";
  sentenceRhythm: string;
  vocabularyRegister: string;
  hookPreference: string;
  ctaStyle: string;
  emojiUsage: string;
  formattingHabits: string;
  consistencyScore: number;
  dominantPatterns: string[];
  postsAnalysed: number;
  lastBuiltAt?: FirebaseFirestore.Timestamp;
  version: number;
  previousConsistencyScore?: number;
  previousDominantPatterns?: string[];
}

function docId(userId: string, segment: string) {
  return `${userId}_${segment}`;
}

export const voiceDNAService = {
  async get(userId: string, segment: string): Promise<VoiceDNA | null> {
    const snap = await adminDb.collection("voice_dna").doc(docId(userId, segment)).get();
    if (!snap.exists) return null;
    return snap.data() as VoiceDNA;
  },

  async save(dna: VoiceDNA): Promise<void> {
    await adminDb.collection("voice_dna").doc(docId(dna.user_id, dna.segment)).set({
      ...dna,
      lastBuiltAt: FieldValue.serverTimestamp(),
    });
  },
};
