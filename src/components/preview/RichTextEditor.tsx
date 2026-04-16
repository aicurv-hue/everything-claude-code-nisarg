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
  const isTypingRef = useRef(false);

  // Initialize on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerText = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. regenerate) into the DOM
  useEffect(() => {
    if (!editorRef.current || isTypingRef.current) return;
    if (editorRef.current.innerText !== value) {
      editorRef.current.innerText = value;
    }
  }, [value]);

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
    isTypingRef.current = true;
    if (editorRef.current) {
      onChange(htmlToLinkedInText(editorRef.current.innerHTML));
    }
    // Reset after a short delay so external updates (regenerate) can still sync
    setTimeout(() => { isTypingRef.current = false; }, 500);
  }

  const toolbarGroups = [
    [
      { label: 'B', title: 'Bold', style: 'font-bold text-[13px]', action: () => exec('bold') },
      { label: 'I', title: 'Italic', style: 'italic text-[13px]', action: () => exec('italic') },
    ],
    [
      { label: '• List', title: 'Bullet List', style: 'text-[11px]', action: () => exec('insertUnorderedList') },
      { label: '1. List', title: 'Numbered List', style: 'text-[11px]', action: () => exec('insertOrderedList') },
    ],
    [
      { label: 'Clear', title: 'Clear Formatting', style: 'text-[11px] text-red-400 hover:text-red-600 hover:border-red-200', action: handleClearFormatting },
    ],
  ];

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 mb-3 px-1 pb-3 border-b border-slate-100">
        {toolbarGroups.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && <span className="w-px h-5 bg-slate-200 mx-0.5 flex-shrink-0" />}
            {group.map((btn) => (
              <button
                key={btn.title}
                type="button"
                title={btn.title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  btn.action();
                }}
                disabled={disabled}
                className={`min-w-[36px] px-2.5 py-1.5 font-medium rounded-md border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-colors disabled:opacity-40 ${btn.style}`}
              >
                {btn.label}
              </button>
            ))}
          </React.Fragment>
        ))}
        <span className="ml-auto text-[11px] text-slate-400 select-none">Formatting</span>
      </div>

      <div
        ref={editorRef}
        contentEditable={disabled ? "false" : "true"}
        suppressContentEditableWarning
        onInput={handleInput}
        spellCheck={false}
        style={disabled ? { opacity: 0.6 } : undefined}
        className="w-full min-h-[300px] px-1 py-2 bg-white text-gray-900 text-sm leading-relaxed focus:outline-none overflow-auto"
      />

      <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between text-[11px] text-gray-400">
        <span>
          {value.length}{maxLength ? ` / ${maxLength} characters` : ' characters'}
        </span>
        <span>{value.split(/\s+/).filter(Boolean).length} words</span>
      </div>
    </div>
  );
}
