export interface ImageResult {
  url: string;
  prompt: string;
}

const MODEL_SLUG = "fal-ai/gpt-image-2";
const QUEUE_BASE = "https://queue.fal.run";

export async function submitImageJob(prompt: string): Promise<string> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY is not set in environment variables.");

  const res = await fetch(`${QUEUE_BASE}/${MODEL_SLUG}`, {
    method: "POST",
    headers: { "Authorization": `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",
      quality: "medium",
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`fal.ai submit ${res.status}: ${err.slice(0, 300)}`);
  }
  const j = (await res.json()) as { request_id?: string };
  if (!j.request_id) throw new Error("fal.ai did not return a request_id.");
  return j.request_id;
}

export type ImageJobStatus =
  | { status: "IN_QUEUE" | "IN_PROGRESS" }
  | { status: "COMPLETED"; url: string }
  | { status: "FAILED"; error: string };

export async function pollImageJob(requestId: string): Promise<ImageJobStatus> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY is not set in environment variables.");

  const s = await fetch(`${QUEUE_BASE}/${MODEL_SLUG}/requests/${requestId}/status`, {
    headers: { "Authorization": `Key ${apiKey}` },
  });
  if (!s.ok) {
    const err = await s.text();
    return { status: "FAILED", error: `status ${s.status}: ${err.slice(0, 200)}` };
  }
  const sj = (await s.json()) as { status?: string };

  if (sj.status === "COMPLETED") {
    const r = await fetch(`${QUEUE_BASE}/${MODEL_SLUG}/requests/${requestId}`, {
      headers: { "Authorization": `Key ${apiKey}` },
    });
    if (!r.ok) {
      const err = await r.text();
      return { status: "FAILED", error: `result ${r.status}: ${err.slice(0, 200)}` };
    }
    const data = await r.json();
    const imageUrl = data?.images?.[0]?.url;
    if (!imageUrl) return { status: "FAILED", error: "No image URL in fal.ai result." };
    return { status: "COMPLETED", url: imageUrl };
  }

  if (sj.status === "FAILED" || sj.status === "ERROR") {
    return { status: "FAILED", error: `fal.ai job ${sj.status.toLowerCase()}.` };
  }

  return { status: (sj.status as "IN_QUEUE" | "IN_PROGRESS") || "IN_PROGRESS" };
}

// Backwards-compat: synchronous wrapper used by carousel renderer + campaigns.
// Polls server-side; only safe on Node runtime with maxDuration ≥ 90s.
export async function generateImageFromPrompt(prompt: string): Promise<ImageResult> {
  const requestId = await submitImageJob(prompt);
  const deadline = Date.now() + 85_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const s = await pollImageJob(requestId);
    if (s.status === "COMPLETED") return { url: s.url, prompt };
    if (s.status === "FAILED") throw new Error(s.error);
  }
  throw new Error("fal.ai gpt-image-2 timed out after 85s.");
}
