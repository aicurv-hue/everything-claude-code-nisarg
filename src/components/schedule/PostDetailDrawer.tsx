"use client";

import { useEffect, useState } from "react";
import {
  X, CalendarDays, Clock, Linkedin, AlertCircle, CheckCircle,
  Trash2, RotateCcw, Pencil, Save, Image as ImageIcon, XCircle,
  ExternalLink, Check, Send,
} from "lucide-react";
import { Post } from "@/lib/db/posts";
import SchedulePicker from "./SchedulePicker";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface Props {
  post: Post | null;
  onClose: () => void;
  onReschedule: (postId: string, newDate: Date, tz: string) => void;
  onDelete: (postId: string) => void;
  onPostNow?: (postId: string) => Promise<void>;
  segment: "individual" | "corporate";
}

function fmtDate(seconds?: number) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-amber-50 text-amber-400 border-amber-200",
  published: "bg-emerald-500/10 text-emerald-400 border-emerald-800/40",
  failed:    "bg-red-50 text-red-400 border-red-200",
  draft:     "bg-blue-500/10 text-blue-400 border-blue-800/40",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  scheduled: <CalendarDays className="w-3.5 h-3.5" />,
  published: <CheckCircle className="w-3.5 h-3.5" />,
  failed:    <AlertCircle className="w-3.5 h-3.5" />,
  draft:     <Clock className="w-3.5 h-3.5" />,
};

export default function PostDetailDrawer({ post, onClose, onReschedule, onDelete, onPostNow, segment }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPostingNow, setIsPostingNow] = useState(false);
  const [postNowError, setPostNowError] = useState<string | null>(null);
  const [postNowSuccess, setPostNowSuccess] = useState(false);

  // Edit state
  const [editing, setEditing]         = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editImageUrl, setEditImageUrl] = useState<string>("");
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [saved, setSaved]             = useState(false);

  // Reset edit state whenever the selected post changes
  useEffect(() => {
    setEditing(false);
    setSaveError(null);
    setSaved(false);
    setPostNowError(null);
    setPostNowSuccess(false);
    if (post) {
      setEditContent(post.content);
      setEditImageUrl(post.image_url || "");
    }
  }, [post?.id]);

  if (!post) return null;

  const isCorp    = segment === "corporate";
  const schedSecs = post.scheduled_at?.seconds;
  const pubSecs   = post.published_at?.seconds;
  const canEdit   = post.status === "scheduled" || post.status === "failed" || post.status === "draft";

  const charCount = editContent.length;
  const overLimit = charCount > 3000;

  const handleStartEdit = () => {
    setEditContent(post.content);
    setEditImageUrl(post.image_url || "");
    setSaveError(null);
    setSaved(false);
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!post.id || saving || overLimit) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const body: Record<string, any> = { id: post.id, content: editContent };
      // Only include image_url if it changed (allow clearing it too)
      if (editImageUrl !== (post.image_url || "")) {
        body.image_url = editImageUrl || null;
      }
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Save failed");
      }
      // Update the local post object so the read-only view reflects changes immediately
      post.content   = editContent;
      post.image_url = editImageUrl || undefined;
      setSaved(true);
      setEditing(false);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!post.id || isDeleting) return;
    if (!confirm("Delete this post?")) return;
    setIsDeleting(true);
    onDelete(post.id);
  };

  const handlePostNow = async () => {
    if (!post.id || isPostingNow || !onPostNow) return;
    if (!confirm("Post this to LinkedIn right now?")) return;
    setIsPostingNow(true);
    setPostNowError(null);
    try {
      await onPostNow(post.id);
      setPostNowSuccess(true);
    } catch (err: any) {
      setPostNowError(err?.message || "Failed to publish. Please try again.");
    } finally {
      setIsPostingNow(false);
    }
  };

  const imageToShow = editing ? editImageUrl : (post.image_url || "");

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full md:w-[420px] bg-[var(--card)] shadow-2xl z-50 flex flex-col drawer-enter">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-sub)] shrink-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLE[post.status] || STATUS_STYLE.draft}`}>
              {STATUS_ICON[post.status]}
              {post.status}
            </span>
            {saved && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canEdit && !editing && (
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--toggle-bg)] hover:bg-[var(--border)] text-[var(--text-sub)] text-xs font-medium transition-all"
                title="Edit post content and image"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[var(--toggle-bg)] flex items-center justify-center transition-all ml-1">
              <X className="w-4 h-4 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Topic */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold mb-1">Topic</p>
            <p className="text-sm font-semibold text-[var(--foreground)]">{post.topic || "—"}</p>
            <div className="flex items-center gap-3 mt-1.5">
              {post.tone && (
                <span className="text-[11px] bg-[var(--toggle-bg)] text-[var(--text-sub)] px-2 py-0.5 rounded-full capitalize">{post.tone}</span>
              )}
              {post.length && (
                <span className="text-[11px] bg-[var(--toggle-bg)] text-[var(--text-sub)] px-2 py-0.5 rounded-full capitalize">{post.length}</span>
              )}
              {post.segment && (
                <span className="text-[11px] bg-[var(--toggle-bg)] text-[var(--text-sub)] px-2 py-0.5 rounded-full capitalize">{post.segment}</span>
              )}
              {(post as any).authorDisplayName && post.segment === "corporate" && (
                <span className="text-[11px] bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-0.5 rounded-full font-medium">
                  Posted by {(post as any).authorDisplayName}
                </span>
              )}
            </div>
          </div>

          {/* Time info */}
          <div className="grid grid-cols-2 gap-3">
            {schedSecs && (
              <div className={`p-3 rounded-xl border ${isCorp ? "bg-violet-50 border-violet-200" : "bg-amber-50 border-amber-200"}`}>
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold mb-1">Scheduled</p>
                <p className={`text-xs font-semibold ${isCorp ? "text-violet-400" : "text-amber-400"}`}>{fmtDate(schedSecs)}</p>
                {post.schedule_timezone && (
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">{post.schedule_timezone}</p>
                )}
              </div>
            )}
            {pubSecs && (
              <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-800/40">
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold mb-1">Published</p>
                <p className="text-xs font-semibold text-emerald-400">{fmtDate(pubSecs)}</p>
              </div>
            )}
          </div>

          {/* LinkedIn live */}
          {post.linkedin_post_id && (
            <a
              href={`https://www.linkedin.com/feed/update/${post.linkedin_post_id}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-500/10 border border-blue-800/40 hover:bg-blue-100 transition-colors group"
            >
              <Linkedin className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-xs font-medium text-[var(--primary)] flex-1">Live on LinkedIn — view post</span>
              <ExternalLink className="w-3.5 h-3.5 text-[var(--primary)]/50 group-hover:text-[var(--primary)] transition-colors" />
            </a>
          )}

          {/* Failed notice */}
          {post.status === "failed" && (
            <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs font-semibold text-red-400">Failed to publish</p>
              </div>
              {(post as any).failed_reason && (
                <p className="text-[11px] text-red-500 pl-6 leading-snug">{(post as any).failed_reason}</p>
              )}
              <p className="text-[11px] text-red-400 pl-6">Edit if needed, then use Reschedule to retry.</p>
            </div>
          )}

          {/* ── IMAGE SECTION ── */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold mb-2">Linked Image</p>

            {editing ? (
              <div className="space-y-2">
                {/* Preview */}
                {editImageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editImageUrl} alt="Post image" className="w-full h-auto object-contain" />
                    <button
                      onClick={() => setEditImageUrl("")}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-all"
                      title="Remove image"
                    >
                      <XCircle className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-3 rounded-xl bg-[var(--card-hover)] border border-dashed border-[var(--border)]">
                    <ImageIcon className="w-4 h-4 text-[var(--text-muted)]" />
                    <span className="text-xs text-[var(--text-muted)]">No image — paste a URL below to add one</span>
                  </div>
                )}
                {/* URL input */}
                <input
                  type="url"
                  value={editImageUrl}
                  onChange={(e) => setEditImageUrl(e.target.value)}
                  placeholder="https://… (paste image URL or leave blank)"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] bg-[var(--card)] text-[var(--foreground)] placeholder-slate-400"
                />
              </div>
            ) : (
              imageToShow ? (
                <div className="rounded-xl overflow-hidden border border-[var(--border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageToShow} alt="Post image" className="w-full h-auto object-contain" />
                  {post.image_hook && (
                    <div className="px-3 py-2 bg-[var(--card-hover)] border-t border-[var(--border-sub)]">
                      <p className="text-[10px] text-[var(--text-muted)] font-medium uppercase tracking-wide mb-0.5">Image Hook</p>
                      <p className="text-xs text-[var(--text-sub)] italic">"{post.image_hook}"</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--card-hover)] border border-[var(--border)]">
                  <ImageIcon className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-muted)]">No image attached to this post</span>
                </div>
              )
            )}
          </div>

          {/* ── POST CONTENT ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)] font-semibold">Post Content</p>
              {editing && (
                <span className={`text-[11px] font-medium tabular-nums ${overLimit ? "text-red-500" : "text-[var(--text-muted)]"}`}>
                  {charCount} / 3000
                </span>
              )}
            </div>

            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className={`w-full text-sm text-[var(--foreground)] leading-relaxed bg-[var(--card)] border rounded-xl p-4 min-h-[220px] resize-y focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 transition-all ${
                  overLimit ? "border-red-300 focus:border-red-400" : "border-[var(--border)] focus:border-[#0A66C2]"
                }`}
                spellCheck
              />
            ) : (
              <div className="bg-[var(--card-hover)] border border-[var(--border)] rounded-xl p-4 text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                {post.content}
              </div>
            )}

            {saveError && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {saveError}
              </p>
            )}
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-[var(--border-sub)] space-y-2 shrink-0">

          {/* Edit mode buttons */}
          {editing ? (
            <div className="flex gap-2">
              <button
                onClick={handleCancelEdit}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-[var(--text-sub)] bg-[var(--toggle-bg)] hover:bg-[var(--border)] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || overLimit}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--primary)] hover:opacity-90 transition-all disabled:opacity-50"
              >
                {saving ? (
                  <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Saving…</>
                ) : (
                  <><Save className="w-4 h-4" /> Save Changes</>
                )}
              </button>
            </div>
          ) : (
            <>
              {(post.status === "scheduled" || post.status === "failed") && (
                <>
                  {/* Post Now */}
                  {onPostNow && !postNowSuccess && (
                    <button
                      onClick={handlePostNow}
                      disabled={isPostingNow}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-all disabled:opacity-50"
                    >
                      {isPostingNow ? (
                        <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Publishing…</>
                      ) : (
                        <><Send className="w-4 h-4" /> Post Now</>
                      )}
                    </button>
                  )}
                  {postNowSuccess && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-800/40">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <p className="text-xs font-medium text-emerald-400">Published to LinkedIn successfully!</p>
                    </div>
                  )}
                  {postNowError && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-400">{postNowError}</p>
                    </div>
                  )}
                  {/* Reschedule */}
                  <button
                    onClick={() => setShowPicker(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--card-hover)]"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reschedule
                  </button>
                </>
              )}

              {/* Repost — only for published posts */}
              {post.status === "published" && onPostNow && (
                <>
                  {postNowSuccess ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-800/40">
                      <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                      <p className="text-xs font-medium text-emerald-400">Reposted to LinkedIn successfully!</p>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={handlePostNow}
                        disabled={isPostingNow}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white bg-[var(--primary)] hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {isPostingNow ? (
                          <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> Reposting…</>
                        ) : (
                          <><RotateCcw className="w-4 h-4" /> Repost to LinkedIn</>
                        )}
                      </button>
                      {postNowError && (
                        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-red-400">{postNowError}</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Delete — hidden for published posts */}
              {post.status !== "published" && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-50 border border-red-200 transition-all disabled:opacity-40"
                >
                  <Trash2 className="w-4 h-4" />
                  {isDeleting ? "Deleting…" : "Delete Post"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reschedule picker */}
      {showPicker && post.id && (
        <SchedulePicker
          segment={segment}
          initialDate={schedSecs ? new Date(schedSecs * 1000) : undefined}
          onCancel={() => setShowPicker(false)}
          onSchedule={(dt, tz) => {
            onReschedule(post.id!, dt, tz);
            setShowPicker(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
