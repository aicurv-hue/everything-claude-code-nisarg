/**
 * Firebase Admin SDK — server-side only.
 *
 * Used by API routes that need to bypass Firestore security rules
 * (cron worker, engagement sync) and by the admin panel to manage all users.
 *
 * Credentials are read from FIREBASE_SERVICE_ACCOUNT_JSON env var.
 * In the Firebase Console: Project Settings → Service accounts → Generate new private key.
 * Paste the entire JSON as a single-line string in Vercel env vars.
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

function initAdmin() {
  if (getApps().length > 0) {
    adminApp   = getApps()[0];
    adminDb    = getFirestore(adminApp);
    adminAuth  = getAuth(adminApp);
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.warn("[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON not set — Admin SDK unavailable.");
    return;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    adminApp  = initializeApp({ credential: cert(serviceAccount) });
    adminDb   = getFirestore(adminApp);
    adminAuth = getAuth(adminApp);
  } catch (e) {
    console.error("[firebase-admin] Failed to initialise Admin SDK:", e);
  }
}

initAdmin();

export { adminDb, adminAuth };
