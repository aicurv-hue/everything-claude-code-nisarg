import { NextRequest, NextResponse } from "next/server";
import { generatePost } from "@/lib/ai/generate";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

// Edge Runtime — no timeout on Vercel Hobby plan (unlike serverless 10s limit)
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check and increment post generation quota (pre-flight to Node.js route)
  const checkRes = await fetch(new URL("/api/usage/check", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("authorization") || "",
    },
    body: JSON.stringify({ action: "post" }),
  });
  if (!checkRes.ok) return checkRes;

  try {
    const body = await req.json();
    const result = await generatePost(body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[api/ai/generate] Error:", err?.message || err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
