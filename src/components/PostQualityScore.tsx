"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { getAuthToken } from "@/lib/utils/getAuthToken";

type Breakdown = { hook: number; voiceMatch: number; structure: number; engagement: number; antiSlop: number };
type ScoreResult = {
  score: number;
  breakdown: Breakdown;
  suggestions: string[];
  rewrittenHook?: string;
};

type Props = {
  postText: string;
  userId: string;
  onApplyHook?: (newHook: string) => void;
};

const BREAKDOWN_MAX: Breakdown = { hook: 30, voiceMatch: 25, structure: 20, engagement: 15, antiSlop: 10 };
const BREAKDOWN_LABELS: Record<keyof Breakdown, string> = {
  hook:        "Hook",
  voiceMatch:  "Voice match",
  structure:   "Structure",
  engagement:  "Engagement",
  antiSlop:    "Anti-slop",
};

function colorFor(score: number): string {
  if (score <= 40) return "#ef4444"; // red
  if (score <= 70) return "#f59e0b"; // amber
  return "#10b981";                   // green
}

function labelFor(score: number): string {
  if (score <= 40) return "Needs work";
  if (score <= 70) return "Good draft";
  return "Strong post";
}

export default function PostQualityScore({ postText, userId, onApplyHook }: Props) {
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoScoreRef = useRef(false);

  const score = useCallback(async () => {
    if (!postText || postText.trim().length < 10) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/posts/score", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ postText }),
      });
      if (!res.ok) {
        setError("Cortex couldn't score this post.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as ScoreResult;
      setResult(data);
    } catch {
      setError("Network issue while scoring.");
    } finally {
      setLoading(false);
    }
  }, [postText]);

  useEffect(() => {
    if (didAutoScoreRef.current) return;
    if (!userId) return;
    if (!postText || postText.trim().length < 10) return;
    didAutoScoreRef.current = true;
    score();
  }, [userId, postText, score]);

  // Circle math
  const RADIUS = 42;
  const CIRC = 2 * Math.PI * RADIUS;
  const pct = result ? Math.max(0, Math.min(100, result.score)) / 100 : 0;
  const dash = CIRC * pct;
  const strokeColor = result ? colorFor(result.score) : "#6b7280";

  // Show rewritten hook whenever the model returned one (model only emits it when hook score < 20)
  const hookShort = Boolean(result?.rewrittenHook && result.rewrittenHook.trim().length > 0);

  return (
    <div className="card p-4 my-4 border border-[var(--border-sub)] rounded-xl bg-[var(--card)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--primary)]" />
          <span className="text-sm font-medium">Cortex Quality Score</span>
        </div>
        <button
          type="button"
          onClick={score}
          disabled={loading || !postText || postText.trim().length < 10}
          className="text-xs flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--border-sub)] hover:bg-[var(--card-hover)] disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Scoring..." : "Re-score"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {!result && !error && (
        <p className="text-xs text-[var(--text-muted)]">
          {loading ? "Cortex is reading your post..." : "Score will appear after Cortex reviews this draft."}
        </p>
      )}

      {result && (
        <div className="flex flex-col md:flex-row gap-5 items-start">
          {/* Circular gauge */}
          <div className="flex flex-col items-center shrink-0">
            <svg width="110" height="110" viewBox="0 0 110 110">
              <circle
                cx="55"
                cy="55"
                r={RADIUS}
                fill="none"
                stroke="rgba(127,127,127,0.18)"
                strokeWidth="10"
              />
              <circle
                cx="55"
                cy="55"
                r={RADIUS}
                fill="none"
                stroke={strokeColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRC - dash}`}
                transform="rotate(-90 55 55)"
                style={{ transition: "stroke-dasharray 600ms ease, stroke 300ms ease" }}
              />
              <text
                x="55"
                y="58"
                textAnchor="middle"
                fontSize="26"
                fontWeight="700"
                fill="var(--text)"
              >
                {result.score}
              </text>
              <text x="55" y="76" textAnchor="middle" fontSize="9" fill="var(--text-muted)">
                / 100
              </text>
            </svg>
            <span
              className="mt-1 text-[11px] font-medium"
              style={{ color: strokeColor }}
            >
              {labelFor(result.score)}
            </span>
          </div>

          {/* Breakdown bars */}
          <div className="flex-1 w-full space-y-2">
            {(Object.keys(BREAKDOWN_MAX) as (keyof Breakdown)[]).map((k) => {
              const max = BREAKDOWN_MAX[k];
              const val = result.breakdown[k] ?? 0;
              const ratio = Math.max(0, Math.min(1, val / max));
              return (
                <div key={k}>
                  <div className="flex justify-between text-[11px] text-[var(--text-muted)] mb-0.5">
                    <span>{BREAKDOWN_LABELS[k]}</span>
                    <span>
                      {val} / {max}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--card-hover)] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${ratio * 100}%`,
                        background: colorFor((val / max) * 100),
                        transition: "width 500ms ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {result && result.suggestions?.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-[var(--text-sub)] mb-1">Top suggestions</p>
          <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc pl-5">
            {result.suggestions.slice(0, 3).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {result && hookShort && result.rewrittenHook && (
        <div className="mt-3 p-3 rounded-lg border border-[var(--border-sub)] bg-[var(--card-hover)]">
          <p className="text-xs font-medium text-[var(--text-sub)] mb-1 flex items-center gap-1">
            <Wand2 className="w-3 h-3" /> Try this hook instead
          </p>
          <p className="text-xs whitespace-pre-line text-[var(--text)] mb-2">
            {result.rewrittenHook}
          </p>
          {onApplyHook && (
            <button
              type="button"
              onClick={() => onApplyHook(result.rewrittenHook!)}
              className="text-[11px] px-2 py-1 rounded-md bg-[var(--primary)] text-white hover:opacity-90"
            >
              Apply hook
            </button>
          )}
        </div>
      )}
    </div>
  );
}
