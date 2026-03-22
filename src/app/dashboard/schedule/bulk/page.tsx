"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSegment } from "@/lib/context/segment";
import BulkUploadFlow from "@/components/schedule/BulkUploadFlow";

export default function BulkUploadPage() {
  const { segment } = useSegment();
  const router      = useRouter();

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">

      {/* Breadcrumb */}
      <div>
        <Link
          href="/dashboard/schedule"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-700 transition-colors mb-5"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Schedule
        </Link>
      </div>

      <BulkUploadFlow
        segment={segment as "individual" | "corporate"}
        onComplete={() => {}}
        onViewCalendar={() => router.push("/dashboard/schedule")}
      />
    </div>
  );
}
