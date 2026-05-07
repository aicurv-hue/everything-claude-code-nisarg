"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          The page hit an unexpected error. This can happen when browser translation extensions modify the page. Try disabling Google Translate or click below to retry.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
