/**
 * Upload a local image (data: URL or File) to Firebase Storage.
 * Returns a public download URL usable by the scheduled post worker.
 */
import { getStorage, ref, uploadString, getDownloadURL, uploadBytes } from "firebase/storage";
import { app, isMock } from "@/lib/firebase";

/**
 * Upload a data: URL string to Firebase Storage.
 * Returns a public HTTPS URL, or null if upload fails.
 */
export async function uploadDataUrlToStorage(
  dataUrl: string,
  fileName?: string
): Promise<string | null> {
  if (isMock || !app || !dataUrl.startsWith("data:")) return null;

  try {
    const storage = getStorage(app as any);
    const name = fileName || `post-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const storageRef = ref(storage, name);

    // Convert data: URL to Blob for more reliable upload
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const snapshot = await uploadBytes(storageRef, blob, { contentType: blob.type || "image/jpeg" });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    console.log("[uploadImage] Uploaded to Firebase Storage:", downloadUrl);
    return downloadUrl;
  } catch (err: any) {
    console.error("[uploadImage] Firebase Storage upload failed:", err?.message || err);
    return null;
  }
}
