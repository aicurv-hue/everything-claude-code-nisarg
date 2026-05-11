/**
 * Consume an NDJSON streaming Response (one JSON object per `\n`-terminated line).
 *
 * Used by /api/ai/generate, which streams keepalive pings while the model
 * runs so Vercel's 25s edge gateway timeout never fires. Returns the final
 * `{ type: "result", ... }` frame's payload, or throws on `{ type: "error" }`.
 */
export async function consumeGenerateStream(res: Response): Promise<{ post: string; imagePrompt: string }> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  if (!res.body) throw new Error("Streaming response has no body");

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { post: string; imagePrompt: string } | null = null;
  let lastError: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      let frame: any;
      try { frame = JSON.parse(line); } catch { continue; }

      if (frame?.type === "result") {
        result = { post: frame.post ?? "", imagePrompt: frame.imagePrompt ?? "" };
      } else if (frame?.type === "error") {
        lastError = frame.error || "Generation failed";
      }
      // "start", "ping", "done" — no-op
    }
  }

  if (lastError) throw new Error(lastError);
  if (!result)   throw new Error("Generation stream ended without a result");
  return result;
}
