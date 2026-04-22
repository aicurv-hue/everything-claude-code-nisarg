"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { auth, db, isMock } from "@/lib/firebase";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const THROTTLE_MS = 60_000; // only reset timer once per minute

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  logOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isMock) {
      // In mock mode (no Firebase env vars) skip auth entirely
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // ── Idle timeout: auto-logout after 30 min of inactivity ──
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivity = useRef(Date.now());

  const resetIdleTimer = useCallback(() => {
    const now = Date.now();
    if (now - lastActivity.current < THROTTLE_MS) return;
    lastActivity.current = now;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      signOut(auth);
    }, IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer(); // start initial timer
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [user, resetIdleTimer]);

  // ── Single-session enforcement ──
  useEffect(() => {
    if (!user || isMock || !db) return;
    const unsub = onSnapshot(doc(db, "sessions", user.uid), (snap) => {
      const data = snap.data();
      const localId = localStorage.getItem("cridl_session_id");
      if (data?.sessionId && localId && data.sessionId !== localId) {
        signOut(auth);
        alert("You've been logged in from another device.");
      }
    });
    return unsub;
  }, [user]);

  async function writeSession(uid: string) {
    if (!db) return;
    const sessionId = crypto.randomUUID();
    // Write to localStorage first so the onSnapshot listener always sees a
    // matching sessionId — even if it fires before the Firestore write resolves.
    localStorage.setItem("cridl_session_id", sessionId);
    await setDoc(doc(db, "sessions", uid), { sessionId, lastLogin: serverTimestamp() });
  }

  async function signIn(email: string, password: string) {
    // Pre-mint and store the sessionId in localStorage BEFORE Firebase auth
    // completes, so the onSnapshot single-session listener never sees a mismatch
    // during the brief window between onAuthStateChanged and writeSession.
    const sessionId = crypto.randomUUID();
    localStorage.setItem("cridl_session_id", sessionId);
    const { user: u } = await signInWithEmailAndPassword(auth, email, password);
    // Fire-and-forget: the onSnapshot listener enforces single-session; no need
    // to block login on this Firestore write (cold client init can take seconds).
    if (db) {
      setDoc(doc(db, "sessions", u.uid), { sessionId, lastLogin: serverTimestamp() }).catch(
        (e) => console.warn("session write failed", e)
      );
    }
  }

  async function signUp(email: string, password: string, displayName: string) {
    const sessionId = crypto.randomUUID();
    localStorage.setItem("cridl_session_id", sessionId);
    const { user: newUser } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(newUser, { displayName });
    if (db) {
      // Fire-and-forget (see signIn).
      setDoc(doc(db, "sessions", newUser.uid), { sessionId, lastLogin: serverTimestamp() }).catch(
        (e) => console.warn("session write failed", e)
      );
    }
  }

  async function logOut() {
    await signOut(auth);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, logOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
