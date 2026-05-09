// Client-side helper for the submit+poll image generation flow.
// Centralizes the loop that previously lived in 4 places (preview page, carousel
// renderer, background-on-schedule, campaign drawer). Each HTTP hop is <2s; the
// 90s wait happens in the browser, where there's no platform timeout.

export interface GenerateImageOptions {
  prompt: string;
  token: string | null;
  // Total ms to keep polling before giving up. Default 90s.
  timeoutMs?: number;
  // Ms between polls. Default 2000.
  pollIntervalMs?: number;
}

export interface GenerateFaceOptions {
  backgroundStyle: string;
  postTopic?: string;
  token: string | null;
  // Total ms to keep polling before giving up. Default 120s (flux-pulid is slower than gpt-image-2).
  timeoutMs?: number;
  // Ms between polls. Default 3000.
  pollIntervalMs?: number;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Submit a fal.ai image job and poll until COMPLETED, FAILED, or timeout.
 * Returns the fal CDN URL on success. Throws on FAILED, timeout, or transport error.
 * Caller is responsible for any persistent-storage upload step.
 */
export async function generateImageClient(opts: GenerateImageOptions): Promise<string> {
  const { prompt, token, timeoutMs = 90_000, pollIntervalMs = 2000 } = opts;
  const auth = authHeaders(token);

  // Submit
  const submitRes = await fetch("/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ prompt }),
  });
  const submitRaw = await submitRes.text();
  let submitData: { request_id?: string; error?: string } = {};
  try { submitData = JSON.parse(submitRaw); } catch {
    throw new Error(submitRes.ok ? "Image service returned invalid response." : (submitRaw.slice(0, 200) || `HTTP ${submitRes.status}`));
  }
  if (!submitRes.ok) throw new Error(submitData.error || `Image submit failed (HTTP ${submitRes.status}).`);
  const reqId = submitData.request_id;
  if (!reqId) throw new Error("Missing request_id from image service.");

  // Poll
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollRes = await fetch(`/api/image/generate?id=${encodeURIComponent(reqId)}`, { headers: auth });
    const pollData = await pollRes.json().catch(() => ({}));
    if (pollData?.status === "COMPLETED" && pollData.url) return pollData.url as string;
    if (pollData?.status === "FAILED") throw new Error(pollData.error || "Image generation failed.");
  }
  throw new Error("Image generation timed out.");
}

/**
 * Submit a flux-pulid face-generation job and poll until COMPLETED, FAILED, or timeout.
 * Mirrors generateImageClient() but targets /api/image/face-generate (POST=submit, GET=poll).
 * Returns the fal CDN URL on success. Throws on FAILED, timeout, or transport error.
 */
export async function generateFaceClient(opts: GenerateFaceOptions): Promise<string> {
  const { backgroundStyle, postTopic = "", token, timeoutMs = 120_000, pollIntervalMs = 3000 } = opts;
  const auth = authHeaders(token);

  // Submit
  const submitRes = await fetch("/api/image/face-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth },
    body: JSON.stringify({ backgroundStyle, postTopic }),
  });
  const submitRaw = await submitRes.text();
  let submitData: { request_id?: string; error?: string } = {};
  try { submitData = JSON.parse(submitRaw); } catch {
    throw new Error(submitRes.ok ? "Face image service returned invalid response." : (submitRaw.slice(0, 200) || `HTTP ${submitRes.status}`));
  }
  if (!submitRes.ok) throw new Error(submitData.error || `Face image submit failed (HTTP ${submitRes.status}).`);
  const reqId = submitData.request_id;
  if (!reqId) throw new Error("Missing request_id from face image service.");

  // Poll
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollRes = await fetch(`/api/image/face-generate?id=${encodeURIComponent(reqId)}`, { headers: auth });
    const pollData = await pollRes.json().catch(() => ({}));
    if (pollData?.status === "COMPLETED" && pollData.url) return pollData.url as string;
    if (pollData?.status === "FAILED") throw new Error(pollData.error || "Face image generation failed.");
  }
  throw new Error("Face image generation timed out.");
}
