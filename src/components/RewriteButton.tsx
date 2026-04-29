"use client";

import React, { useState } from "react";
import { Wand2, X, Loader2 } from "lucide-react";
import { getAuthToken } from "@/lib/utils/getAuthToken";

type Props = {
  postText: string;
  userId: string;
  voiceProfile?: any;
  writingSamples?: any;
  memoryContext?: any;
  onApply: (rewritten: string) => void;
  label?: string;
};

type RewriteResponse = {
  rewrittenPost: string;
  score: number;
  changes: string[];
};

function scoreColor(score: number): string {
  if (score >= 71) return "bg-green-500/15 text-green-400 border-green-700/40";
  if (score >= 41) return "bg-yellow-500/15 text-yellow-400 border-yellow-700/40";
  return "bg-red-500/15 text-red-400 border-red-700/40";
}

export default function RewriteButton({
  postText,
  userId,
  voiceProfile,
  writingSamples,
  memoryContext,
  onApply,
  label = "Rewrite in my voice",
}: Props) {
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [result, setResult]           = useState<RewriteResponse | null>(null);

  const runRewrite = async () => {
    if (!postText || postText.trim().length < 5) {
      setError("Add some text first.");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/posts/rewrite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rawText: postText,
          userId,
          voiceProfile,
          writingSamples,
          memoryContext,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Rewrite failed (${res.status})`);
      }
      const data: RewriteResponse = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Rewrite failed.");
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setOpen(true);
    setResult(null);
    setError(null);
    runRewrite();
  };

  const close = () => {
    if (loading) return;
    setOpen(false);
  };

  const apply = () => {
    if (result?.rewrittenPost) onApply(result.rewrittenPost);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={loading || !postText || postText.trim().length < 5}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card-hover)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--card)] hover:border-[#0A66C2]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        title="Rewrite this text in your voice using Cortex"
      >
        <Wand2 className="w-3.5 h-3.5 text-[#0A66C2]" />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={close}
        >
          <div
            className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-[#0A66C2]" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Rewrite in my voice</h3>
                <span className="text-[11px] text-[var(--text-muted)]">Cortex</span>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-[var(--card-hover)] text-[var(--text-muted)] disabled:opacity-50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {loading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-[var(--text-muted)]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0A66C2]" />
                  <p className="text-sm">Cortex is rewriting in your voice...</p>
                </div>
              )}

              {error && !loading && (
                <div className="rounded-lg border border-red-700/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              {result && !loading && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-wide font-semibold text-[var(--text-muted)]">Original</div>
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--card-hover)] p-4 text-sm text-[var(--foreground)] whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto">
                        {postText}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-wide font-semibold text-[var(--text-muted)]">Rewritten</div>
                      <div className="rounded-lg border border-[#0A66C2]/40 bg-[#0A66C2]/5 p-4 text-sm text-[var(--foreground)] whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto">
                        {result.rewrittenPost}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold ${scoreColor(result.score)}`}
                    >
                      Quality score: {result.score}/100
                    </span>
                    {result.changes.length > 0 && (
                      <span className="text-[11px] text-[var(--text-muted)]">{result.changes.length} edits</span>
                    )}
                  </div>

                  {result.changes.length > 0 && (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--card-hover)] p-4">
                      <div className="text-[11px] uppercase tracking-wide font-semibold text-[var(--text-muted)] mb-2">
                        What changed
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-[var(--foreground)]">
                        {result.changes.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border)] bg-[var(--card-hover)]/40">
              <button
                type="button"
                onClick={close}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--card-hover)] disabled:opacity-50"
              >
                Keep original
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={loading || !result?.rewrittenPost}
                className="px-4 py-2 rounded-lg bg-[#0A66C2] hover:bg-[#0A66C2]/90 text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Use this
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
