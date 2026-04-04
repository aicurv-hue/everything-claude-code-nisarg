/**
 * Upload a local image (data: URL or File) to Firebase Storage.
 * Returns a public download URL usable by the scheduled post worker.
 */
import { getStorage, ref, uploadString, getDownloadURL, uploadBytes } from "firebase/storage";
import { app, isMock } from "@/lib/firebase";

/**
 * Upload a profile headshot (data: URL) to Firebase Storage.
 * Stores at user-photos/{userId}/profile.jpg
 * Returns download URL or null on failure.
 */
export async function uploadProfilePhotoToStorage(
  dataUrl: string,
  userId: string
): Promise<string | null> {
  if (isMock || !app || !dataUrl.startsWith("data:")) return null;

  try {
    const storage = getStorage(app as any);
    const storageRef = ref(storage, `user-photos/${userId}/profile.jpg`);

    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const snapshot = await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    const downloadUrl = await getDownloadURL(snapshot.ref);
    console.log("[uploadProfilePhoto] Uploaded to Firebase Storage:", downloadUrl);
    return downloadUrl;
  } catch (err: any) {
    console.error("[uploadProfilePhoto] Firebase Storage upload failed:", err?.message || err);
    return null;
  }
}

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
