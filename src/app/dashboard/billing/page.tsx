"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import SubscriptionStatus from "@/components/SubscriptionStatus";

export default function BillingPage() {
  const router = useRouter();

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

      <div className="max-w-lg">
        <SubscriptionStatus />
      </div>
    </div>
  );
}
