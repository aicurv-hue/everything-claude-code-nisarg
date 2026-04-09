"use client";

import React from "react";

interface LinkedInPostCardProps {
  name: string;
  avatarUrl: string;
  content: string;
  imageUrl?: string;
}

export default function LinkedInPostCard({
  name,
  avatarUrl,
  content,
  imageUrl,
}: LinkedInPostCardProps) {
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        LinkedIn Preview
      </p>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-4 pb-2 flex items-start gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{name || 'Your Name'}</p>
            <p className="text-xs text-gray-500">1st &middot; Now &middot; 🌐</p>
          </div>
          <span className="text-gray-400 text-base leading-none select-none">···</span>
        </div>

        {/* Body */}
        <div className="px-4 pb-3">
          <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">
            {content}
          </p>
        </div>

        {imageUrl && (
          <img
            src={imageUrl}
            alt="Post image"
            className="w-full aspect-[4/3] object-cover"
          />
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex justify-around">
          {[
            { icon: '👍', label: 'Like' },
            { icon: '💬', label: 'Comment' },
            { icon: '🔁', label: 'Repost' },
            { icon: '✉', label: 'Send' },
          ].map(({ icon, label }) => (
            <button
              key={label}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 py-1 px-2 rounded hover:bg-gray-50 transition-colors"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
