/**
 * Research result caching — Firestore-backed, 24-hour TTL.
 *
 * Before calling the AI research API, check if we have a fresh result
 * for the same (userId, topic, audience) combination. This eliminates
 * redundant AI calls for repeated topics (common in campaign workflows).
 *
 * Cache key: SHA-256 hash of "userId|topic|audience"
 * Storage: Firestore collection `research_cache/{hash}`
 * TTL: 24 hours
 */

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const COLLECTION = "research_cache";

/** Generate a simple hash key from userId + topic + audience */
async function cacheKey(userId: string, topic: string, audience: string): Promise<string> {
  const input = `${userId}|${topic.toLowerCase().trim()}|${audience.toLowerCase().trim()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  // Use Web Crypto API — available in both Edge and Node runtimes
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Look up a cached research result.
 * Returns the result if fresh (< 24h), or null if missing/stale.
 * Works with Firebase Admin SDK (server-side only).
 */
export async function getCachedResearch(
  adminDb: FirebaseFirestore.Firestore,
  userId: string,
  topic: string,
  audience: string
): Promise<any | null> {
  try {
    const key = await cacheKey(userId, topic, audience);
    const snap = await adminDb.collection(COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    const cachedAt: number = data.cached_at || 0;
    if (Date.now() - cachedAt > TTL_MS) return null; // stale
    return data.result ?? null;
  } catch {
    return null; // cache miss on any error — fall through to AI call
  }
}

/**
 * Store a research result in the cache.
 * Fire-and-forget — never blocks the response.
 */
export function setCachedResearch(
  adminDb: FirebaseFirestore.Firestore,
  userId: string,
  topic: string,
  audience: string,
  result: any
): void {
  cacheKey(userId, topic, audience).then((key) => {
    adminDb.collection(COLLECTION).doc(key).set({
      cached_at: Date.now(),
      user_id: userId,
      topic,
      audience,
      result,
    }).catch(() => {}); // silent failure — cache write is best-effort
  }).catch(() => {});
}
