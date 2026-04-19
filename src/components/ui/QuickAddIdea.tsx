"use client";

import { useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useSegment } from "@/lib/context/segment";
import { getAuthToken } from "@/lib/utils/getAuthToken";

export default function QuickAddIdea() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const { segment } = useSegment();

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const token = await getAuthToken();
      await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), segment, source: "manual" }),
      });
      setTitle("");
      setOpen(false);
    } catch (err) {
      console.error("[QuickAddIdea]", err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 md:bottom-6 md:right-6 z-40 w-12 h-12 rounded-full bg-[var(--primary)] text-white shadow-lg flex items-center justify-center hover:opacity-90 transition-colors"
        title="Quick add idea"
      >
        <Lightbulb className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-5 md:bottom-6 md:right-6 z-50 w-80 bg-[var(--card)] rounded-xl shadow-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-900">Quick Add Idea</span>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        placeholder="e.g. Why most founders ignore their best channel"
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/30 focus:border-[#0A66C2]"
        autoFocus
      />
      <button
        onClick={handleSave}
        disabled={saving || !title.trim()}
        className="mt-3 w-full py-2 rounded-lg text-sm font-semibold bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving..." : "Save Idea"}
      </button>
    </div>
  );
}
