"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { postService } from "@/lib/db/posts";
import {
  CheckCircle, AlertCircle, Linkedin, FileText, Send,
  ImageIcon, RefreshCw, Download, Sparkles, Upload, X,
  ArrowLeft, CalendarDays
} from "lucide-react";
import SchedulePicker from "@/components/schedule/SchedulePicker";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { extractMemory } from "@/lib/ai/memory-extract";
import { memoryService } from "@/lib/db/memory";

type ImageMode = "ai" | "upload" | "none";

export default function PostPreviewPage() {
  const [postData, setPostData] = useState<any>(null);
  const [imageMode, setImageMode]           = useState<ImageMode>("none");
  const [imageUrl, setImageUrl]             = useState<string | null>(null);
  const [imagePrompt, setImagePrompt]       = useState<string>("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageError, setImageError]         = useState<string | null>(null);
  const [uploadedFile, setUploadedFile]     = useState<File | null>(null);
  const [uploadedPreview, setUploadedPreview] = useState<string | null>(null);
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
  const router = useRouter();

  useEffect(() => {
    const data = localStorage.getItem("latest_post");
    if (!data) { router.push("/dashboard/create"); return; }
    const parsed = JSON.parse(data);
    setPostData(parsed);
    setEditedContent(parsed.content);
    if (parsed.imagePrompt) setImagePrompt(parsed.imagePrompt);

    fetch("/api/linkedin/status")
      .then((r) => r.json())
      .then((d) => {
        setLinkedInConnected(d.connected);
        if (d.connected) setLinkedInUser({ name: d.name, picture: d.picture, email: d.email });
      })
      .catch(() => setLinkedInConnected(false));
  }, [router]);

  /* ── Image helpers ── */
  const generateImage = async (prompt: string) => {
    setIsGeneratingImage(true);
    setImageError(null);
    setImageUrl(null);
    try {
      const res = await fetch("/api/image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed.");
      setImageUrl(data.url);
    } catch (err: any) {
      setImageError(err.message || "Failed to generate image.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleModeChange = (mode: ImageMode) => {
    setImageMode(mode);
    setImageError(null);
    if (mode !== "ai") { setImageUrl(null); setIsGeneratingImage(false); }
    if (mode !== "upload") { setUploadedFile(null); setUploadedPreview(null); }
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
    a.download = "neel-linkedin-image.png";
    a.target = "_blank";
    a.click();
  };

  /* Resolve final image URL for publishing */
  const finalImageUrl =
    imageMode === "ai"     ? imageUrl :
    imageMode === "upload" ? uploadedPreview :
    null;

  /* ── Draft / Publish ── */
  const handleSaveDraft = async () => {
    if (!postData || isSaving) return;
    setIsSaving(true);
    try {
      await postService.createDraft({
        user_id: "demo-user",
        account_id: "personal-account",
        content: editedContent,
        topic: postData.metadata.topic,
        tone: postData.metadata.tone,
        audience: postData.metadata.audience,
        length: postData.metadata.length,
        custom_instructions: postData.metadata.customInstructions || undefined,
        segment: postData.metadata.segment || "individual",
        research_data: postData.research,
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
      const res = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editedContent,
          imageUrl: finalImageUrl || null,
          segment: postData.metadata.segment || "individual",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPublishStatus("error");
        setPublishMessage(data.error || "Publishing failed. Please try again.");
        await postService.createDraft({
          user_id: "demo-user", account_id: "personal-account",
          content: editedContent, topic: postData.metadata.topic,
          tone: postData.metadata.tone, audience: postData.metadata.audience,
          length: postData.metadata.length,
          custom_instructions: postData.metadata.customInstructions || undefined,
          segment: postData.metadata.segment || "individual",
          research_data: postData.research,
        });
      } else {
        setPublishStatus("success");
        setPublishMessage("Post published successfully to LinkedIn! 🎉");

        // Extract memory — only for posts that actually went live on LinkedIn
        extractMemory(
          editedContent,
          postData.metadata.topic,
          postData.metadata.audience,
          postData.metadata.tone
        ).then(async (extract) => {
          if (!extract) return;
          await memoryService.save({
            user_id: "demo-user",
            segment: postData.metadata.segment || "individual",
            topic:       postData.metadata.topic,
            audience:    postData.metadata.audience,
            tone:        postData.metadata.tone,
            summary:     extract.summary,
            keywords:    extract.keywords,
            style_notes: extract.style_notes || undefined,
          }).catch(() => {});
        }).catch(() => {});

        await postService.createPublished(
          {
            user_id: "demo-user", account_id: "personal-account",
            content: editedContent, topic: postData.metadata.topic,
            tone: postData.metadata.tone, audience: postData.metadata.audience,
            length: postData.metadata.length,
            custom_instructions: postData.metadata.customInstructions || undefined,
            segment: postData.metadata.segment || "individual",
            research_data: postData.research,
          },
          data.postId || "unknown",
          finalImageUrl || undefined
        );
      }
    } catch {
      setPublishStatus("error");
      setPublishMessage("Network error. Check your connection and try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSchedule = async (scheduledAt: Date, timezone: string, bestTimeApplied: boolean) => {
    if (!postData || isScheduling) return;
    setIsScheduling(true);
    setScheduleStatus("idle");
    try {
      // Use whatever image the user already chose (AI or upload), or none.
      // Image auto-generation happens in the background after saving — does NOT block scheduling.
      const immediateImageUrl: string | undefined = finalImageUrl || undefined;

      const saved = await postService.createScheduled(
        {
          user_id: "demo-user",
          account_id: "personal-account",
          content: editedContent,
          topic: postData.metadata.topic,
          tone: postData.metadata.tone,
          audience: postData.metadata.audience,
          length: postData.metadata.length,
          custom_instructions: postData.metadata.customInstructions || undefined,
          segment: postData.metadata.segment || "individual",
          research_data: postData.research,
          image_url: immediateImageUrl,
        },
        scheduledAt,
        timezone,
        bestTimeApplied
      );

      // Close modal and show success immediately
      setScheduleStatus("success");
      const label = scheduledAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      setScheduleMessage(`Scheduled for ${label} (${timezone}) · Generating image in background…`);
      setShowSchedulePicker(false);

      // Generate image in background and silently attach it to the saved post
      if (!immediateImageUrl && imagePrompt && saved?.id) {
        fetch("/api/image/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: imagePrompt }),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((d) => {
            if (d?.url && saved.id) {
              postService.updatePost(saved.id, { image_url: d.url }).catch(() => {});
              setScheduleMessage(`Scheduled for ${label} (${timezone}) · Image attached`);
            } else {
              setScheduleMessage(`Scheduled for ${label} (${timezone}) · Image generation failed — post will publish without image`);
            }
          })
          .catch(() => {
            setScheduleMessage(`Scheduled for ${label} (${timezone}) · Image generation failed — post will publish without image`);
          });
      } else {
        setScheduleMessage(`Scheduled for ${label} (${timezone})${immediateImageUrl ? " · Image attached" : ""}`);
      }
    } catch {
      setScheduleStatus("error");
      setScheduleMessage("Failed to schedule. Please try again.");
    } finally {
      setIsScheduling(false);
    }
  };

  if (!postData) return null;

  const isCorp = postData?.metadata?.segment === "corporate";

  return (
    <div className="flex h-full bg-slate-50">

      {/* ── Main area ── */}
      <div className="flex-1 p-8 overflow-auto border-r border-slate-200">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">Post Preview</h1>
            <div className="flex gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-sm font-medium border border-slate-200 text-slate-700 transition-all disabled:opacity-50"
              >
                <FileText className="w-4 h-4" />
                {isSaving ? "Saving..." : "Save Draft"}
              </button>

              <button
                onClick={() => setShowSchedulePicker(true)}
                disabled={scheduleStatus === "success"}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-sm font-semibold text-white transition-all disabled:opacity-50"
              >
                <CalendarDays className="w-4 h-4" />
                {scheduleStatus === "success" ? "Scheduled ✓" : "Schedule"}
              </button>

              {linkedInConnected === false ? (
                <a
                  href="/api/auth/linkedin?returnTo=/dashboard/create/preview"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0958A8] text-sm font-semibold text-white transition-all"
                >
                  <Linkedin className="w-4 h-4" />
                  Connect LinkedIn
                </a>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={isPublishing || publishStatus === "success"}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0958A8] text-sm font-semibold text-white transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isPublishing ? "Publishing..." : publishStatus === "success" ? "Published ✓" : "Publish to LinkedIn"}
                </button>
              )}
            </div>
          </div>

          {/* LinkedIn account banner */}
          {linkedInConnected === true && linkedInUser?.name && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              isCorp ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200"
            }`}>
              {isCorp ? (
                <div className="w-8 h-8 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                  <Linkedin className="w-4 h-4 text-violet-600" />
                </div>
              ) : (
                linkedInUser.picture && (
                  <img src={linkedInUser.picture} alt={linkedInUser.name} className="w-8 h-8 rounded-full shrink-0" />
                )
              )}
              <div>
                {isCorp ? (
                  <>
                    <p className="text-xs font-medium text-slate-700">Posting as <span className="text-violet-600 font-semibold">Company Page</span></p>
                    <p className="text-[11px] text-slate-400">Authorised by {linkedInUser.name}</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-medium text-slate-700">Posting as <span className="text-[#0A66C2] font-semibold">{linkedInUser.name}</span></p>
                    <p className="text-[11px] text-slate-400">{linkedInUser.email}</p>
                  </>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isCorp ? "bg-violet-500" : "bg-green-500"}`} />
                <span className={`text-[11px] font-medium ${isCorp ? "text-violet-600" : "text-green-600"}`}>
                  {isCorp ? "Corporate" : "Personal"}
                </span>
              </div>
            </div>
          )}

          {/* Publish status feedback */}
          {publishStatus === "success" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-medium">{publishMessage}</p>
            </div>
          )}
          {publishStatus === "error" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-600 font-medium">{publishMessage}</p>
            </div>
          )}

          {scheduleStatus === "success" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <CalendarDays className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm text-amber-800 font-semibold">Post Scheduled!</p>
                <p className="text-xs text-amber-600 mt-0.5">{scheduleMessage}</p>
              </div>
              <a href="/dashboard/schedule" className="ml-auto text-xs font-medium text-amber-700 hover:underline">
                View Calendar →
              </a>
            </div>
          )}
          {scheduleStatus === "error" && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-600 font-medium">{scheduleMessage}</p>
            </div>
          )}

          {/* ── Image Section ── */}
          <div className="card overflow-hidden">
            {/* Card header */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#0A66C2]" />
                <span className="text-xs font-medium text-slate-600">Post Image</span>
                {finalImageUrl && (
                  <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full font-medium">
                    Attached
                  </span>
                )}
              </div>
              {/* Download + Regenerate for AI mode */}
              {imageMode === "ai" && imageUrl && !isGeneratingImage && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadImage}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-xs text-slate-600 transition-all border border-slate-200"
                  >
                    <Download className="w-3 h-3" /> Download
                  </button>
                  <button
                    onClick={() => generateImage(imagePrompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-xs text-slate-600 transition-all border border-slate-200"
                  >
                    <RefreshCw className="w-3 h-3" /> Regenerate
                  </button>
                </div>
              )}
            </div>

            {/* Mode picker */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-1.5 mb-3">
                <p className="text-xs text-slate-500 font-medium">Add an image to your post</p>
                <HelpTooltip
                  text="LinkedIn posts with images get significantly higher reach. AI Generate creates a professional editorial photo based on your post content. Upload lets you use your own branded image. No Image keeps the post text-only."
                  example="Recommended: AI Generate for thought leadership posts, Upload for personal photos or branded graphics."
                  position="bottom"
                  width="w-72"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">

                {/* Option 1 — AI Generate */}
                <button
                  onClick={() => handleModeChange("ai")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "ai"
                      ? "border-[#0A66C2] bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${imageMode === "ai" ? "bg-[#0A66C2]" : "bg-slate-100"}`}>
                    <Sparkles className={`w-4.5 h-4.5 ${imageMode === "ai" ? "text-white" : "text-slate-500"}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${imageMode === "ai" ? "text-[#0A66C2]" : "text-slate-700"}`}>AI Generate</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Let Neel create a matching image</p>
                  </div>
                </button>

                {/* Option 2 — Upload */}
                <button
                  onClick={() => { handleModeChange("upload"); fileInputRef.current?.click(); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "upload"
                      ? "border-[#0A66C2] bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${imageMode === "upload" ? "bg-[#0A66C2]" : "bg-slate-100"}`}>
                    <Upload className={`w-4.5 h-4.5 ${imageMode === "upload" ? "text-white" : "text-slate-500"}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${imageMode === "upload" ? "text-[#0A66C2]" : "text-slate-700"}`}>Upload Image</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Use your own photo or graphic</p>
                  </div>
                </button>

                {/* Option 3 — No Image */}
                <button
                  onClick={() => handleModeChange("none")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "none"
                      ? "border-slate-400 bg-slate-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${imageMode === "none" ? "bg-slate-200" : "bg-slate-100"}`}>
                    <X className={`w-4.5 h-4.5 ${imageMode === "none" ? "text-slate-600" : "text-slate-400"}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${imageMode === "none" ? "text-slate-700" : "text-slate-500"}`}>No Image</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Text-only post</p>
                  </div>
                </button>

              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Image display area */}
            <div className="p-6 min-h-[160px] flex items-center justify-center bg-white">

              {/* AI mode — idle (not yet generated) */}
              {imageMode === "ai" && !isGeneratingImage && !imageUrl && !imageError && (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[#0A66C2]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Ready to generate your image</p>
                    <p className="text-xs text-slate-400 mt-1">Neel will create a professional image based on your post content</p>
                  </div>
                  <button
                    onClick={() => generateImage(imagePrompt)}
                    disabled={!imagePrompt}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0A66C2] hover:bg-[#0958A8] text-sm font-medium text-white transition-all disabled:opacity-40"
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate Image
                  </button>
                  {!imagePrompt && (
                    <p className="text-[11px] text-amber-600">No image prompt available. Regenerate the post first.</p>
                  )}
                </div>
              )}

              {/* AI mode — loading */}
              {imageMode === "ai" && isGeneratingImage && (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-7 h-7 border-2 border-[#0A66C2]/30 border-t-[#0A66C2] rounded-full animate-spin" />
                  <p className="text-xs">Generating image with AI...</p>
                </div>
              )}

              {/* AI mode — error */}
              {imageMode === "ai" && !isGeneratingImage && imageError && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                  <p className="text-sm text-red-500">{imageError}</p>
                  <button
                    onClick={() => generateImage(imagePrompt)}
                    className="text-xs text-[#0A66C2] hover:underline"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* AI mode — success */}
              {imageMode === "ai" && !isGeneratingImage && imageUrl && !imageError && (
                <div className="w-full">
                  <img
                    src={imageUrl}
                    alt="AI generated LinkedIn image"
                    className="w-full rounded-xl object-cover max-h-[400px]"
                  />
                  {imagePrompt && (
                    <p className="mt-3 text-[11px] text-slate-400 italic leading-relaxed line-clamp-2">
                      Prompt: {imagePrompt}
                    </p>
                  )}
                </div>
              )}

              {/* Upload mode — waiting for file */}
              {imageMode === "upload" && !uploadedPreview && (
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600">No image selected yet</p>
                    <p className="text-xs text-slate-400 mt-1">Click the Upload Image option above to choose a file</p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white text-sm font-medium text-slate-700 transition-all"
                  >
                    <Upload className="w-4 h-4" /> Choose File
                  </button>
                </div>
              )}

              {/* Upload mode — preview */}
              {imageMode === "upload" && uploadedPreview && (
                <div className="w-full">
                  <div className="relative">
                    <img
                      src={uploadedPreview}
                      alt="Uploaded image"
                      className="w-full rounded-xl object-cover max-h-[400px]"
                    />
                    <button
                      onClick={() => { setUploadedFile(null); setUploadedPreview(null); fileInputRef.current?.click(); }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all"
                      title="Replace image"
                    >
                      <RefreshCw className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 truncate">
                    {uploadedFile?.name}
                  </p>
                </div>
              )}

              {/* No image mode */}
              {imageMode === "none" && (
                <div className="flex flex-col items-center gap-3 text-center text-slate-400">
                  <ImageIcon className="w-8 h-8 text-slate-200" />
                  <p className="text-xs">This post will be published as text only.</p>
                </div>
              )}

            </div>
          </div>

          {/* Post Editor */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-medium text-slate-500">LinkedIn Post · Edit before publishing</span>
            </div>
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full h-[500px] p-6 bg-white text-slate-800 leading-relaxed text-base focus:outline-none resize-none"
              spellCheck={false}
            />
            <div className="px-6 pb-4 flex justify-between items-center border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-400">{editedContent.length} characters</span>
              <span className="text-[11px] text-slate-400">{editedContent.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

        </div>
      </div>

      {/* Schedule picker modal */}
      {showSchedulePicker && (
        <SchedulePicker
          segment={postData?.metadata?.segment || "individual"}
          userId="demo-user"
          isLoading={isScheduling}
          onCancel={() => setShowSchedulePicker(false)}
          onSchedule={handleSchedule}
        />
      )}

      {/* ── Research Sidebar ── */}
      <aside className="w-80 p-6 overflow-auto space-y-6 bg-white border-l border-slate-200">

        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Research Basis</p>
          <div className={`p-3 rounded-xl border ${isCorp ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200"}`}>
            <p className={`text-sm font-medium ${isCorp ? "text-violet-700" : "text-[#0A66C2]"}`}>
              {postData.metadata.topic}
            </p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-3">Core Insights</p>
          <div className="space-y-4">
            {postData.research.insights.map((insight: any, i: number) => (
              <div key={i} className="space-y-1">
                <p className="text-xs font-semibold text-slate-700">{insight.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{insight.content}</p>
              </div>
            ))}
          </div>
        </div>

        {postData.research.references?.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-3">Sources</p>
            <ul className="space-y-2">
              {postData.research.references.map((ref: string, i: number) => (
                <li key={i}>
                  <a
                    href={ref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[#0A66C2] hover:underline block truncate"
                  >
                    {ref}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-4 border-t border-slate-100">
          <Link
            href="/dashboard/create"
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to generator
          </Link>
        </div>

      </aside>
    </div>
  );
}
