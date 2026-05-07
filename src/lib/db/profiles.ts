import { db, isMock } from "@/lib/firebase";
import { 
  setDoc, 
  getDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";

export interface ProfileSegment {
  // Identity
  name?: string;
  roleOrIndustry?: string;
  bioOrOffering?: string;
  niche?: string;

  // Strategy
  icp?: string;
  companyStage?: string;
  jtbd?: string;

  // Branding
  pillars?: string;
  personality?: string;
  usp?: string;

  // Voice
  customerPains?: string;
  verbatimLanguage?: string;
  wordsToAvoid?: string;

  // AI Config
  model?: string;
  systemPrompt?: string;

  // LinkedIn (corporate only)
  linkedinOrganizationId?: string;
}

export interface UserProfile {
  lastActiveSegment: "individual" | "corporate";
  individual: ProfileSegment;
  corporate: ProfileSegment;
  profilePhotoUrl?: string;
  profilePhotoHasFace?: boolean;
}

const COLLECTION_NAME = "profiles";

export const profileService = {
  async saveProfile(userId: string, profile: UserProfile) {
    if (isMock || !db) {
      // In mock mode: use sessionStorage only (cleared on tab close, not persisted cross-session)
      // Never use localStorage — brand strategy data must not persist to XSS payloads across sessions
      try { sessionStorage.setItem("user_profiles_session", JSON.stringify(profile)); } catch {}
      return;
    }
    const profileRef = doc(db, COLLECTION_NAME, userId);
    return await setDoc(profileRef, {
      ...profile,
      updated_at: serverTimestamp(),
    }, { merge: true });
  },

  async getProfile(userId: string): Promise<UserProfile | null> {
    if (isMock || !db) {
      // Session-scoped fallback only — no localStorage read (security: brand data must not be XSS-accessible)
      const saved = sessionStorage.getItem("user_profiles_session");
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
      return null;
    }
    const profileRef = doc(db, COLLECTION_NAME, userId);
    const snapshot = await getDoc(profileRef);
    if (snapshot.exists()) {
      return snapshot.data() as UserProfile;
    }
    return null;
  }
};
