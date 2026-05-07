import { NextRequest, NextResponse } from "next/server";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";
import { rewriteInVoice } from "@/lib/ai/rewriteInVoice";

// Edge runtime — uses OpenRouter; mirrors /api/posts/score and /api/ai/generate.
export const runtime = "edge";

type RewriteResult = {
  rewrittenPost: string;
  score: number;
  changes: string[];
};

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const uid = await verifyTokenEdge(authHeader);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pre-flight usage gate (rewrite counts as 1 post usage, like generate/regenerate)
  const checkRes = await fetch(new URL("/api/usage/check", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader || "",
    },
    body: JSON.stringify({ action: "post" }),
  });
  if (!checkRes.ok) return checkRes;

  try {
    const { rawText, voiceProfile, writingSamples } = await req.json();
    if (!rawText || typeof rawText !== "string" || rawText.trim().length < 5) {
      return NextResponse.json({ error: "rawText required" }, { status: 400 });
    }

    const { rewrittenPost, changes } = await rewriteInVoice({
      rawText,
      voiceProfile,
      writingSamples,
    });

    // Internal score call — propagate Authorization
    let score = 0;
    try {
      const scoreRes = await fetch(new URL("/api/posts/score", req.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader || "",
        },
        body: JSON.stringify({ postText: rewrittenPost, voiceProfile, writingSamples }),
      });
      if (scoreRes.ok) {
        const scoreData = await scoreRes.json();
        if (typeof scoreData?.score === "number") score = scoreData.score;
      }
    } catch (err: any) {
      console.error("[api/posts/rewrite] Score call failed:", err?.message || err);
    }

    const result: RewriteResult = { rewrittenPost, score, changes };
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/posts/rewrite]", err?.message || err);
    // Safe fallback — do not 500
    const body = await req.clone().json().catch(() => ({}));
    return NextResponse.json({ rewrittenPost: body?.rawText || "", score: 0, changes: [] });
  }
}
