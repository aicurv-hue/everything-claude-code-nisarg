"use client";

import { useState } from "react";
import { Sparkles, Check, X, RefreshCw } from "lucide-react";

interface Props {
  field: string;
  value: string | undefined;
  context: Record<string, string>;
  profileType: string;
  onApply: (value: string) => void;
  /** Override button label. Default: "Rewrite with AI for best results" */
  buttonLabel?: string;
}

export function ProfileAIAssist({ field, value, context, profileType, onApply, buttonLabel }: Props) {
  const [loading, setLoading]         = useState(false);
  const [suggestion, setSuggestion]   = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  // Only render when the field has content
  if (!value?.trim()) return null;

  const handleEnhance = async () => {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/ai/profile-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value, context, profileType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI enhancement failed");
      setSuggestion(data.enhanced);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (suggestion) {
      onApply(suggestion);
      setSuggestion(null);
    }
  };

  return (
    <div className="mt-2">
      {/* Activate button — shown when no suggestion yet */}
      {!suggestion && (
        <button
          onClick={handleEnhance}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:text-[#0854a0] bg-blue-500/10 hover:bg-blue-100 border border-blue-800/40 px-3 py-1.5 rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-pulse" : ""}`} />
          {loading ? "Enhancing with AI…" : (buttonLabel ?? "Rewrite with AI for best results")}
        </button>
      )}

      {/* Error state */}
      {error && !loading && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <X className="w-3 h-3" /> {error} —{" "}
          <button onClick={handleEnhance} className="underline hover:no-underline">try again</button>
        </p>
      )}

      {/* Suggestion box */}
      {suggestion && (
        <div className="mt-2 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-800/40 rounded-xl p-4 animate-fade-in">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
            <p className="text-[10px] font-bold text-[var(--primary)] uppercase tracking-wider">AI Suggestion</p>
          </div>

          <p className="text-sm text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{suggestion}</p>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-800/40/60">
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--primary)] hover:opacity-90 px-3 py-1.5 rounded-lg transition-all"
            >
              <Check className="w-3.5 h-3.5" /> Use this
            </button>
            <button
              onClick={() => setSuggestion(null)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--foreground)] bg-[var(--card)] hover:bg-[var(--card-hover)] border border-[var(--border)] px-3 py-1.5 rounded-lg transition-all"
            >
              <X className="w-3 h-3" /> Dismiss
            </button>
            <button
              onClick={handleEnhance}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--primary)] ml-auto transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
