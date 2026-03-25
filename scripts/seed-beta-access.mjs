/**
 * Directly seeds beta_access collection in Firestore using Admin SDK.
 * Run once: node scripts/seed-beta-access.mjs
 *
 * Add more emails to the APPROVED array below.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!serviceAccountBase64) { console.error("FIREBASE_SERVICE_ACCOUNT_BASE64 not set"); process.exit(1); }

const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, "base64").toString("utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Add your approved beta emails here ───────────────────────────────────────
const APPROVED = [
  "nisarg2526@gmail.com",
  // "betauser1@example.com",
  // "betauser2@example.com",
];
// ─────────────────────────────────────────────────────────────────────────────

for (const email of APPROVED) {
  const key = email.toLowerCase().trim();
  await db.collection("beta_access").doc(key).set({
    approved: true,
    email: key,
    added_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✅ Added: ${key}`);
}

console.log("Done.");
process.exit(0);
