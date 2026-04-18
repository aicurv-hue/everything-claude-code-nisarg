"use client";
import React from "react";

export interface CampaignParams {
  name: string;
  topic: string;
  audience: string;
  tone: string;
  length: "short" | "medium" | "long";
  post_count: number;
  frequency_days: number;
  custom_instructions: string;
}

interface Props {
  value: CampaignParams;
  onChange: (v: CampaignParams) => void;
  onSubmit: () => void;
  loading?: boolean;
}

const inputClass = "w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all text-sm";
const labelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

export default function CampaignParamsForm({ value, onChange, onSubmit, loading }: Props) {
  const set = (k: keyof CampaignParams, v: any) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-5">
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[12px] text-blue-700 leading-relaxed">
        <strong>Define your campaign.</strong> Cortex will generate all posts in sequence, each taking a fresh angle on your topic. You can review and edit every post before scheduling.
      </div>

      <div>
        <label className={labelClass}>Campaign Name</label>
        <input value={value.name} onChange={e => set("name", e.target.value)} className={inputClass} placeholder="e.g. Q2 AI Leadership Series" />
      </div>

      <div>
        <label className={labelClass}>Topic / Product Focus</label>
        <textarea value={value.topic} onChange={e => set("topic", e.target.value)} rows={3} className={`${inputClass} resize-none`}
          placeholder="What is this campaign about? e.g. 'How AI is transforming supply chain management for mid-size manufacturers'" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Target Audience</label>
          <input value={value.audience} onChange={e => set("audience", e.target.value)} className={inputClass} placeholder="e.g. Supply chain managers" />
        </div>
        <div>
          <label className={labelClass}>Tone</label>
          <select value={value.tone} onChange={e => set("tone", e.target.value)} className={inputClass}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="inspirational">Inspirational</option>
            <option value="educational">Educational</option>
            <option value="thought-leadership">Thought Leadership</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Post Length</label>
          <select value={value.length} onChange={e => set("length", e.target.value as any)} className={inputClass}>
            <option value="short">Short (150–250 words)</option>
            <option value="medium">Medium (250–400 words)</option>
            <option value="long">Long (400–600 words)</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Number of Posts</label>
          <input type="number" min={2} max={10} value={value.post_count} onChange={e => set("post_count", Number(e.target.value))} className={inputClass} />
          <p className="text-[10px] text-slate-400 mt-1">2–10 posts per campaign</p>
        </div>
        <div>
          <label className={labelClass}>Posting Frequency</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={30} value={value.frequency_days} onChange={e => set("frequency_days", Number(e.target.value))} className={`${inputClass} flex-1`} />
            <span className="text-sm text-slate-500 shrink-0">days apart</span>
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>Custom Instructions <span className="normal-case font-normal text-slate-400">(optional)</span></label>
        <textarea value={value.custom_instructions} onChange={e => set("custom_instructions", e.target.value)} rows={2} className={`${inputClass} resize-none`}
          placeholder="Any specific angles, formats, or things to avoid across all posts..." />
      </div>

      <button
        onClick={onSubmit}
        disabled={loading || !value.name || !value.topic}
        className="w-full py-3 rounded-xl bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating {value.post_count} posts...</>
        ) : (
          <>Generate {value.post_count} Posts with AI &rarr;</>
        )}
      </button>
    </div>
  );
}
