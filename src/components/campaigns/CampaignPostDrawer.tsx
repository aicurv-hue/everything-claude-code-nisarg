"use client";
import React, { useEffect, useRef, useState } from "react";
import { X, Sparkles, Upload, User, ImageIcon, Loader2, AlertCircle } from "lucide-react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { uploadDataUrlToStorage } from "@/lib/storage/uploadImage";
import { generateImageClient, generateFaceClient } from "@/lib/ai/clientImage";

interface PostData {
  id: string;
  campaign_position: number;
  status: string;
  content: string;
  image_url?: string;
  image_mode?: string;
  image_prompt?: string;
  image_hook?: string;
}

interface Props {
  post: PostData | null;
  segment: "individual" | "corporate";
  onClose: () => void;
  onSaved: (postId: string, updates: Record<string, any>) => void;
}

type ImageMode = "none" | "ai" | "upload" | "face";
type FaceStyle = "professional" | "casual" | "minimal" | "creative";

export default function CampaignPostDrawer({ post, segment, onClose, onSaved }: Props) {
  const [content, setContent] = useState("");
  const [imageMode, setImageMode] = useState<ImageMode>("none");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageHook, setImageHook] = useState("");
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [faceStyle, setFaceStyle] = useState<FaceStyle>("professional");
  const [faceGeneratedUrl, setFaceGeneratedUrl] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isFaceGenerating, setIsFaceGenerating] = useState(false);
  const [isGeneratingHook, setIsGeneratingHook] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialise state from post prop
  useEffect(() => {
    if (!post) return;
    setContent(post.content || "");
    setImageMode((post.image_mode as ImageMode) || "none");
    setImagePrompt(post.image_prompt || "");
    setImageUrl(post.image_url || null);
    setImageHook(post.image_hook || "");
    setUploadedPreview(null);
    setFaceGeneratedUrl(null);
    setSaveError(null);
    setImageError(null);
  }, [post]);

  // Fetch profile photo on mount
  useEffect(() => {
    getAuthToken().then(async (token) => {
      if (!token) return;
      try {
        const res = await fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        // Profile photo is stored under the segment key or at top level
        const segData = data?.[segment] ?? data?.individual ?? data;
        if (segData?.profilePhotoUrl) setProfilePhotoUrl(segData.profilePhotoUrl);
      } catch { /* silent */ }
    });
  }, []);

  if (!post) return null;

  const handleModeChange = (mode: ImageMode) => {
    setImageMode(mode);
    setImageError(null);
    if (mode !== "ai") { setImageUrl(null); }
    if (mode !== "upload") { setUploadedPreview(null); }
    if (mode !== "face") { setFaceGeneratedUrl(null); }
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return;
    setIsGeneratingImage(true);
    setImageError(null);
    setImageUrl(null);
    try {
      const token = await getAuthToken();
      const url = await generateImageClient({ prompt: imagePrompt, token });
      setImageUrl(url);
    } catch (err: any) {
      setImageError(err.message || "Failed to generate image.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateHook = async () => {
    if (!content || isGeneratingHook) return;
    setIsGeneratingHook(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/ai/image-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ post: content, topic: "" }),
      });
      const data = await res.json();
      if (res.ok && data.hook) setImageHook(data.hook);
    } finally {
      setIsGeneratingHook(false);
    }
  };

  const handleGenerateFace = async () => {
    if (!profilePhotoUrl || isFaceGenerating) return;
    setIsFaceGenerating(true);
    setImageError(null);
    setFaceGeneratedUrl(null);
    try {
      const token = await getAuthToken();
      const url = await generateFaceClient({ backgroundStyle: faceStyle, postTopic: "", token });
      setFaceGeneratedUrl(url);
    } catch (err: any) {
      setImageError(err.message || "Failed to generate face image");
    } finally {
      setIsFaceGenerating(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploadedPreview(dataUrl);
      // Upload to Firebase Storage
      const httpsUrl = await uploadDataUrlToStorage(dataUrl, `post-images/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
      if (httpsUrl) setImageUrl(httpsUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!post) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const finalImageUrl =
        imageMode === "ai" ? imageUrl :
        imageMode === "face" ? faceGeneratedUrl :
        imageMode === "upload" ? (imageUrl || uploadedPreview) :
        null;

      const updates: Record<string, any> = {
        content,
        image_url: finalImageUrl,
        image_mode: imageMode,
        image_hook: imageHook,
        image_prompt: imagePrompt,
      };

      const token = await getAuthToken();
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: post.id, ...updates }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      onSaved(post.id, updates);
    } catch (err: any) {
      setSaveError(err.message || "Save failed. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const modeButtons: { mode: ImageMode; label: string; icon: React.ReactNode }[] = [
    { mode: "none", label: "No Image", icon: <X className="w-3.5 h-3.5" /> },
    { mode: "ai", label: "AI Image", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { mode: "face", label: "My Face", icon: <User className="w-3.5 h-3.5" /> },
    { mode: "upload", label: "Upload", icon: <Upload className="w-3.5 h-3.5" /> },
  ];

  const faceStyles: FaceStyle[] = ["professional", "casual", "minimal", "creative"];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-[var(--card)] shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">Post {post.campaign_position}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 capitalize">{post.status}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--toggle-bg)] text-[var(--text-muted)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Content editor */}
          <div>
            <label className="text-xs font-medium text-[var(--foreground)] mb-1.5 block">Post Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full text-sm text-[var(--foreground)] border border-[var(--border)] rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30 focus:border-[#0A66C2] leading-relaxed"
            />
          </div>

          {/* Image section */}
          <div>
            <label className="text-xs font-medium text-[var(--foreground)] mb-2 block">Image</label>

            {/* Mode picker */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {modeButtons.map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-[11px] font-medium transition-all ${
                    imageMode === mode
                      ? "border-[#0A66C2] bg-[var(--primary)]/5 text-[var(--primary)]"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-slate-300 hover:bg-[var(--card-hover)]"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            {/* AI mode */}
            {imageMode === "ai" && (
              <div className="space-y-3">
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe the image you want to generate..."
                  className="w-full text-sm text-[var(--foreground)] border border-[var(--border)] rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30 focus:border-[#0A66C2]"
                />
                <button
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage || !imagePrompt.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 disabled:opacity-50 transition-colors"
                >
                  {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isGeneratingImage ? "Generating..." : "Generate Image"}
                </button>
                {imageUrl && (
                  <div className="space-y-3">
                    <img src={imageUrl} alt="Generated" className="w-full rounded-xl border border-[var(--border)]" />
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-[var(--foreground)]">Image Hook (optional overlay text)</label>
                        <button
                          onClick={handleGenerateHook}
                          disabled={isGeneratingHook}
                          className="flex items-center gap-1 text-[11px] text-[var(--primary)] hover:underline disabled:opacity-50"
                        >
                          {isGeneratingHook ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                          Generate Hook
                        </button>
                      </div>
                      <input
                        type="text"
                        value={imageHook}
                        onChange={(e) => setImageHook(e.target.value)}
                        placeholder="Short hook text to overlay on image..."
                        className="w-full text-sm border border-[var(--border)] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30 focus:border-[#0A66C2]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Face mode */}
            {imageMode === "face" && (
              <div className="space-y-3">
                {!profilePhotoUrl ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Upload a profile photo in Settings first
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[var(--foreground)] mb-1.5 block">Style</label>
                      <div className="grid grid-cols-4 gap-2">
                        {faceStyles.map((s) => (
                          <button
                            key={s}
                            onClick={() => setFaceStyle(s)}
                            className={`py-1.5 rounded-lg border text-[11px] font-medium capitalize transition-all ${
                              faceStyle === s
                                ? "border-[#0A66C2] bg-[var(--primary)]/5 text-[var(--primary)]"
                                : "border-[var(--border)] text-[var(--text-muted)] hover:border-slate-300"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleGenerateFace}
                      disabled={isFaceGenerating}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 disabled:opacity-50 transition-colors"
                    >
                      {isFaceGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                      {isFaceGenerating ? "Generating..." : "Generate"}
                    </button>
                    {faceGeneratedUrl && (
                      <img src={faceGeneratedUrl} alt="Face generated" className="w-full rounded-xl border border-[var(--border)]" />
                    )}
                  </>
                )}
              </div>
            )}

            {/* Upload mode */}
            {imageMode === "upload" && (
              <div className="space-y-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Choose Image
                </button>
                {uploadedPreview && (
                  <img src={uploadedPreview} alt="Uploaded preview" className="w-full rounded-xl border border-[var(--border)]" />
                )}
              </div>
            )}

            {imageError && (
              <div className="flex items-center gap-2 mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {imageError}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-[var(--border)] space-y-2">
          {saveError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {saveError}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--primary)] text-white text-sm font-medium hover:bg-[var(--primary)]/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
