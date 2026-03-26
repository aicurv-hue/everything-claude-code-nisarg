"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type { Post } from "@/lib/db/posts";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Save, Send, ArrowLeft, CheckCircle, AlertCircle,
  Linkedin, FileText, User, Building2
} from "lucide-react";

export default function DraftEditPage() {
  const router  = useRouter();
  const params  = useParams();
  const draftId = params.id as string;

  const { user } = useAuth();
  const { segment, isCorporate, isIndividual } = useSegment();

  const [draft, setDraft]           = useState<Post | null>(null);
  const [content, setContent]       = useState("");
  const [isSaving, setIsSaving]     = useState(false);
  const [isPublishing, setPublishing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pubStatus, setPubStatus]   = useState<"idle" | "success" | "error">("idle");
  const [pubMessage, setPubMessage] = useState("");
  const [liConnected, setLiConnected] = useState<boolean | null>(null);
  const [liUser, setLiUser]         = useState<{ name: string; picture: string } | null>(null);
  const [notFound, setNotFound]     = useState(false);

  useEffect(() => {
    // Load draft from localStorage (set by drafts page on Edit click)
    const stored = localStorage.getItem("edit_draft");
    if (stored) {
      try {
        const parsed: Post = JSON.parse(stored);
        if (parsed.id === draftId) {
          setDraft(parsed);
          setContent(parsed.content);
          localStorage.removeItem("edit_draft");
          return;
        }
      } catch {}
    }

    // Fallback: load from API by ID
    (async () => {
      try {
        const token = auth.currentUser ? await getIdToken(auth.currentUser) : null;
        const res = await fetch(`/api/posts?id=${draftId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const found = (data.posts || []).find((p: Post) => p.id === draftId);
          if (found) { setDraft(found); setContent(found.content); }
          else setNotFound(true);
        } else { setNotFound(true); }
      } catch { setNotFound(true); }
    })();
  }, [draftId]);

  useEffect(() => {
    fetch("/api/linkedin/status")
      .then((r) => r.json())
      .then((d) => {
        setLiConnected(d.connected);
        if (d.connected) setLiUser({ name: d.name, picture: d.picture });
      })
      .catch(() => setLiConnected(false));
  }, []);

  const handleSave = async () => {
    if (!draft?.id || isSaving) return;
    setIsSaving(true);
    setSaveStatus("idle");
    try {
      const token = auth.currentUser ? await getIdToken(auth.currentUser) : null;
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: draft.id, content }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
      setDraft((prev) => prev ? { ...prev, content, updated_at: { seconds: Date.now() / 1000 } } : prev);
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!content.trim() || isPublishing) return;
    setPublishing(true);
    setPubStatus("idle");

    try {
      const res = await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          segment: draft?.segment || segment,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPubStatus("error");
        setPubMessage(data.error || "Publishing failed. Try again.");
      } else {
        setPubStatus("success");
        setPubMessage("Post published to LinkedIn! ✅");

        // Mark as published in DB via API
        if (draft?.id) {
          const token = auth.currentUser ? await getIdToken(auth.currentUser) : null;
          await fetch("/api/posts", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ id: draft.id, status: "published", linkedin_post_id: data.postId || "unknown" }),
          }).catch(() => {});
        }

        // Redirect to history after 2s
        setTimeout(() => router.push("/dashboard/history"), 2000);
      }
    } catch {
      setPubStatus("error");
      setPubMessage("Network error. Check your connection.");
    } finally {
      setPublishing(false);
    }
  };

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-slate-400">
        <FileText className="w-10 h-10 text-slate-300" />
        <p className="font-medium text-slate-600">Draft not found.</p>
        <Link href="/dashboard/drafts" className="text-[#0A66C2] text-sm hover:underline">← Back to Drafts</Link>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="w-6 h-6 border-2 border-[#0A66C2]/30 border-t-[#0A66C2] rounded-full animate-spin" />
      </div>
    );
  }

  const isCorp       = draft.segment === "corporate";
  const accentColor  = isCorp ? "text-violet-600" : "text-[#0A66C2]";
  const accentBg     = isCorp ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200";

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6 animate-fade-in">

      {/* Back + Header */}
      <div>
        <Link
          href="/dashboard/drafts"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-700 transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Drafts
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isCorp
                ? <Building2 className="w-4 h-4 text-violet-500" />
                : <User className="w-4 h-4 text-[#0A66C2]" />
              }
              <span className={`text-xs font-semibold capitalize ${accentColor}`}>
                {draft.segment} · {draft.tone}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Edit Draft</h1>
            <p className="text-slate-500 text-sm mt-0.5 line-clamp-1">Topic: {draft.topic}</p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleSave}
              disabled={isSaving || pubStatus === "success"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-sm font-medium text-slate-700 transition-all disabled:opacity-40"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : "Save Changes"}
            </button>

            {liConnected === false ? (
              <a
                href={`/api/auth/linkedin?returnTo=/dashboard/drafts&uid=${encodeURIComponent(user?.uid || "")}`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-sm font-medium text-white transition-all"
              >
                <Linkedin className="w-4 h-4" />
                Connect LinkedIn
              </a>
            ) : (
              <button
                onClick={handlePublish}
                disabled={isPublishing || pubStatus === "success"}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0854a0] text-sm font-medium text-white transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isPublishing ? "Publishing..." : pubStatus === "success" ? "Published ✓" : "Publish to LinkedIn"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LinkedIn account banner */}
      {liConnected && liUser && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isCorp ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200"}`}>
          {isCorp ? (
            <div className="w-7 h-7 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
              <Building2 className="w-3.5 h-3.5 text-violet-600" />
            </div>
          ) : (
            liUser.picture && <img src={liUser.picture} alt={liUser.name} className="w-7 h-7 rounded-full shrink-0" />
          )}
          <div>
            {isCorp ? (
              <p className="text-xs font-medium text-slate-700">Publishing as <span className="text-violet-600 font-semibold">Company Page</span></p>
            ) : (
              <p className="text-xs font-medium text-slate-700">Publishing as <span className="text-[#0A66C2] font-semibold">{liUser.name}</span></p>
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

      {/* Status alerts */}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-600">Failed to save. Try again.</p>
        </div>
      )}
      {pubStatus === "success" && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <p className="text-sm text-green-700">{pubMessage} Redirecting...</p>
        </div>
      )}
      {pubStatus === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-600">{pubMessage}</p>
        </div>
      )}

      {/* Editor */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500 capitalize">
            {draft.segment} Draft · Edit Mode
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-[460px] p-6 bg-white text-slate-800 leading-relaxed text-base focus:outline-none resize-none"
          spellCheck={false}
          placeholder="Your draft content..."
        />
        <div className="px-6 pb-3 flex justify-between items-center border-t border-slate-100 pt-3">
          <span className="text-[11px] text-slate-400">{content.length} characters</span>
          <span className="text-[11px] text-slate-400">{content.split(/\s+/).filter(Boolean).length} words</span>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Topic",      value: draft.topic    || "—" },
          { label: "Audience",   value: draft.audience || "—" },
          { label: "Tone",       value: draft.tone     || "—" },
          { label: "Length",     value: draft.length   || "—" },
          { label: "Created",    value: draft.created_at?.seconds ? new Date(draft.created_at.seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—" },
          { label: "Last Saved", value: draft.updated_at?.seconds ? new Date(draft.updated_at.seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not yet saved" },
        ].map((m) => (
          <div key={m.label} className={`p-3 rounded-xl border ${accentBg}`}>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-medium mb-1">{m.label}</p>
            <p className={`text-xs font-semibold ${accentColor} line-clamp-1`}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
