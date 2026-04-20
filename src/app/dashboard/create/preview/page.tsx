"use client";

import React, { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Post } from "@/lib/db/posts";
import { useAuth } from "@/lib/context/auth";
import {
  CheckCircle, AlertCircle, Linkedin, FileText, Send,
  ImageIcon, RefreshCw, Download, Sparkles, Upload, X,
  ArrowLeft, CalendarDays, RotateCcw, Wand2, User
} from "lucide-react";
import SchedulePicker from "@/components/schedule/SchedulePicker";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import RichTextEditor from "@/components/preview/RichTextEditor";
import LinkedInPostCard from "@/components/preview/LinkedInPostCard";
// Memory is saved via /api/memory/save (server-side Admin SDK) — not client-side
import { uploadDataUrlToStorage, uploadBlobToStorage } from "@/lib/storage/uploadImage";

type ImageMode = "ai" | "upload" | "reference" | "face" | "none" | "x_screenshot";

export default function PostPreviewPage() {
  const { user } = useAuth();
  const [postData, setPostData] = useState<any>(null);
  const [imageMode, setImageMode]           = useState<ImageMode>("none");
  const [imageUrl, setImageUrl]             = useState<string | null>(null);
  const [imagePrompt, setImagePrompt]       = useState<string>("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageError, setImageError]         = useState<string | null>(null);
  const [uploadedFile, setUploadedFile]     = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
  const [referenceImagePreview, setReferenceImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editedContent, setEditedContent]   = useState("");
  const [isSaving, setIsSaving]             = useState(false);
  const [isPublishing, setIsPublishing]     = useState(false);
  const [publishStatus, setPublishStatus]   = useState<"idle" | "success" | "error">("idle");
  const [publishMessage, setPublishMessage] = useState("");
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [isScheduling, setIsScheduling]     = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<"idle" | "success" | "error">("idle");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [linkedInConnected, setLinkedInConnected] = useState<boolean | null>(null);
  const [linkedInUser, setLinkedInUser]     = useState<{ name: string; picture: string; email: string } | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [profileName, setProfileName]       = useState<string | null>(null);

  // Plan + usage state (for feature gating)
  const [userPlan, setUserPlan] = useState<string>("free");
  const [monthlyUsage, setMonthlyUsage] = useState<{ faceImagesGenerated?: number; limits?: { faceImagesPerMonth?: number } } | null>(null);

  // "Use My Face" state
  const [profilePhotoUrl, setProfilePhotoUrl]       = useState<string | null>(null);
  const [profilePhotoHasFace, setProfilePhotoHasFace] = useState(false);
  const [faceStyle, setFaceStyle]                   = useState<"professional" | "casual" | "minimal" | "creative">("professional");
  const [isFaceGenerating, setIsFaceGenerating]     = useState(false);
  const [faceGeneratedUrl, setFaceGeneratedUrl]     = useState<string | null>(null);
  const [faceError, setFaceError]                   = useState<string | null>(null);

  // ── Image hook state (Layer 2 — text overlay) ───────────────────────────────
  const [imageHook, setImageHook]               = useState<string>("");
  const [isGeneratingHook, setIsGeneratingHook] = useState(false);

  // ── Regeneration state ──────────────────────────────────────────────────────
  const [isRegeneratingPost, setIsRegeneratingPost]   = useState(false);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [regenHint, setRegenHint]                     = useState("");
  const [showRegenHint, setShowRegenHint]             = useState(false);
  const [regenError, setRegenError]                   = useState<string | null>(null);
  const [regenImageError, setRegenImageError]         = useState<string | null>(null);
  // Single-level undo for both post and image prompt
  const [previousContent, setPreviousContent]         = useState<string | null>(null);
  const [previousImagePrompt, setPreviousImagePrompt] = useState<string | null>(null);

  const router = useRouter();

  const createPost = async (post: Omit<Post, "id">): Promise<{ id?: string }> => {
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ post }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to save post");
      }
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  };

  const updatePost = async (id: string, updates: Partial<Post>): Promise<void> => {
    const token = await getAuthToken();
    if (!token) return;
    await fetch("/api/posts", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
  };

  useEffect(() => {
    const data = localStorage.getItem("latest_post");
    if (!data) { router.push("/dashboard/create"); return; }
    const parsed = JSON.parse(data);
    setPostData(parsed);
    setEditedContent(parsed.content);
    if (parsed.imagePrompt) setImagePrompt(parsed.imagePrompt);
    if (parsed.imageHook) setImageHook(parsed.imageHook);
    if (parsed.referenceImagePreview) {
      setReferenceImagePreview(parsed.referenceImagePreview);
      setImageMode("reference");
    }

    getAuthToken().then(tok =>
      fetch("/api/linkedin/status", tok ? { headers: { Authorization: `Bearer ${tok}` } } : {})
        .then((r) => r.json())
        .then((d) => {
          setLinkedInConnected(d.connected);
          if (d.connected) setLinkedInUser({ name: d.name, picture: d.picture, email: d.email });
        })
        .catch(() => setLinkedInConnected(false))
    );

    // Load profile — check name (mandatory) + org ID (corporate)
    getAuthToken().then(token => {
      if (!token) return;
      fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(p => {
          const seg = parsed.metadata?.segment || "individual";
          const name = seg === "corporate" ? p?.corporate?.name : p?.individual?.name;
          setProfileName(name || null);
          if (seg === "corporate") {
            const orgId = p?.corporate?.linkedinOrganizationId;
            if (orgId) setOrganizationId(orgId);
          }
          if (p?.profilePhotoUrl) {
            setProfilePhotoUrl(p.profilePhotoUrl);
            setProfilePhotoHasFace(p.profilePhotoHasFace ?? true);
          }
        })
        .catch(() => {});

      // Load plan + usage for feature gating
      fetch("/api/usage/me", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => {
          setUserPlan(d.plan || "free");
          setMonthlyUsage({ faceImagesGenerated: d.faceImagesGenerated, limits: d.limits });
        })
        .catch(() => {});
    });
  }, [router]);

  /* ── Regenerate post ── */
  const handleRegeneratePost = async () => {
    if (!postData || isRegeneratingPost) return;
    setRegenError(null);
    setIsRegeneratingPost(true);
    setPreviousContent(editedContent);

    const effectiveInstructions = [
      regenHint.trim() ? `Direction for this version: ${regenHint.trim()}` : null,
      postData.metadata.customInstructions || null,
    ].filter(Boolean).join("\n") || undefined;

    try {
      const imageStyleRegen = postData.clientProfile?.imageStyle ?? undefined;

      const regenToken = await getAuthToken();
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(regenToken ? { Authorization: `Bearer ${regenToken}` } : {}) },
        body: JSON.stringify({
          topic:              postData.metadata.topic,
          tone:               postData.metadata.tone,
          audience:           postData.metadata.audience,
          length:             postData.metadata.length,
          segment:            postData.metadata.segment,
          research:           postData.research,
          intentType:         postData.intentType       ?? "professional",
          customInstructions: effectiveInstructions,
          imageStyle:         imageStyleRegen,
          // Full context — same as initial generation
          model:              postData.metadata.model   ?? undefined,
          clientProfile:      postData.clientProfile    ?? undefined,
          systemPrompt:       postData.systemPrompt     ?? undefined,
          memoryContext:      postData.memoryContext     ?? undefined,
          writingSamples:     postData.writingSamples   ?? undefined,
          sourceContext:      postData.sourceContext     ?? undefined,
          // Pass current post so Cortex iterates rather than restarts
          previousPost:       editedContent             || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");

      setEditedContent(data.post);
      setImagePrompt(data.imagePrompt);
      // Do NOT clear imageUrl — image is independent of post text
      setShowRegenHint(false);
      setRegenHint("");

      // Keep localStorage in sync
      localStorage.setItem("latest_post", JSON.stringify({
        ...postData,
        content: data.post,
        imagePrompt: data.imagePrompt,
      }));
    } catch (err: any) {
      setRegenError(err.message || "Post regeneration failed. Try again.");
      setPreviousContent(null); // revert undo state since nothing changed
    } finally {
      setIsRegeneratingPost(false);
    }
  };

  /* ── Regenerate image prompt only ── */
  const handleRegenerateImagePrompt = async () => {
    if (isRegeneratingImage) return;
    setRegenImageError(null);
    setIsRegeneratingImage(true);
    setPreviousImagePrompt(imagePrompt);

    try {
      const storedProfile = localStorage.getItem("client_profile");
      const imageStyle = storedProfile ? JSON.parse(storedProfile).imageStyle : undefined;

      const imagePromptToken = await getAuthToken();
      const res = await fetch("/api/ai/image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(imagePromptToken ? { Authorization: `Bearer ${imagePromptToken}` } : {}) },
        body: JSON.stringify({
          topic:      postData.metadata.topic,
          segment:    postData.metadata.segment,
          post:       editedContent,
          imageStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image prompt generation failed");

      setImagePrompt(data.imagePrompt);
      setImageUrl(null); // clear old image so user regenerates with new prompt
      localStorage.setItem("latest_post", JSON.stringify({
        ...postData,
        imagePrompt: data.imagePrompt,
      }));
    } catch (err: any) {
      setRegenImageError(err.message || "Image prompt regeneration failed.");
      setPreviousImagePrompt(null);
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  /* ── Undo handlers ── */
  const handleUndoPost = () => {
    if (!previousContent) return;
    const current = editedContent;
    setEditedContent(previousContent);
    setPreviousContent(current); // allows re-undo (toggle)
  };

  const handleUndoImagePrompt = () => {
    if (!previousImagePrompt) return;
    const current = imagePrompt;
    setImagePrompt(previousImagePrompt);
    setPreviousImagePrompt(current);
    setImageUrl(null);
  };

  /* ── Image hook generator (Layer 2) ── */
  const generateHook = async () => {
    if (!editedContent || isGeneratingHook) return;
    setIsGeneratingHook(true);
    try {
      const hookToken = await getAuthToken();
      const res = await fetch("/api/ai/image-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(hookToken ? { Authorization: `Bearer ${hookToken}` } : {}) },
        body: JSON.stringify({
          post: editedContent,
          topic: postData?.metadata?.topic,
        }),
      });
      const data = await res.json();
      if (res.ok && data.hook) {
        setImageHook(data.hook);
        const stored = localStorage.getItem("latest_post");
        if (stored) {
          localStorage.setItem("latest_post", JSON.stringify({ ...JSON.parse(stored), imageHook: data.hook }));
        }
      }
    } finally {
      setIsGeneratingHook(false);
    }
  };

  /* ── Image helpers ── */
  const generateImage = async (prompt: string) => {
    setIsGeneratingImage(true);
    setImageError(null);
    setImageUrl(null);
    try {
      const token = await getAuthToken();

      // X Screenshot style: only when user explicitly picks x_screenshot mode
      if (imageMode === "x_screenshot") {
        const postContent = editedContent || postData?.content || "";
        const res = await fetch("/api/image/x-screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ post: postContent }),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          let errMsg = "X screenshot generation failed.";
          try { errMsg = JSON.parse(errText).error || errMsg; } catch { if (errText) errMsg = errText.slice(0, 120); }
          throw new Error(errMsg);
        }
        // Use blob: URL — renders instantly, avoids CSP issues with data: URLs
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setImageUrl(blobUrl);
        return;
      }

      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed.");
      // Upload fal.ai URL server-side to avoid CORS — fal.ai CDN blocks browser fetches
      let persistentUrl = data.url;
      try {
        const uploadRes = await fetch("/api/image/upload-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ url: data.url, fileName: `post-images/${Date.now()}-ai.jpg` }),
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.url) persistentUrl = uploadData.url;
        }
      } catch { /* fallback to original url */ }
      setImageUrl(persistentUrl);
    } catch (err: any) {
      setImageError(err.message || "Failed to generate image.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleModeChange = (mode: ImageMode) => {
    setImageMode(mode);
    setImageError(null);
    if (mode !== "ai" && mode !== "x_screenshot") { setImageUrl(null); setIsGeneratingImage(false); }
    if (mode !== "upload") { setUploadedFile(null); setUploadedPreview(null); }
    if (mode !== "face") { setFaceGeneratedUrl(null); setFaceError(null); }
    // Auto-generate X screenshot when switching to x_screenshot mode
    if (mode === "x_screenshot") {
      setImageUrl(null);
      setTimeout(() => generateImage(""), 50);
    }
    // AI mode: user clicks Generate Image button manually (no auto-generate)
  };

  const generateFaceImage = async () => {
    if (!profilePhotoUrl || isFaceGenerating) return;
    setIsFaceGenerating(true);
    setFaceError(null);
    setFaceGeneratedUrl(null);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/image/face-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ backgroundStyle: faceStyle, postTopic: postData?.metadata?.topic || "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Face image generation failed");
      // Upload fal.ai URL server-side to avoid CORS — fal.ai CDN blocks browser fetches
      let persistentFaceUrl = data.url;
      try {
        const faceToken = await getAuthToken();
        const uploadRes = await fetch("/api/image/upload-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(faceToken ? { Authorization: `Bearer ${faceToken}` } : {}),
          },
          body: JSON.stringify({ url: data.url, fileName: `post-images/${Date.now()}-face.jpg` }),
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          if (uploadData.url) persistentFaceUrl = uploadData.url;
        }
      } catch { /* fallback */ }
      setFaceGeneratedUrl(persistentFaceUrl);
    } catch (err: any) {
      setFaceError(err.message || "Failed to generate face image");
    } finally {
      setIsFaceGenerating(false);
    }
  };

  const handleRemoveReferenceImage = () => {
    setReferenceImagePreview(null);
    setImageMode("none");
    const stored = localStorage.getItem("latest_post");
    if (stored) {
      const parsed = JSON.parse(stored);
      delete parsed.referenceImagePreview;
      localStorage.setItem("latest_post", JSON.stringify(parsed));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setUploadedPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDownloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = "cridl-linkedin-image.png";
    a.target = "_blank";
    a.click();
  };

  /**
   * Composites hook text onto the image using Canvas.
   * Returns a data: URL with the text baked in, or the original URL if compositing fails.
   * This ensures what you see in the preview is exactly what gets posted to LinkedIn.
   */
  const compositeImageWithHook = async (imgSrc: string, hookText: string): Promise<string> => {
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement("canvas");
        const SIZE = 1024;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(imgSrc); return; }

        const img = new window.Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
          try {
            // Draw base image scaled to square
            ctx.drawImage(img, 0, 0, SIZE, SIZE);

            // Gradient overlay matching CSS: linear-gradient(105deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 38%, transparent 58%)
            const grad = ctx.createLinearGradient(0, 0, SIZE * 0.75, SIZE * 0.55);
            grad.addColorStop(0,    "rgba(0,0,0,0.62)");
            grad.addColorStop(0.38, "rgba(0,0,0,0.38)");
            grad.addColorStop(0.58, "rgba(0,0,0,0)");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, SIZE, SIZE);

            // Text settings — matches CSS: weight 800, left 44%, top-left
            const MAX_TEXT_WIDTH = SIZE * 0.42;
            const FONT_SIZE = 58;
            const LINE_HEIGHT = FONT_SIZE * 1.18;
            const PAD_X = SIZE * 0.05;
            const PAD_Y = SIZE * 0.055;

            ctx.font = `800 ${FONT_SIZE}px 'Plus Jakarta Sans', Inter, Arial, sans-serif`;
            ctx.fillStyle = "white";
            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.shadowBlur = 18;

            // Word-wrap
            const words = hookText.split(" ");
            const lines: string[] = [];
            let current = "";
            for (const word of words) {
              const test = current ? `${current} ${word}` : word;
              if (ctx.measureText(test).width > MAX_TEXT_WIDTH && current) {
                lines.push(current);
                current = word;
              } else {
                current = test;
              }
            }
            if (current) lines.push(current);

            lines.forEach((line, i) => {
              ctx.fillText(line, PAD_X, PAD_Y + FONT_SIZE + i * LINE_HEIGHT);
            });

            resolve(canvas.toDataURL("image/jpeg", 0.93));
          } catch (canvasErr) {
            console.warn("[compositeImageWithHook] Canvas export failed (CORS taint?) — using original URL:", canvasErr);
            resolve(imgSrc);
          }
        };

        img.onerror = () => resolve(imgSrc); // fallback: send raw image
        img.src = imgSrc;
      } catch {
        resolve(imgSrc); // fallback on any error
      }
    });
  };

  /* Resolve final image URL for publishing */
  const finalImageUrl =
    imageMode === "x_screenshot" ? imageUrl :
    imageMode === "ai"        ? imageUrl :
    imageMode === "upload"    ? uploadedPreview :
    imageMode === "reference" ? referenceImagePreview :
    imageMode === "face"      ? faceGeneratedUrl :
    null;

  /* ── Draft / Publish ── */
  const handleSaveDraft = async () => {
    if (!postData || isSaving) return;
    setIsSaving(true);
    try {
      await createPost({
        user_id: user!.uid,
        account_id: "personal-account",
        status: "draft",
        content: editedContent,
        topic: postData.metadata.topic,
        tone: postData.metadata.tone,
        audience: postData.metadata.audience,
        length: postData.metadata.length,
        custom_instructions: postData.metadata.customInstructions || undefined,
        segment: postData.metadata.segment || "individual",
        research_data: postData.research,
        image_hook: imageHook || undefined,
        created_at: null,
      });
      router.push("/dashboard/drafts");
    } catch {
      alert("Failed to save draft.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!editedContent.trim() || isPublishing) return;
    setIsPublishing(true);
    setPublishStatus("idle");

    try {
      const authToken = await getAuthToken();

      // Bake hook text into image before publishing — what you see is what gets posted
      let publishImageUrl: string | null = finalImageUrl;
      if (finalImageUrl && imageHook) {
        publishImageUrl = await compositeImageWithHook(finalImageUrl, imageHook);
      }
      // Upload blob: or data: URLs to Firebase Storage — LinkedIn API needs a real HTTPS URL
      if (publishImageUrl && !publishImageUrl.startsWith("http")) {
        try {
          let blob: Blob;
          if (imageMode === "upload" && uploadedFile && publishImageUrl === finalImageUrl) {
            blob = uploadedFile;
          } else {
            const blobRes = await fetch(publishImageUrl);
            blob = await blobRes.blob();
          }
          const stored = await uploadBlobToStorage(blob, `post-images/${Date.now()}-pub.png`);
          publishImageUrl = stored || null;
        } catch {
          publishImageUrl = null;
        }
      }

      const res = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          content: editedContent,
          imageUrl: publishImageUrl || null,
          segment: postData.metadata.segment || "individual",
          organizationId: organizationId || undefined,
          topic:    postData.metadata.topic    || "",
          audience: postData.metadata.audience || "",
          tone:     postData.metadata.tone     || "professional",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPublishStatus("error");
        setPublishMessage((data as any).error || `Publishing failed (${res.status}). Please try again.`);
        return;
      }

      setPublishStatus("success");
      setPublishMessage("Post published successfully to LinkedIn! 🎉");

      // Save to Firestore after successful publish — fire and forget
      if (authToken) {
        createPost({
          user_id: user!.uid, account_id: "personal-account",
          status: "published",
          content: editedContent, topic: postData.metadata.topic,
          tone: postData.metadata.tone, audience: postData.metadata.audience,
          length: postData.metadata.length,
          custom_instructions: postData.metadata.customInstructions || undefined,
          segment: postData.metadata.segment || "individual",
          research_data: postData.research,
          image_url: publishImageUrl || finalImageUrl || undefined,
          image_hook: imageHook || undefined,
          linkedin_post_id: (data as any).postId || undefined,
          published_at: new Date().toISOString(),
          created_at: null,
        }).catch(() => {});
      }
    } catch (err: any) {
      setPublishStatus("error");
      setPublishMessage(err?.message || "Publishing failed. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSchedule = async (scheduledAt: Date, timezone: string, bestTimeApplied: boolean) => {
    if (!postData || isScheduling) return;
    setIsScheduling(true);
    setScheduleStatus("idle");
    try {
      // Determine if image is already a remote URL (no upload needed)
      const hasRemoteImage = finalImageUrl?.startsWith("http");
      const needsUpload = finalImageUrl && !hasRemoteImage;

      // Save post IMMEDIATELY — don't block on image upload
      const saved = await createPost({
        user_id: user!.uid,
        account_id: "personal-account",
        status: "scheduled",
        content: editedContent,
        topic: postData.metadata.topic,
        tone: postData.metadata.tone,
        audience: postData.metadata.audience,
        length: postData.metadata.length,
        custom_instructions: postData.metadata.customInstructions || undefined,
        segment: postData.metadata.segment || "individual",
        organization_id: organizationId || undefined,
        research_data: postData.research,
        image_url: hasRemoteImage ? finalImageUrl! : undefined,
        image_hook: imageHook || undefined,
        scheduled_at: scheduledAt.toISOString(),
        schedule_timezone: timezone,
        best_time_applied: bestTimeApplied,
        created_at: null,
      });

      // Show success immediately
      setScheduleStatus("success");
      const label = scheduledAt.toLocaleString("en-US", { timeZone: timezone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
      setScheduleMessage(`Scheduled for ${label} (${timezone})${needsUpload ? " · Uploading image…" : hasRemoteImage ? " · Image attached" : ""}`);
      setShowSchedulePicker(false);

      // Upload image in BACKGROUND after schedule is confirmed
      if (needsUpload && saved?.id) {
        (async () => {
          try {
            // Composite hook text onto image if needed
            let imgSrc = finalImageUrl!;
            if (imageHook) {
              try {
                imgSrc = await Promise.race([
                  compositeImageWithHook(finalImageUrl!, imageHook),
                  new Promise<string>((r) => setTimeout(() => r(finalImageUrl!), 10_000)),
                ]);
              } catch { /* use original */ }
            }

            let blob: Blob;
            if (imageMode === "upload" && uploadedFile && imgSrc === finalImageUrl) {
              blob = uploadedFile;
            } else {
              blob = await fetch(imgSrc).then(r => r.blob());
            }

            const ext = blob.type?.includes("png") ? "png" : "jpg";
            const uploaded = await uploadBlobToStorage(blob, `post-images/${Date.now()}.${ext}`);
            if (uploaded) {
              await updatePost(saved.id, { image_url: uploaded });
              setScheduleMessage(`Scheduled for ${label} (${timezone}) · Image attached`);
            }
          } catch (err) {
            console.warn("[Schedule] Background image upload failed:", err);
          }
        })();
      }

      // Background AI image generation (no existing image)
      const isXShot = imageMode === "x_screenshot" || postData?.clientProfile?.imageStyle === "x_screenshot";
      if (imageMode === "ai" && !finalImageUrl && (imagePrompt || isXShot) && saved?.id) {
        setScheduleMessage(`Scheduled for ${label} (${timezone}) · Generating image…`);
        const bgPostContent = editedContent || postData?.content || "";
        getAuthToken().then(bgToken => fetch(
          isXShot ? "/api/image/x-screenshot" : "/api/image/generate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(bgToken ? { Authorization: `Bearer ${bgToken}` } : {}) },
            body: JSON.stringify(isXShot ? { post: bgPostContent } : { prompt: imagePrompt }),
          }
        ))
          .then(async (r) => {
            if (!r.ok) return null;
            if (isXShot) {
              const blob = await r.blob();
              const dataUrl = await new Promise<string>((res2, rej2) => {
                const reader = new FileReader();
                reader.onload = () => res2(reader.result as string);
                reader.onerror = rej2;
                reader.readAsDataURL(blob);
              });
              const fbUrl = await uploadDataUrlToStorage(dataUrl, `post-images/${Date.now()}-xshot.png`);
              return fbUrl ? { url: fbUrl } : null;
            }
            return r.json();
          })
          .then((d) => {
            if (d?.url && saved.id) {
              updatePost(saved.id, { image_url: d.url }).catch(() => {});
              setScheduleMessage(`Scheduled for ${label} (${timezone}) · AI image attached`);
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      setScheduleStatus("error");
      setScheduleMessage(`Failed to schedule: ${err?.message || "Unknown error"}.`);
    } finally {
      setIsScheduling(false);
    }
  };

  if (!postData) return null;

  const isCorp = postData?.metadata?.segment === "corporate";
  const accentColor = isCorp ? "#7C3AED" : "#0A66C2";

  return (
    <div className="flex h-full bg-[var(--card-hover)]">

      {/* ── Main area ── */}
      <div className="flex-1 p-8 overflow-auto border-r border-[var(--border)]">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Post Preview</h1>
            <div className="flex gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-sm font-medium border border-[var(--border)] text-[var(--foreground)] transition-all disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Draft"}
              </button>

              <button
                onClick={() => {
                  if (!linkedInConnected) return;
                  // A2: Block corporate posts if org ID is missing
                  if (postData?.metadata?.segment === "corporate" && !organizationId) {
                    alert("Add your LinkedIn Organization ID in Settings → Identity (Corporate) before scheduling company posts.");
                    return;
                  }
                  setShowSchedulePicker(true);
                }}
                disabled={scheduleStatus === "success" || linkedInConnected === false}
                title={linkedInConnected === false ? "Connect LinkedIn first to schedule posts" : undefined}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/100 hover:bg-amber-600 text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CalendarDays className="w-4 h-4" />
                {scheduleStatus === "success" ? "Scheduled ✓" : "Schedule"}
              </button>

              {linkedInConnected === false ? (
                <a
                  href={`/api/auth/linkedin?returnTo=/dashboard/create/preview&uid=${encodeURIComponent(user?.uid || "")}`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[#0958A8] text-sm font-semibold text-white transition-all"
                >
                  <Linkedin className="w-4 h-4" />
                  Connect LinkedIn
                </a>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={isPublishing || publishStatus === "success"}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--primary)] hover:bg-[#0958A8] text-sm font-semibold text-white transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isPublishing ? "Publishing..." : publishStatus === "success" ? "Published ✓" : "Publish to LinkedIn"}
                </button>
              )}
            </div>
          </div>

          {/* ── Setup required warning ── */}
          {(profileName === null || !linkedInConnected) && linkedInConnected !== null && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Complete setup before publishing</p>
                <div className="mt-1.5 space-y-1">
                  {!linkedInConnected && (
                    <p className="text-[11px] text-amber-400">
                      • <strong>LinkedIn not connected</strong> — required to publish or schedule.{" "}
                      <a href={`/api/auth/linkedin?returnTo=/dashboard/create/preview&uid=${encodeURIComponent(user?.uid || "")}`} className="underline font-semibold">Connect now →</a>
                    </p>
                  )}
                  {profileName === null && (
                    <p className="text-[11px] text-amber-400">
                      • <strong>Profile name missing</strong> — the AI needs your name to write in your voice.{" "}
                      <a href="/dashboard/settings" className="underline font-semibold">Add in Settings →</a>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* LinkedIn account banner */}
          {linkedInConnected === true && linkedInUser?.name && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              isCorp ? "bg-violet-500/10 border-violet-800/40" : "bg-blue-500/10 border-blue-800/40"
            }`}>
              {isCorp ? (
                <div className="w-8 h-8 rounded-full bg-violet-500/20 border border-violet-800/40 flex items-center justify-center shrink-0">
                  <Linkedin className="w-4 h-4 text-violet-400" />
                </div>
              ) : (
                linkedInUser.picture && (
                  <img src={linkedInUser.picture} alt={linkedInUser.name} className="w-8 h-8 rounded-full shrink-0" />
                )
              )}
              <div>
                {isCorp ? (
                  <>
                    <p className="text-xs font-medium text-[var(--foreground)]">Posting as <span className="text-violet-400 font-semibold">Company Page</span></p>
                    <p className="text-[11px] text-[var(--text-muted)]">Authorised by {linkedInUser.name}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-[var(--foreground)]">Posting as <span className="text-[var(--primary)] font-semibold">{linkedInUser.name}</span></p>
                    <p className="text-[11px] text-[var(--text-muted)]">{linkedInUser.email}</p>
                  </>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isCorp ? "bg-violet-500/100" : "bg-emerald-500/100"}`} />
                <span className={`text-[11px] font-medium ${isCorp ? "text-violet-400" : "text-emerald-400"}`}>
                  {isCorp ? "Corporate" : "Personal"}
                </span>
              </div>
            </div>
          )}

          {/* Corporate publishing restriction notice */}
          {isCorp && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Company page publishing requires LinkedIn Partner approval</p>
                <p className="text-[11px] text-amber-400 mt-0.5">
                  LinkedIn restricts the <code className="bg-amber-500/20 px-1 rounded">w_organization_social</code> scope to approved Marketing Developer Platform partners. Until approved, use <strong>Schedule</strong> — once the token is approved, scheduled posts will publish automatically. Scheduling works today.
                </p>
              </div>
            </div>
          )}

          {/* Status banners */}
          {publishStatus === "success" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-800/40">
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-400 font-medium">{publishMessage}</p>
            </div>
          )}
          {publishStatus === "error" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-400 font-medium">{publishMessage}</p>
            </div>
          )}
          {scheduleStatus === "success" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-200">
              <CalendarDays className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-sm text-amber-800 font-semibold">Post Scheduled!</p>
                <p className="text-xs text-amber-400 mt-0.5">{scheduleMessage}</p>
              </div>
              <a href="/dashboard/schedule" className="ml-auto text-xs font-medium text-amber-400 hover:underline">
                View Calendar →
              </a>
            </div>
          )}
          {scheduleStatus === "error" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-400 font-medium">{scheduleMessage}</p>
            </div>
          )}

          {/* ── Post Editor + LinkedIn Preview grid ── */}
          <div className="lg:grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          <div className="space-y-6 min-w-0">

          {/* ── Post Editor ── */}
          <div className="card overflow-hidden">
            {/* Card header with Regenerate controls */}
            <div className="px-5 py-3 border-b border-[var(--border-sub)] bg-[var(--card-hover)] flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-muted)]">LinkedIn Post · Edit before publishing</span>
              <div className="flex items-center gap-2">
                {previousContent && (
                  <button
                    onClick={handleUndoPost}
                    className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                    title="Undo last regeneration"
                  >
                    <RotateCcw className="w-3 h-3" /> Undo
                  </button>
                )}
                <button
                  onClick={() => { setShowRegenHint(!showRegenHint); setRegenError(null); }}
                  disabled={isRegeneratingPost}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    showRegenHint
                      ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                      : "bg-[var(--card)] hover:bg-[var(--card-hover)] text-[var(--text-sub)] border-[var(--border)]"
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${isRegeneratingPost ? "animate-spin" : ""}`} />
                  {isRegeneratingPost ? "Regenerating..." : "Regenerate Post"}
                </button>
              </div>
            </div>

            {/* Hint panel — expands when Regenerate is clicked */}
            {showRegenHint && !isRegeneratingPost && (
              <div className="px-5 py-3 border-b border-[var(--border-sub)] bg-[var(--card-hover)] space-y-2">
                <p className="text-[11px] text-[var(--text-muted)]">
                  Give Cortex a direction hint (optional) — e.g. <span className="italic">"make it shorter"</span>, <span className="italic">"more storytelling"</span>, <span className="italic">"less salesy"</span>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={regenHint}
                    onChange={(e) => setRegenHint(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRegeneratePost(); }}
                    placeholder="Direction hint (optional)..."
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:ring-1 focus:ring-slate-400 text-[var(--foreground)] placeholder-slate-400"
                    autoFocus
                  />
                  <button
                    onClick={handleRegeneratePost}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-all"
                    style={{ background: accentColor }}
                  >
                    Regenerate Now →
                  </button>
                  <button
                    onClick={() => { setShowRegenHint(false); setRegenHint(""); }}
                    className="px-3 py-2 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] border border-[var(--border)] bg-[var(--card)]"
                  >
                    Cancel
                  </button>
                </div>
                {regenError && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {regenError}
                  </p>
                )}
              </div>
            )}

            {/* Rich text editor with loading overlay */}
            <div className="relative p-4">
              {isRegeneratingPost && (
                <div className="absolute inset-0 bg-[var(--card)]/80 flex flex-col items-center justify-center z-10 gap-3 rounded-xl">
                  <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }} />
                  <p className="text-sm text-[var(--text-muted)] font-medium">Writing a new version...</p>
                  {regenHint && <p className="text-xs text-[var(--text-muted)] italic">"{regenHint}"</p>}
                </div>
              )}
              <RichTextEditor
                value={editedContent}
                onChange={setEditedContent}
                accentColor={accentColor}
                maxLength={3000}
                disabled={isRegeneratingPost}
              />
            </div>
          </div>

          </div>{/* end space-y-6 left column */}

          {/* LinkedIn Preview sticky panel */}
          <div className="lg:sticky lg:top-6">
            <LinkedInPostCard
              name={isCorp ? (profileName ?? 'Company Page') : (linkedInUser?.name ?? profileName ?? 'You')}
              avatarUrl={isCorp ? '' : (linkedInUser?.picture ?? profilePhotoUrl ?? '')}
              content={editedContent}
              imageUrl={finalImageUrl ?? undefined}
              imageHook={imageHook || undefined}
              isUploadedImage={imageMode === "upload" || imageMode === "reference"}
              isCompany={isCorp}
            />
          </div>

          </div>{/* end grid */}

          {/* ── Image Section — full width ── */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border-sub)] bg-[var(--card-hover)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[var(--primary)]" />
                <span className="text-xs font-medium text-[var(--text-sub)]">Post Image</span>
                {finalImageUrl && (
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-800/40 rounded-full font-medium">
                    Attached
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Undo image prompt */}
                {previousImagePrompt && (
                  <button
                    onClick={handleUndoImagePrompt}
                    className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
                    title="Undo last prompt regeneration"
                  >
                    <RotateCcw className="w-3 h-3" /> Undo
                  </button>
                )}
                {/* Rethink prompt button — always visible in AI mode */}
                {imageMode === "ai" && (
                  <button
                    onClick={handleRegenerateImagePrompt}
                    disabled={isRegeneratingImage}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-sub)] transition-all border border-[var(--border)] disabled:opacity-50"
                    title="Generate a new image prompt based on the current post content"
                  >
                    <Wand2 className={`w-3 h-3 ${isRegeneratingImage ? "animate-spin" : ""}`} />
                    {isRegeneratingImage ? "Rethinking..." : "New Prompt"}
                  </button>
                )}
                {/* Download + Regenerate pixel image */}
                {imageMode === "ai" && imageUrl && !isGeneratingImage && (
                  <>
                    <button
                      onClick={handleDownloadImage}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-sub)] transition-all border border-[var(--border)]"
                    >
                      <Download className="w-3 h-3" /> Download
                    </button>
                    <button
                      onClick={() => generateImage(imagePrompt)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-sub)] transition-all border border-[var(--border)]"
                    >
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Image prompt preview + error */}
            {imageMode === "ai" && imagePrompt && (
              <div className="px-5 py-2.5 border-b border-[var(--border-sub)] bg-[var(--card-hover)]/50 flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-[var(--text-muted)] mt-0.5 shrink-0" />
                <p className="text-[11px] text-[var(--text-muted)] italic leading-relaxed flex-1 line-clamp-2">{imagePrompt}</p>
              </div>
            )}
            {regenImageError && imageMode === "ai" && (
              <div className="px-5 py-2 border-b border-red-100 bg-red-500/10 flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                <p className="text-[11px] text-red-500">{regenImageError}</p>
              </div>
            )}

            {/* Mode picker */}
            <div className="px-5 py-4 border-b border-[var(--border-sub)]">
              <div className="flex items-center gap-1.5 mb-3">
                <p className="text-xs text-[var(--text-muted)] font-medium">Add an image to your post</p>
                <HelpTooltip
                  text="LinkedIn posts with images get significantly higher reach. AI Generate creates a professional editorial photo based on your post content. Upload lets you use your own branded image. No Image keeps the post text-only."
                  example="Recommended: AI Generate for thought leadership posts, Upload for personal photos or branded graphics."
                  position="bottom"
                  width="w-72"
                />
              </div>
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                {/* Your Photo — only shown if user uploaded a reference image on Create page */}
                {referenceImagePreview && (
                  <button
                    onClick={() => handleModeChange("reference")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                      imageMode === "reference" ? "border-green-500 bg-emerald-500/10" : "border-[var(--border)] bg-[var(--card)] hover:border-slate-300 hover:bg-[var(--card-hover)]"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-xl overflow-hidden border border-[var(--border)] shrink-0">
                      <img src={referenceImagePreview} alt="Your photo" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${imageMode === "reference" ? "text-emerald-400" : "text-[var(--foreground)]"}`}>Your Photo</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">The image you uploaded</p>
                    </div>
                  </button>
                )}

                <button
                  onClick={() => handleModeChange("ai")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "ai" ? "border-[#0A66C2] bg-blue-500/10" : "border-[var(--border)] bg-[var(--card)] hover:border-slate-300 hover:bg-[var(--card-hover)]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${imageMode === "ai" ? "bg-[var(--primary)]" : "bg-[var(--toggle-bg)]"}`}>
                    <Sparkles className={`w-4.5 h-4.5 ${imageMode === "ai" ? "text-white" : "text-[var(--text-muted)]"}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${imageMode === "ai" ? "text-[var(--primary)]" : "text-[var(--foreground)]"}`}>AI Generate</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">Let Cortex create a matching image</p>
                  </div>
                </button>

                <button
                  onClick={() => handleModeChange("x_screenshot")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "x_screenshot" ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40 hover:bg-[var(--card-hover)]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${imageMode === "x_screenshot" ? "bg-black" : "bg-[var(--toggle-bg)]"}`}>
                    <span className={`text-lg font-black leading-none ${imageMode === "x_screenshot" ? "text-white" : "text-[var(--text-sub)]"}`}>𝕏</span>
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${imageMode === "x_screenshot" ? "text-white" : "text-[var(--foreground)]"}`}>X Screenshot</p>
                    <p className={`text-[10px] mt-0.5 leading-tight ${imageMode === "x_screenshot" ? "text-[var(--text-muted)]" : "text-[var(--text-muted)]"}`}>Twitter-style dark card</p>
                  </div>
                </button>

                <button
                  onClick={() => { handleModeChange("upload"); if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.click(); } }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "upload" ? "border-[#0A66C2] bg-blue-500/10" : "border-[var(--border)] bg-[var(--card)] hover:border-slate-300 hover:bg-[var(--card-hover)]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${imageMode === "upload" ? "bg-[var(--primary)]" : "bg-[var(--toggle-bg)]"}`}>
                    <Upload className={`w-4.5 h-4.5 ${imageMode === "upload" ? "text-white" : "text-[var(--text-muted)]"}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${imageMode === "upload" ? "text-[var(--primary)]" : "text-[var(--foreground)]"}`}>Upload Image</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">Use your own photo or graphic</p>
                  </div>
                </button>

                <button
                  onClick={() => handleModeChange("none")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "none" ? "border-[var(--primary)] bg-[var(--primary)]/10" : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/40 hover:bg-[var(--card-hover)]"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${imageMode === "none" ? "bg-[var(--border)]" : "bg-[var(--toggle-bg)]"}`}>
                    <X className={`w-4.5 h-4.5 ${imageMode === "none" ? "text-[var(--text-sub)]" : "text-[var(--text-muted)]"}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${imageMode === "none" ? "text-[var(--foreground)]" : "text-[var(--text-muted)]"}`}>No Image</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">Text-only post</p>
                  </div>
                </button>

                {/* Use My Face — Individual only */}
                {postData?.metadata?.segment !== "corporate" && (
                  userPlan === "free" ? (
                    <a
                      href="/#pricing"
                      title="Upgrade to Starter or above to use this feature"
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card-hover)] text-center opacity-70 hover:opacity-90 transition-opacity"
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--toggle-bg)]">
                        <User className="w-4 h-4 text-[var(--text-muted)]" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-muted)]">Use My Face</p>
                        <p className="text-[10px] text-amber-500 mt-0.5 leading-tight">Starter plan required</p>
                      </div>
                    </a>
                  ) : (
                    <button
                      onClick={() => profilePhotoHasFace && profilePhotoUrl && handleModeChange("face")}
                      disabled={!profilePhotoHasFace || !profilePhotoUrl}
                      title={
                        !profilePhotoUrl
                          ? "Upload a profile photo in Settings → Identity first"
                          : !profilePhotoHasFace
                          ? "No face detected in your profile photo. Update it in Settings → Identity"
                          : undefined
                      }
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center disabled:opacity-40 disabled:cursor-not-allowed ${
                        imageMode === "face"
                          ? "border-purple-500 bg-purple-50"
                          : "border-[var(--border)] bg-[var(--card)] hover:border-slate-300 hover:bg-[var(--card-hover)]"
                      }`}
                    >
                      {profilePhotoUrl ? (
                        <div className="w-9 h-9 rounded-xl overflow-hidden border border-[var(--border)] shrink-0">
                          <img src={profilePhotoUrl} alt="Your face" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--toggle-bg)]">
                          <User className="w-4 h-4 text-[var(--text-muted)]" />
                        </div>
                      )}
                      <div>
                        <p className={`text-xs font-semibold ${imageMode === "face" ? "text-purple-700" : "text-[var(--foreground)]"}`}>Use My Face</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight">
                          {profilePhotoUrl
                            ? monthlyUsage?.limits?.faceImagesPerMonth && monthlyUsage.limits.faceImagesPerMonth < 999999
                              ? `${monthlyUsage.faceImagesGenerated ?? 0}/${monthlyUsage.limits.faceImagesPerMonth} used`
                              : "AI places you in a scene"
                            : "Upload photo in Settings"}
                        </p>
                      </div>
                    </button>
                  )
                )}
              </div>

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Image display area */}
            <div className="p-6 min-h-[160px] flex items-center justify-center bg-[var(--card)]">
              {imageMode === "ai" && !isGeneratingImage && !imageUrl && !imageError && (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-100 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">Ready to generate your image</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Cortex will create a professional image based on your post content</p>
                  </div>
                  <button
                    onClick={() => generateImage(imagePrompt)}
                    disabled={!imagePrompt || isRegeneratingImage}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--primary)] hover:bg-[#0958A8] text-sm font-medium text-white transition-all disabled:opacity-40"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Image
                  </button>
                  {!imagePrompt && (
                    <p className="text-[11px] text-amber-400">No image prompt available. Regenerate the post first.</p>
                  )}
                </div>
              )}

              {(imageMode === "ai" || imageMode === "x_screenshot") && isGeneratingImage && (
                <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
                  <div className="w-7 h-7 border-2 border-[#0A66C2]/30 border-t-[#0A66C2] rounded-full animate-spin" />
                  <p className="text-xs">{imageMode === "x_screenshot" ? "Creating X screenshot..." : "Generating image with AI..."}</p>
                </div>
              )}

              {(imageMode === "ai" || imageMode === "x_screenshot") && !isGeneratingImage && imageError && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                  <p className="text-sm text-red-500">{imageError}</p>
                  <button onClick={() => generateImage(imagePrompt)} className="text-xs text-[var(--primary)] hover:underline">Try again</button>
                </div>
              )}

              {(imageMode === "ai" || imageMode === "x_screenshot") && !isGeneratingImage && imageUrl && !imageError && (
                <div className="w-full relative">
                  <img src={imageUrl} alt="AI generated LinkedIn image" className="w-full rounded-xl object-cover aspect-square" />
                  {imageHook && (
                    <div className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{ background: "linear-gradient(105deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 38%, transparent 58%)" }}>
                      <p className="absolute top-5 left-5 text-white leading-[1.12]"
                        style={{
                          width: "44%",
                          fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', Inter, sans-serif",
                          fontWeight: 800,
                          fontSize: "clamp(1.15rem, 3.5vw, 1.9rem)",
                          letterSpacing: "-0.02em",
                          textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.95)",
                        }}>
                        {imageHook}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {imageMode === "upload" && !uploadedPreview && (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[var(--toggle-bg)] border border-[var(--border)] flex items-center justify-center">
                    <Upload className="w-5 h-5 text-[var(--text-muted)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-sub)]">No image selected yet</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Click the Upload Image option above to choose a file</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--card-hover)] hover:bg-[var(--card)] text-sm font-medium text-[var(--foreground)] transition-all"
                  >
                    <Upload className="w-4 h-4" /> Choose File
                  </button>
                </div>
              )}

              {imageMode === "upload" && uploadedPreview && (
                <div className="w-full">
                  <div className="relative">
                    <img src={uploadedPreview} alt="Uploaded image" className="w-full rounded-xl object-contain max-h-[480px]" />
                    {imageHook && (
                      <div className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{ background: "linear-gradient(105deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 38%, transparent 58%)" }}>
                        <p className="absolute top-5 left-5 text-white leading-[1.12]"
                          style={{
                            width: "44%",
                            fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', Inter, sans-serif",
                            fontWeight: 800,
                            fontSize: "clamp(1.15rem, 3.5vw, 1.9rem)",
                            letterSpacing: "-0.02em",
                            textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.95)",
                          }}>
                          {imageHook}
                        </p>
                      </div>
                    )}
                    <button
                      onClick={() => { setUploadedFile(null); setUploadedPreview(null); if (fileInputRef.current) { fileInputRef.current.value = ""; fileInputRef.current.click(); } }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-sm flex items-center justify-center hover:bg-[var(--card-hover)] transition-all"
                      title="Replace image"
                    >
                      <RefreshCw className="w-3 h-3 text-[var(--text-muted)]" />
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[var(--text-muted)] truncate">{uploadedFile?.name}</p>
                </div>
              )}

              {imageMode === "reference" && referenceImagePreview && (
                <div className="w-full">
                  <div className="relative">
                    <img src={referenceImagePreview} alt="Your uploaded photo" className="w-full rounded-xl object-contain max-h-[480px]" />
                    {imageHook && (
                      <div className="absolute inset-0 rounded-xl pointer-events-none"
                        style={{ background: "linear-gradient(105deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 38%, transparent 58%)" }}>
                        <p className="absolute top-5 left-5 text-white leading-[1.12]"
                          style={{
                            width: "44%",
                            fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', Inter, sans-serif",
                            fontWeight: 800,
                            fontSize: "clamp(1.15rem, 3.5vw, 1.9rem)",
                            letterSpacing: "-0.02em",
                            textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.95)",
                          }}>
                          {imageHook}
                        </p>
                      </div>
                    )}
                    <button
                      onClick={handleRemoveReferenceImage}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[var(--card)] border border-[var(--border)] shadow-sm flex items-center justify-center hover:bg-[var(--card-hover)] transition-all"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3 text-[var(--text-muted)]" />
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-emerald-400 font-medium">Your photo · will be attached to the post</p>
                </div>
              )}

              {imageMode === "face" && (
                <div className="flex flex-col items-center gap-4 text-center w-full">
                  {!faceGeneratedUrl && !isFaceGenerating && (
                    <>
                      <div className="w-full">
                        <p className="text-xs font-medium text-[var(--text-sub)] mb-3">Choose a background style</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {([
                            { id: "professional", label: "Professional", emoji: "💼" },
                            { id: "casual",       label: "Casual",       emoji: "☕" },
                            { id: "minimal",      label: "Minimal",      emoji: "⬜" },
                            { id: "creative",     label: "Creative",     emoji: "🎨" },
                          ] as const).map(s => (
                            <button
                              key={s.id}
                              onClick={() => setFaceStyle(s.id)}
                              className={`py-2.5 px-3 rounded-lg border text-xs font-medium transition-all ${
                                faceStyle === s.id
                                  ? "border-purple-500 bg-purple-50 text-purple-700"
                                  : "border-[var(--border)] bg-[var(--card)] text-[var(--text-sub)] hover:border-slate-300"
                              }`}
                            >
                              {s.emoji} {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {faceError && <p className="text-sm text-red-500">{faceError}</p>}
                      <button
                        onClick={generateFaceImage}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium text-white transition-all"
                      >
                        <Sparkles className="w-4 h-4" />
                        Generate with My Face
                      </button>
                    </>
                  )}
                  {isFaceGenerating && (
                    <div className="flex flex-col items-center gap-3 text-[var(--text-muted)]">
                      <div className="w-7 h-7 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
                      <p className="text-xs">Generating your face image... (this takes ~30s)</p>
                    </div>
                  )}
                  {faceGeneratedUrl && !isFaceGenerating && (
                    <div className="w-full relative">
                      <img src={faceGeneratedUrl} alt="Face generated image" className="w-full rounded-xl object-cover aspect-square" />
                      <div className="mt-3 flex gap-2 justify-center">
                        <button
                          onClick={() => { setFaceGeneratedUrl(null); setFaceError(null); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] text-xs text-[var(--text-sub)] hover:bg-[var(--card-hover)] transition-all"
                        >
                          <RefreshCw className="w-3 h-3" /> Regenerate
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {imageMode === "none" && (
                <div className="flex flex-col items-center gap-3 text-center text-[var(--text-muted)]">
                  <ImageIcon className="w-8 h-8 text-[var(--text-muted)]" />
                  <p className="text-xs">This post will be published as text only.</p>
                </div>
              )}
            </div>

            {/* ── Hook text overlay editor (Layer 2) ── */}
            {imageMode !== "none" && finalImageUrl && (
              <div className="px-5 py-4 border-t border-[var(--border-sub)] bg-[var(--card-hover)]/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                      Image Hook Text
                    </label>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Overlaid on the image. 7 words max. Leave blank to hide.</p>
                  </div>
                  <button
                    onClick={generateHook}
                    disabled={isGeneratingHook}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card)] hover:bg-[var(--card-hover)] text-xs text-[var(--text-sub)] border border-[var(--border)] transition-all disabled:opacity-50"
                  >
                    <Sparkles className={`w-3 h-3 ${isGeneratingHook ? "animate-spin" : ""}`} />
                    {isGeneratingHook ? "Generating..." : "Generate Hook"}
                  </button>
                </div>
                <input
                  type="text"
                  value={imageHook}
                  onChange={(e) => setImageHook(e.target.value)}
                  placeholder='e.g. "Are you making this mistake?"'
                  maxLength={80}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--card)] focus:outline-none focus:ring-1 focus:ring-[#0A66C2]/30 text-[var(--foreground)] placeholder-slate-400"
                />
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Schedule picker modal */}
      {showSchedulePicker && (
        <SchedulePicker
          segment={postData?.metadata?.segment || "individual"}
          userId={user!.uid}
          isLoading={isScheduling}
          onCancel={() => setShowSchedulePicker(false)}
          onSchedule={handleSchedule}
        />
      )}

      {/* ── Research Sidebar ── */}
      <aside className="w-80 p-6 overflow-auto space-y-6 bg-[var(--card)] border-l border-[var(--border)]">

        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold mb-2">Research Basis</p>
          <div className={`p-3 rounded-xl border ${isCorp ? "bg-violet-500/10 border-violet-800/40" : "bg-blue-500/10 border-blue-800/40"}`}>
            <p className={`text-sm font-medium ${isCorp ? "text-violet-400" : "text-[var(--primary)]"}`}>
              {postData.metadata.topic}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold mb-3">Core Insights</p>
          <div className="space-y-4">
            {postData.research.insights.map((insight: any, i: number) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-semibold text-[var(--foreground)]">{insight.title}</p>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{insight.content}</p>
              </div>
            ))}
          </div>
        </div>

        {postData.research.references?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold mb-3">Sources</p>
            <ul className="space-y-2">
              {postData.research.references.map((ref: string, i: number) => (
                <li key={i}>
                  <a href={ref} target="_blank" rel="noreferrer" className="text-xs text-[var(--primary)] hover:underline block truncate">
                    {ref}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-4 border-t border-[var(--border-sub)]">
          <Link
            href="/dashboard/create"
            className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to generator
          </Link>
        </div>

      </aside>
    </div>
  );
}
