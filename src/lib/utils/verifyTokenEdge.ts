/**
 * Lightweight Firebase ID token verifier for Edge Runtime.
 * Uses the Firebase Auth REST API — no firebase-admin SDK required.
 * Returns the Firebase UID on success, or null on failure.
 */
export async function verifyTokenEdge(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const idToken = authHeader.slice(7).trim();
  if (!idToken) return null;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const uid = data?.users?.[0]?.localId;
    return uid || null;
  } catch {
    return null;
  }
}
