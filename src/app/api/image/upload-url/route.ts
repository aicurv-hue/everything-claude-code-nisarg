import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await adminAuth.verifyIdToken(token);

    const { url, fileName } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    const imageRes = await fetch(url);
    if (!imageRes.ok) {
      return NextResponse.json({ error: "Failed to fetch remote image" }, { status: 502 });
    }
    const buffer = Buffer.from(await imageRes.arrayBuffer());
    const contentType = imageRes.headers.get("content-type") || "image/jpeg";

    const bucketName =
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET;

    const bucket = getStorage(getApps()[0]).bucket(bucketName);
    const name =
      fileName ||
      `post-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const file = bucket.file(name);

    await file.save(buffer, { metadata: { contentType } });
    await file.makePublic();

    const permanentUrl = `https://storage.googleapis.com/${bucketName}/${name}`;
    return NextResponse.json({ url: permanentUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-url] error:", message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
