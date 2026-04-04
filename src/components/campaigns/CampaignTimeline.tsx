"use client";
import React from "react";
import { CheckCircle, Clock, Circle } from "lucide-react";

interface TimelinePost {
  campaign_position: number;
  status: "draft" | "scheduled" | "published" | "failed";
  scheduled_at?: any;
  content?: string;
}

interface Props {
  posts: TimelinePost[];
  frequencyDays: number;
  startDate?: Date;
}

const statusIcon = (status: string) => {
  if (status === "published") return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "scheduled") return <Clock className="w-4 h-4 text-amber-500" />;
  if (status === "failed") return <Circle className="w-4 h-4 text-red-500" />;
  return <Circle className="w-4 h-4 text-slate-300" />;
};

const statusLabel = (status: string) => {
  if (status === "published") return "Published";
  if (status === "scheduled") return "Scheduled";
  if (status === "failed") return "Failed";
  return "Draft";
};

export default function CampaignTimeline({ posts, frequencyDays, startDate }: Props) {
  const getDate = (position: number, scheduledAt?: any): string => {
    if (scheduledAt?.seconds) {
      return new Date(scheduledAt.seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    if (startDate) {
      const d = new Date(startDate.getTime() + (position - 1) * frequencyDays * 86400000);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return `Day ${(position - 1) * frequencyDays + 1}`;
  };

  return (
    <div className="relative">
      <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-slate-200" />
      <div className="space-y-4">
        {posts.map((post) => (
          <div key={post.campaign_position} className="flex items-start gap-4 relative">
            <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center shrink-0 z-10">
              {statusIcon(post.status)}
            </div>
            <div className="flex-1 pt-1.5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">Post {post.campaign_position}</p>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                  post.status === "published" ? "bg-green-50 text-green-700 border-green-200" :
                  post.status === "scheduled" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  post.status === "failed" ? "bg-red-50 text-red-700 border-red-200" :
                  "bg-slate-50 text-slate-500 border-slate-200"
                }`}>
                  {statusLabel(post.status)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{getDate(post.campaign_position, post.scheduled_at)}</p>
              {post.content && (
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{post.content.slice(0, 120)}...</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
