import { NextRequest, NextResponse } from "next/server";
import { submitImageJob, pollImageJob } from "@/lib/ai/image";
import { verifyTokenEdge } from "@/lib/utils/verifyTokenEdge";

// Edge — both submit and poll calls are short (<2s), so no timeout concerns.
export const runtime = "edge";

// POST: submit a new image job. Counts against quota immediately.
// Body: { prompt: string }
// Returns: { request_id }
export async function POST(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const checkRes = await fetch(new URL("/api/usage/check", req.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("authorization") || "",
    },
    body: JSON.stringify({ action: "image" }),
  });
  if (!checkRes.ok) return checkRes;

  try {
    const { prompt } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing image prompt." }, { status: 400 });
    }
    const requestId = await submitImageJob(prompt);
    return NextResponse.json({ request_id: requestId });
  } catch (error: any) {
    console.error("Image submit error:", error);
    return NextResponse.json({ error: error.message || "Image submit failed." }, { status: 500 });
  }
}

// GET: poll an existing job. ?id=<request_id>
// Returns: { status: "IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"|"FAILED", url?, error? }
export async function GET(req: NextRequest) {
  const uid = await verifyTokenEdge(req.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const s = await pollImageJob(id);
    return NextResponse.json(s);
  } catch (error: any) {
    return NextResponse.json({ status: "FAILED", error: error.message || "Poll failed." }, { status: 500 });
  }
}
