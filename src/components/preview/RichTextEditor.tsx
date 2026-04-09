"use client";

import React, { useEffect, useRef } from "react";
import { htmlToLinkedInText } from "@/lib/utils/unicodeFormat";

interface RichTextEditorProps {
  value: string;
  onChange: (plain: string) => void;
  accentColor?: string;
  maxLength?: number;
  disabled?: boolean;
}

export default function RichTextEditor({
  value,
  onChange,
  accentColor = "#0A66C2",
  maxLength,
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialize content only on mount — never again (avoids cursor jump)
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerText = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function exec(command: string) {
    editorRef.current?.focus();
    document.execCommand(command, false);
  }

  function handleClearFormatting() {
    editorRef.current?.focus();
    document.execCommand('removeFormat', false);
    // Turn off list if active
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const container = sel.getRangeAt(0).commonAncestorContainer;
      const el = container.nodeType === 1 ? container as Element : container.parentElement;
      const inUl = el?.closest('ul');
      const inOl = el?.closest('ol');
      if (inUl) document.execCommand('insertUnorderedList', false);
      if (inOl) document.execCommand('insertOrderedList', false);
    }
    if (editorRef.current) {
      onChange(htmlToLinkedInText(editorRef.current.innerHTML));
    }
  }

  function handleInput() {
    if (editorRef.current) {
      onChange(htmlToLinkedInText(editorRef.current.innerHTML));
    }
  }

  const toolbarButtons = [
    { label: 'B', title: 'Bold', style: 'font-bold', action: () => exec('bold') },
    { label: 'I', title: 'Italic', style: 'italic', action: () => exec('italic') },
    { label: '•', title: 'Bullet List', style: '', action: () => exec('insertUnorderedList') },
    { label: '1.', title: 'Numbered List', style: '', action: () => exec('insertOrderedList') },
    { label: '✕', title: 'Clear Formatting', style: '', action: handleClearFormatting },
  ];

  return (
    <div className="relative">
      <div className="flex gap-1 mb-2">
        {toolbarButtons.map((btn) => (
          <button
            key={btn.title}
            type="button"
            title={btn.title}
            onMouseDown={(e) => {
              e.preventDefault(); // prevent blur
              btn.action();
            }}
            disabled={disabled}
            className={`px-2 py-1 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50 text-gray-700 disabled:opacity-40 ${btn.style}`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div
        ref={editorRef}
        contentEditable={disabled ? "false" : "true"}
        suppressContentEditableWarning
        onInput={handleInput}
        spellCheck={false}
        style={disabled ? { opacity: 0.6 } : undefined}
        className="w-full min-h-[280px] p-4 border border-gray-200 rounded-xl bg-white text-gray-900 text-sm leading-relaxed focus:outline-none focus:ring-2 overflow-auto"
        onFocus={(e) => {
          e.currentTarget.style.outlineColor = accentColor;
        }}
      />

      <div className="mt-1 flex justify-between text-[11px] text-gray-400">
        <span>
          {value.length}{maxLength ? ` / ${maxLength}` : ''} characters
        </span>
        <span>{value.split(/\s+/).filter(Boolean).length} words</span>
      </div>
    </div>
  );
}
