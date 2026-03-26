/**
 * getAuthToken — safely resolves a Firebase ID token even when Auth
 * hasn't hydrated yet (race condition on first page load).
 *
 * Returns null if user is not signed in or Firebase is in mock mode.
 */
import type { User } from "firebase/auth";

export async function getAuthToken(): Promise<string | null> {
  try {
    const { auth: firebaseAuth, isMock } = await import("@/lib/firebase");
    if (isMock || !firebaseAuth) return null;

    // If currentUser is already set, get token immediately
    if (firebaseAuth.currentUser) {
      return await firebaseAuth.currentUser.getIdToken();
    }

    // Auth hasn't hydrated yet — wait for the first onAuthStateChanged event
    const user = await new Promise<User | null>((resolve) => {
      const unsub = firebaseAuth.onAuthStateChanged((u) => {
        unsub();
        resolve(u);
      });
    });

    return user ? await user.getIdToken() : null;
  } catch {
    return null;
  }
}
