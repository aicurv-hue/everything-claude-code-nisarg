export interface ImageResult {
  url: string;
  prompt: string;
}

export async function generateImageFromPrompt(prompt: string): Promise<ImageResult> {
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY is not set in environment variables.");

  const response = await fetch("https://fal.run/openai/gpt-image-2", {
    method: "POST",
    headers: {
      "Authorization": `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd",
      quality: "medium",
      num_images: 1,
      output_format: "png",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`fal.ai gpt-image-2 error: ${response.status} — ${err}`);
  }

  const data = await response.json();
  const imageUrl = data?.images?.[0]?.url;

  if (!imageUrl) throw new Error("fal.ai gpt-image-2 returned no image URL.");

  return { url: imageUrl, prompt };
}
