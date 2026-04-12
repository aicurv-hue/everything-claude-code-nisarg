"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import SubscriptionStatus from "@/components/SubscriptionStatus";
import { getAuthToken } from "@/lib/utils/getAuthToken";

interface UsageData {
  postsGenerated: number;
  imagesGenerated: number;
  faceImagesGenerated: number;
  plan: string;
  limits: {
    postsPerMonth: number;
    imagesPerMonth: number;
    faceImagesPerMonth: number;
  };
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const isUnlimited = limit >= 999999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-[#0A66C2]";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-500">
          {isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    getAuthToken().then(tok => {
      if (!tok) return;
      fetch("/api/usage/me", { headers: { Authorization: `Bearer ${tok}` } })
        .then(r => r.json())
        .then(setUsage)
        .catch(() => {});
    });
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Billing</h1>
          <p className="text-sm text-slate-500">Manage your plan and subscription</p>
        </div>
      </div>

      <div className="max-w-lg space-y-6">
        <SubscriptionStatus />

        {usage && (
          <div className="rounded-xl border border-gray-200 p-6 space-y-4">
            <p className="font-semibold text-gray-900">Usage this month</p>
            <UsageBar label="Posts generated" used={usage.postsGenerated} limit={usage.limits.postsPerMonth} />
            <UsageBar label="AI images" used={usage.imagesGenerated} limit={usage.limits.imagesPerMonth} />
            {usage.limits.faceImagesPerMonth > 0 && (
              <UsageBar label="Face images (Use My Face)" used={usage.faceImagesGenerated} limit={usage.limits.faceImagesPerMonth} />
            )}
            {usage.plan === "free" && (
              <p className="text-xs text-gray-400 pt-1">
                Usage resets on the 1st of each month.{" "}
                <a href="/#pricing" className="text-[#0A66C2] hover:underline">Upgrade for more.</a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
