export interface ImageResult {
  url: string;
  prompt: string;
}

/**
 * Calls fal.ai nano-banana (text-to-image) with the given prompt.
 * Returns the image URL.
 */
export async function generateImageFromPrompt(prompt: string): Promise<ImageResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY is not set in environment variables.");

  const response = await fetch("https://fal.run/fal-ai/nano-banana", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",   // 1024×1024 — fills full width on mobile LinkedIn feed
      num_inference_steps: 28,
      guidance_scale: 7.5,
      num_images: 1,
      enable_safety_checker: true,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`fal.ai error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const imageUrl = data?.images?.[0]?.url;

  if (!imageUrl) throw new Error("fal.ai returned no image URL.");

  return { url: imageUrl, prompt };
}
