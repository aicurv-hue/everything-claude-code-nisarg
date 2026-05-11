import { NextRequest } from "next/server";
import { generatePost } from "@/lib/ai/generate";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

// Edge Runtime. Once the first byte is written, Vercel allows the connection
// to stay open up to 300s — so streaming keepalive pings make the 25s edge
// gateway timeout (HTTP 504) impossible to hit.
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const uid = await verifyTokenEdge(auth);
  if (!uid) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Pre-flight quota check (and increment). Done BEFORE opening the stream so
  // a quota failure returns a clean 4xx instead of a 200 with error frame.
  const checkRes = await fetch(new URL("/api/usage/check", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth || "" },
    body: JSON.stringify({ action: "post" }),
  });
  if (!checkRes.ok) return checkRes;

  const body = await req.json().catch(() => ({}));

  const refund = () => {
    // Fire-and-forget — user must not be billed for a failed/aborted gen.
    fetch(new URL("/api/usage/refund", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth || "" },
      body: JSON.stringify({ action: "post" }),
    }).catch(() => {});
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const write = (obj: Record<string, unknown>) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); }
        catch { /* controller already closed */ }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      // First byte immediately — defeats Vercel's 25s gateway timeout.
      write({ type: "start", ts: Date.now() });

      // Keepalive every 4s while the model thinks. Each ping is a single
      // JSON line the client ignores.
      const keepalive = setInterval(() => write({ type: "ping" }), 4000);

      // If the client disconnects mid-stream, abort + refund.
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        clearInterval(keepalive);
        refund();
        close();
      };
      req.signal.addEventListener("abort", onAbort);

      try {
        const result = await generatePost(body);
        if (aborted) return;
        write({ type: "result", post: result.post, imagePrompt: result.imagePrompt });
        write({ type: "done" });
      } catch (err: any) {
        if (!aborted) {
          const message =
            typeof err?.message === "string" && err.message.trim().length > 0
              ? err.message
              : "Generation failed";
          console.error("[api/ai/generate] Error:", message, err);
          refund();
          write({ type: "error", error: message });
        }
      } finally {
        clearInterval(keepalive);
        req.signal.removeEventListener("abort", onAbort);
        close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
