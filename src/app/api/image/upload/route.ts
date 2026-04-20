import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

/**
 * POST /api/image/upload
 * Accepts FormData with a "file" field (binary image upload).
 * Uploads to Firebase Storage server-side and returns permanent URL.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await adminAuth.verifyIdToken(token);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || "image/jpeg";

    const bucketName =
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET;

    const bucket = getStorage(getApps()[0]).bucket(bucketName);
    const ext = contentType.includes("png") ? "png" : "jpg";
    const name = `post-images/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bucketFile = bucket.file(name);

    await bucketFile.save(buffer, { metadata: { contentType } });
    await bucketFile.makePublic();

    const permanentUrl = `https://storage.googleapis.com/${bucketName}/${name}`;
    return NextResponse.json({ url: permanentUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/image/upload] error:", message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
