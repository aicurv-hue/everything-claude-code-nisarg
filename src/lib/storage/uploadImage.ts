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
    const storage = getStorage(app);
    const name = fileName || `post-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const storageRef = ref(storage, name);

    // Extract content type from data URL
    const match = dataUrl.match(/^data:([^;]+);base64,/);
    const contentType = match?.[1] || "image/jpeg";

    const snapshot = await uploadString(storageRef, dataUrl, "data_url", { contentType });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (err: any) {
    console.error("[uploadImage] Firebase Storage upload failed:", err?.message || err);
    return null;
  }
}
