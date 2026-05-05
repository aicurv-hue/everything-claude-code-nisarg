"use client";

import React from "react";

interface LinkedInPostCardProps {
  name: string;
  avatarUrl: string;
  content: string;
  imageUrl?: string;
  imageHook?: string;
  isUploadedImage?: boolean;
  isCompany?: boolean;
  carouselUrls?: string[];      // 2–10 image URLs for carousel preview
  carouselTitle?: string;
}

export default function LinkedInPostCard({
  name,
  avatarUrl,
  content,
  imageUrl,
  imageHook,
  isUploadedImage = false,
  isCompany = false,
  carouselUrls,
  carouselTitle,
}: LinkedInPostCardProps) {
  const isCarousel = Array.isArray(carouselUrls) && carouselUrls.length >= 2;
  const initials = name
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const avatarShape = isCompany ? 'rounded-md' : 'rounded-full';

  return (
    <div>
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-2">
        LinkedIn Preview
      </p>
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-4 pb-2 flex items-start gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className={`w-10 h-10 ${avatarShape} object-cover flex-shrink-0`}
            />
          ) : (
            <div className={`w-10 h-10 ${avatarShape} ${isCompany ? 'bg-violet-100 text-violet-400' : 'bg-[var(--border)] text-[var(--text-sub)]'} flex items-center justify-center text-xs font-semibold flex-shrink-0`}>
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-[var(--foreground)] truncate">{name || 'Your Name'}</p>
            <p className="text-xs text-[var(--text-sub)]">1st &middot; Now &middot; 🌐</p>
          </div>
          <span className="text-[var(--text-muted)] text-base leading-none select-none">···</span>
        </div>

        {/* Body */}
        <div className="px-4 pb-3">
          <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap break-words">
            {content}
          </p>
        </div>

        {isCarousel && (
          <div className="w-full bg-[var(--card-hover)] border-y border-[var(--border)]">
            {carouselTitle && (
              <p className="px-4 py-2 text-xs font-semibold text-[var(--foreground)] truncate">
                {carouselTitle}
              </p>
            )}
            <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-thin">
              {carouselUrls!.slice(0, 10).map((url, i) => (
                <div key={i} className="relative w-full flex-shrink-0 snap-center aspect-square">
                  <img
                    src={url}
                    alt={`Slide ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
                    {i + 1} / {carouselUrls!.length}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isCarousel && imageUrl && (
          <div className={`w-full relative ${isUploadedImage ? "" : "aspect-square"}`}>
            <img
              src={imageUrl}
              alt="Post image"
              className={`w-full ${isUploadedImage ? "object-contain max-h-[600px]" : "h-full object-cover"}`}
            />
            {imageHook && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(105deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 38%, transparent 58%)" }}
              >
                <p
                  className="absolute top-4 left-4 text-white leading-[1.12]"
                  style={{
                    width: "44%",
                    fontFamily: "'Plus Jakarta Sans', Inter, sans-serif",
                    fontWeight: 800,
                    fontSize: "clamp(0.85rem, 2.8vw, 1.4rem)",
                    letterSpacing: "-0.02em",
                    textShadow: "0 2px 16px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.95)",
                  }}
                >
                  {imageHook}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--border)] flex justify-around">
          {[
            { icon: '👍', label: 'Like' },
            { icon: '💬', label: 'Comment' },
            { icon: '🔁', label: 'Repost' },
            { icon: '✉', label: 'Send' },
          ].map(({ icon, label }) => (
            <button
              key={label}
              className="flex items-center gap-1 text-xs text-[var(--text-sub)] hover:text-[var(--foreground)] py-1 px-2 rounded hover:bg-[var(--card-hover)] transition-colors"
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
