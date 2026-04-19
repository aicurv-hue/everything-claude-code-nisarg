"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getAuthToken } from "@/lib/utils/getAuthToken";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Post } from "@/lib/db/posts";
import { useSegment } from "@/lib/context/segment";
import { useAuth } from "@/lib/context/auth";
import { FileText, Clock, Edit3, Trash2, Send, RefreshCw } from "lucide-react";

export default function DraftsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { segment, isIndividual, isCorporate, segmentReady } = useSegment();
  const [drafts, setDrafts]     = useState<Post[]>([]);
  const [loading, setLoading]   = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const accentColor = isCorporate ? "text-violet-400" : "text-[var(--primary)]";
  const accentBg    = isCorporate ? "bg-violet-500/10 border-violet-800/40" : "bg-blue-500/10 border-blue-800/40";
  const accentBadge = isCorporate ? "bg-violet-500/10 text-violet-400 border-violet-800/40" : "bg-blue-500/10 text-blue-400 border-blue-800/40";

  const loadDrafts = useCallback(async () => {
    if (!segmentReady) return;
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) { setDrafts([]); return; }
      const res = await fetch(`/api/posts?segment=${segment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const all: Post[] = data.posts || [];
      setDrafts(
        all
          .filter((p) => p.status === "draft")
          .sort((a, b) => (b.created_at?.seconds ?? 0) - (a.created_at?.seconds ?? 0))
      );
    } catch (err) {
      console.error("Error loading drafts:", err);
    } finally {
      setLoading(false);
    }
  }, [segment, user, segmentReady]);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  // B2: Re-fetch when user returns to this tab (e.g. after publishing a draft)
  useEffect(() => {
    const handler = () => { if (!document.hidden) loadDrafts(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [loadDrafts]);

  const handleEdit = (draft: Post) => {
    localStorage.setItem("edit_draft", JSON.stringify(draft));
    router.push(`/dashboard/drafts/${draft.id}/edit`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch("/api/posts", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setDrafts((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Drafts</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {drafts.length} draft{drafts.length !== 1 ? "s" : ""} · {isIndividual ? "personal profile" : "company page"}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={loadDrafts}
            className="w-8 h-8 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--card-hover)] transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
          <Link
            href="/dashboard/create"
            className="px-4 py-2 bg-[var(--primary)] hover:opacity-90 text-white font-medium rounded-lg transition-all text-sm"
          >
            + Create Post
          </Link>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-48 animate-pulse p-5 space-y-3">
              <div className="h-3 w-1/4 bg-[var(--toggle-bg)] rounded" />
              <div className="h-3 w-3/4 bg-[var(--toggle-bg)] rounded" />
              <div className="h-3 w-1/2 bg-[var(--toggle-bg)] rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && drafts.length === 0 && (
        <div className={`card p-14 text-center border-2 border-dashed border-[var(--border)]`}>
          <FileText className="w-9 h-9 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm font-medium text-[var(--text-sub)] mb-1">
            No {isIndividual ? "personal" : "corporate"} drafts yet
          </p>
          <p className="text-xs text-[var(--text-muted)] mb-5">
            Posts you generate but don't publish will appear here.
          </p>
          <Link
            href="/dashboard/create"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${accentBg} ${accentColor}`}
          >
            Generate your first post →
          </Link>
        </div>
      )}

      {/* Draft grid */}
      {!loading && drafts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {drafts.map((draft) => (
            <div
              key={draft.id}
              className="card p-5 flex flex-col hover:shadow-md transition-shadow"
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border capitalize ${accentBadge}`}>
                    {draft.tone}
                  </span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border bg-[var(--card-hover)] text-[var(--text-muted)] border-[var(--border)] capitalize">
                    {draft.segment}
                  </span>
                  {draft.campaign_id && (
                    <Link
                      href={`/dashboard/campaigns/${draft.campaign_id}`}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-violet-500/10 text-violet-400 border-violet-800/40 hover:bg-violet-500/20 transition-colors"
                      onClick={e => e.stopPropagation()}
                    >
                      Campaign
                    </Link>
                  )}
                </div>
                <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {draft.created_at?.seconds
                    ? new Date(draft.created_at.seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </span>
              </div>

              {/* Topic */}
              <p className={`text-xs font-semibold mb-2 ${accentColor} line-clamp-1`}>
                {draft.topic}
              </p>

              {/* Content preview */}
              <p className="text-sm text-[var(--text-sub)] line-clamp-3 leading-relaxed flex-1">
                {draft.content}
              </p>

              {/* Actions */}
              <div className="mt-4 pt-3 border-t border-[var(--border-sub)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(draft)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card-hover)] hover:bg-[var(--toggle-bg)] text-xs font-medium text-[var(--text-sub)] hover:text-[var(--foreground)] transition-all border border-[var(--border)]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(draft.id!)}
                    disabled={deleting === draft.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--card-hover)] hover:bg-red-500/10 text-xs font-medium text-[var(--text-muted)] hover:text-red-500 transition-all border border-[var(--border)] disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleting === draft.id ? "..." : "Delete"}
                  </button>
                </div>
                <button
                  onClick={() => handleEdit(draft)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--primary)] hover:opacity-90 text-xs font-medium text-white transition-all"
                >
                  <Send className="w-3 h-3" />
                  Open & Publish
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
