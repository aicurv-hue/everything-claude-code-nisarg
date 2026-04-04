import { db, isMock } from "@/lib/firebase";
import { 
  setDoc, 
  getDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";

export type ImageStyle = "photo" | "illustration" | "abstract" | "3d" | "lineart" | "bw_photo";

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

  // Image Style (Layer 1 — saved per segment)
  imageStyle?: ImageStyle;

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
      localStorage.setItem("user_profiles", JSON.stringify(profile));
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
      const saved = localStorage.getItem("user_profiles");
      if (saved) return JSON.parse(saved);
      
      // Migration from old single profile
      const old = localStorage.getItem("client_profile");
      if (old) {
        const parsed = JSON.parse(old);
        return {
          lastActiveSegment: parsed.profileType || "individual",
          individual: parsed.profileType === "individual" ? parsed : {},
          corporate: parsed.profileType === "corporate" ? parsed : {}
        } as UserProfile;
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
