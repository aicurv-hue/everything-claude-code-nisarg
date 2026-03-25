import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported, Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Mock mode only when env vars are genuinely absent (local dev without .env.local)
export const isMock = !process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY === "mock-api-key";

let app: FirebaseApp;
let analytics: Analytics | null = null;

try {
  if (!isMock) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    if (typeof window !== "undefined") {
      isSupported().then(yes => {
        if (yes) analytics = getAnalytics(app);
      });
    }
  } else {
    console.warn("Firebase: Using mock mode (no env vars). Set NEXT_PUBLIC_FIREBASE_* to use real Firebase.");
    app = { name: "[DEFAULT]-mock", options: {}, automaticDataCollectionEnabled: false } as any;
  }
} catch (e) {
  console.error("Firebase init error:", e);
  app = { name: "[DEFAULT]-error", options: {}, automaticDataCollectionEnabled: false } as any;
}

// Real Firebase Auth instance — no mock fallback.
// Components use AuthContext (src/lib/context/auth.tsx) to get the current user.
export const auth: Auth = !isMock ? getAuth(app as any) : null as any;
export const db = !isMock ? getFirestore(app as any) : null;
export { app, analytics };
