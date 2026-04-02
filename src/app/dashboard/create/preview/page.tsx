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
  ArrowLeft, CalendarDays, RotateCcw, Wand2
} from "lucide-react";
import SchedulePicker from "@/components/schedule/SchedulePicker";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
// Memory is saved via /api/memory/save (server-side Admin SDK) — not client-side
import { uploadDataUrlToStorage } from "@/lib/storage/uploadImage";

type ImageMode = "ai" | "upload" | "none";

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
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ post }),
    });
    if (!res.ok) throw new Error("Failed to save post");
    return res.json();
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
      const storedProfileRegen = localStorage.getItem("client_profile");
      const imageStyleRegen = storedProfileRegen ? JSON.parse(storedProfileRegen).imageStyle : undefined;

      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic:              postData.metadata.topic,
          tone:               postData.metadata.tone,
          audience:           postData.metadata.audience,
          length:             postData.metadata.length,
          segment:            postData.metadata.segment,
          research:           postData.research,
          customInstructions: effectiveInstructions,
          imageStyle:         imageStyleRegen,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Regeneration failed");

      setEditedContent(data.post);
      setImagePrompt(data.imagePrompt);
      setImageUrl(null); // clear old generated image — prompt changed
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

      const res = await fetch("/api/ai/image-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const res = await fetch("/api/ai/image-hook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      // Create the Firestore post first so we have a postDbId to link memory to
      const postDbRecord = await createPost({
        user_id: user!.uid, account_id: "personal-account",
        status: "published",
        content: editedContent, topic: postData.metadata.topic,
        tone: postData.metadata.tone, audience: postData.metadata.audience,
        length: postData.metadata.length,
        custom_instructions: postData.metadata.customInstructions || undefined,
        segment: postData.metadata.segment || "individual",
        research_data: postData.research,
        image_url: finalImageUrl || undefined,
        image_hook: imageHook || undefined,
        published_at: new Date().toISOString(),
        created_at: null,
      });
      const postDbId = (postDbRecord as any)?.id || undefined;

      const res = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          content: editedContent,
          imageUrl: finalImageUrl || null,
          segment: postData.metadata.segment || "individual",
          organizationId: organizationId || undefined,
          topic:    postData.metadata.topic    || "",
          audience: postData.metadata.audience || "",
          tone:     postData.metadata.tone     || "professional",
          postDbId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPublishStatus("error");
        setPublishMessage(data.error || "Publishing failed. Please try again.");
        // Update the post we already created to draft status
        if (postDbId && authToken) {
          fetch("/api/posts", {
            method: "PATCH",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: postDbId, status: "draft" }),
          }).catch(() => {});
        }
      } else {
        setPublishStatus("success");
        setPublishMessage("Post published successfully to LinkedIn! 🎉");
        // Update the post with the LinkedIn post ID
        if (postDbId && authToken) {
          fetch("/api/posts", {
            method: "PATCH",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ id: postDbId, linkedin_post_id: data.postId || "unknown" }),
          }).catch(() => {});
        }
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
      let immediateImageUrl: string | undefined = undefined;
      if (finalImageUrl) {
        if (finalImageUrl.startsWith("data:")) {
          try {
            const uploadPromise = uploadDataUrlToStorage(finalImageUrl, `post-images/${Date.now()}.jpg`);
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));
            const uploaded = await Promise.race([uploadPromise, timeoutPromise]);
            immediateImageUrl = uploaded || undefined;
          } catch (uploadErr) {
            console.warn("[Schedule] Image upload error — scheduling without image:", uploadErr);
          }
        } else {
          immediateImageUrl = finalImageUrl;
        }
      }

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
        image_url: immediateImageUrl,
        image_hook: imageHook || undefined,
        scheduled_at: scheduledAt.toISOString(),
        schedule_timezone: timezone,
        best_time_applied: bestTimeApplied,
        created_at: null,
      });

      setScheduleStatus("success");
      const label = scheduledAt.toLocaleString("en-US", { timeZone: timezone, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
      const imageStatusMsg = imageMode === "ai" && !immediateImageUrl ? " · Generating image in background…" : immediateImageUrl ? " · Image attached" : "";
      setScheduleMessage(`Scheduled for ${label} (${timezone})${imageStatusMsg}`);
      setShowSchedulePicker(false);

      if (imageMode === "ai" && !immediateImageUrl && imagePrompt && saved?.id) {
        fetch("/api/image/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: imagePrompt }),
        })
          .then((r) => r.ok ? r.json() : null)
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
                onClick={() => linkedInConnected ? setShowSchedulePicker(true) : undefined}
                disabled={scheduleStatus === "success" || linkedInConnected === false}
                title={linkedInConnected === false ? "Connect LinkedIn first to schedule posts" : undefined}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CalendarDays className="w-4 h-4" />
                {scheduleStatus === "success" ? "Scheduled ✓" : "Schedule"}
              </button>

              {linkedInConnected === false ? (
                <a
                  href={`/api/auth/linkedin?returnTo=/dashboard/create/preview&uid=${encodeURIComponent(user?.uid || "")}`}
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

          {/* ── Setup required warning ── */}
          {(profileName === null || !linkedInConnected) && linkedInConnected !== null && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Complete setup before publishing</p>
                <div className="mt-1.5 space-y-1">
                  {!linkedInConnected && (
                    <p className="text-[11px] text-amber-700">
                      • <strong>LinkedIn not connected</strong> — required to publish or schedule.{" "}
                      <a href={`/api/auth/linkedin?returnTo=/dashboard/create/preview&uid=${encodeURIComponent(user?.uid || "")}`} className="underline font-semibold">Connect now →</a>
                    </p>
                  )}
                  {profileName === null && (
                    <p className="text-[11px] text-amber-700">
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

          {/* Corporate publishing restriction notice */}
          {isCorp && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">Company page publishing requires LinkedIn Partner approval</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  LinkedIn restricts the <code className="bg-amber-100 px-1 rounded">w_organization_social</code> scope to approved Marketing Developer Platform partners. Until approved, use <strong>Schedule</strong> — once the token is approved, scheduled posts will publish automatically. Scheduling works today.
                </p>
              </div>
            </div>
          )}

          {/* Status banners */}
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

          {/* ── Post Editor ── */}
          <div className="card overflow-hidden">
            {/* Card header with Regenerate controls */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">LinkedIn Post · Edit before publishing</span>
              <div className="flex items-center gap-2">
                {previousContent && (
                  <button
                    onClick={handleUndoPost}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
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
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white hover:bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${isRegeneratingPost ? "animate-spin" : ""}`} />
                  {isRegeneratingPost ? "Regenerating..." : "Regenerate Post"}
                </button>
              </div>
            </div>

            {/* Hint panel — expands when Regenerate is clicked */}
            {showRegenHint && !isRegeneratingPost && (
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 space-y-2">
                <p className="text-[11px] text-slate-500">
                  Give Neel a direction hint (optional) — e.g. <span className="italic">"make it shorter"</span>, <span className="italic">"more storytelling"</span>, <span className="italic">"less salesy"</span>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={regenHint}
                    onChange={(e) => setRegenHint(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRegeneratePost(); }}
                    placeholder="Direction hint (optional)..."
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-700 placeholder-slate-400"
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
                    className="px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-700 border border-slate-200 bg-white"
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

            {/* Textarea with loading overlay */}
            <div className="relative">
              {isRegeneratingPost && (
                <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10 gap-3">
                  <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${accentColor}40`, borderTopColor: accentColor }} />
                  <p className="text-sm text-slate-500 font-medium">Writing a new version...</p>
                  {regenHint && <p className="text-xs text-slate-400 italic">"{regenHint}"</p>}
                </div>
              )}
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                disabled={isRegeneratingPost}
                className="w-full h-[500px] p-6 bg-white text-slate-800 leading-relaxed text-base focus:outline-none resize-none disabled:opacity-60"
                spellCheck={false}
              />
            </div>
            <div className="px-6 pb-4 flex justify-between items-center border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-400">{editedContent.length} characters</span>
              <span className="text-[11px] text-slate-400">{editedContent.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          {/* ── Image Section ── */}
          <div className="card overflow-hidden">
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
              <div className="flex items-center gap-2">
                {/* Undo image prompt */}
                {previousImagePrompt && (
                  <button
                    onClick={handleUndoImagePrompt}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700 transition-colors"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-xs text-slate-600 transition-all border border-slate-200 disabled:opacity-50"
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
                  </>
                )}
              </div>
            </div>

            {/* Image prompt preview + error */}
            {imageMode === "ai" && imagePrompt && (
              <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-start gap-2">
                <Sparkles className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-slate-400 italic leading-relaxed flex-1 line-clamp-2">{imagePrompt}</p>
              </div>
            )}
            {regenImageError && imageMode === "ai" && (
              <div className="px-5 py-2 border-b border-red-100 bg-red-50 flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                <p className="text-[11px] text-red-500">{regenImageError}</p>
              </div>
            )}

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
                <button
                  onClick={() => handleModeChange("ai")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "ai" ? "border-[#0A66C2] bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
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

                <button
                  onClick={() => { handleModeChange("upload"); fileInputRef.current?.click(); }}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "upload" ? "border-[#0A66C2] bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
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

                <button
                  onClick={() => handleModeChange("none")}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                    imageMode === "none" ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
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

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>

            {/* Image display area */}
            <div className="p-6 min-h-[160px] flex items-center justify-center bg-white">
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
                    disabled={!imagePrompt || isRegeneratingImage}
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

              {imageMode === "ai" && isGeneratingImage && (
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <div className="w-7 h-7 border-2 border-[#0A66C2]/30 border-t-[#0A66C2] rounded-full animate-spin" />
                  <p className="text-xs">Generating image with AI...</p>
                </div>
              )}

              {imageMode === "ai" && !isGeneratingImage && imageError && (
                <div className="flex flex-col items-center gap-3 text-center">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                  <p className="text-sm text-red-500">{imageError}</p>
                  <button onClick={() => generateImage(imagePrompt)} className="text-xs text-[#0A66C2] hover:underline">Try again</button>
                </div>
              )}

              {imageMode === "ai" && !isGeneratingImage && imageUrl && !imageError && (
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

              {imageMode === "upload" && uploadedPreview && (
                <div className="w-full">
                  <div className="relative">
                    <img src={uploadedPreview} alt="Uploaded image" className="w-full rounded-xl object-cover aspect-square" />
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
                      onClick={() => { setUploadedFile(null); setUploadedPreview(null); fileInputRef.current?.click(); }}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-all"
                      title="Replace image"
                    >
                      <RefreshCw className="w-3 h-3 text-slate-500" />
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 truncate">{uploadedFile?.name}</p>
                </div>
              )}

              {imageMode === "none" && (
                <div className="flex flex-col items-center gap-3 text-center text-slate-400">
                  <ImageIcon className="w-8 h-8 text-slate-200" />
                  <p className="text-xs">This post will be published as text only.</p>
                </div>
              )}
            </div>

            {/* ── Hook text overlay editor (Layer 2) ── */}
            {imageMode !== "none" && finalImageUrl && (
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Image Hook Text
                    </label>
                    <p className="text-[10px] text-slate-400 mt-0.5">Overlaid on the image. 7 words max. Leave blank to hide.</p>
                  </div>
                  <button
                    onClick={generateHook}
                    disabled={isGeneratingHook}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-xs text-slate-600 border border-slate-200 transition-all disabled:opacity-50"
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
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-[#0A66C2]/30 text-slate-700 placeholder-slate-400"
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
                  <a href={ref} target="_blank" rel="noreferrer" className="text-xs text-[#0A66C2] hover:underline block truncate">
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
