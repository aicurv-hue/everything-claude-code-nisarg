"use client";

import { useState } from "react";
import { X, CalendarDays, Clock, Linkedin, AlertCircle, CheckCircle, Trash2, RotateCcw } from "lucide-react";
import { Post } from "@/lib/db/posts";
import SchedulePicker from "./SchedulePicker";

interface Props {
  post: Post | null;
  onClose: () => void;
  onReschedule: (postId: string, newDate: Date, tz: string) => void;
  onDelete: (postId: string) => void;
  segment: "individual" | "corporate";
}

function fmtDate(seconds?: number) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-amber-50 text-amber-700 border-amber-200",
  published: "bg-green-50 text-green-700 border-green-200",
  failed:    "bg-red-50 text-red-700 border-red-200",
  draft:     "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  scheduled: <CalendarDays className="w-3.5 h-3.5" />,
  published: <CheckCircle className="w-3.5 h-3.5" />,
  failed:    <AlertCircle className="w-3.5 h-3.5" />,
  draft:     <Clock className="w-3.5 h-3.5" />,
};

export default function PostDetailDrawer({ post, onClose, onReschedule, onDelete, segment }: Props) {
  const [showPicker, setShowPicker] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!post) return null;

  const isCorp = segment === "corporate";
  const schedSecs = post.scheduled_at?.seconds;
  const pubSecs   = post.published_at?.seconds;

  const handleDelete = async () => {
    if (!post.id || isDeleting) return;
    if (!confirm("Delete this post?")) return;
    setIsDeleting(true);
    onDelete(post.id);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[380px] bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLE[post.status] || STATUS_STYLE.draft}`}>
              {STATUS_ICON[post.status]}
              {post.status}
            </span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Topic */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Topic</p>
            <p className="text-sm font-semibold text-slate-800">{post.topic || "—"}</p>
          </div>

          {/* Time info */}
          <div className="grid grid-cols-2 gap-3">
            {schedSecs && (
              <div className={`p-3 rounded-xl border ${isCorp ? "bg-violet-50 border-violet-200" : "bg-amber-50 border-amber-200"}`}>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Scheduled</p>
                <p className={`text-xs font-semibold ${isCorp ? "text-violet-700" : "text-amber-700"}`}>{fmtDate(schedSecs)}</p>
                {post.schedule_timezone && (
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">{post.schedule_timezone}</p>
                )}
              </div>
            )}
            {pubSecs && (
              <div className="p-3 rounded-xl border bg-green-50 border-green-200">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Published</p>
                <p className="text-xs font-semibold text-green-700">{fmtDate(pubSecs)}</p>
              </div>
            )}
            <div className={`p-3 rounded-xl border bg-slate-50 border-slate-200 ${!schedSecs && !pubSecs ? "col-span-2" : ""}`}>
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Tone</p>
              <p className="text-xs font-medium text-slate-700 capitalize">{post.tone}</p>
            </div>
          </div>

          {/* LinkedIn live badge */}
          {post.linkedin_post_id && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200">
              <Linkedin className="w-4 h-4 text-[#0A66C2]" />
              <span className="text-xs font-medium text-[#0A66C2]">Live on LinkedIn</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse ml-auto" />
            </div>
          )}

          {/* Failed notice */}
          {post.status === "failed" && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-600">This post failed to publish. Reschedule to try again.</p>
            </div>
          )}

          {/* Post content */}
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-2">Post Content</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {post.content}
            </div>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-slate-100 space-y-2">
          {(post.status === "scheduled" || post.status === "failed") && (
            <button
              onClick={() => setShowPicker(true)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${
                isCorp ? "bg-violet-600 hover:bg-violet-700" : "bg-[#0A66C2] hover:bg-[#0854a0]"
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              Reschedule
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-all disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? "Deleting…" : "Delete Post"}
          </button>
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
