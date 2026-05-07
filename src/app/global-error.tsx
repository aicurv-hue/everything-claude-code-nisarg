"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en" translate="no">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, marginBottom: 20, fontSize: 14 }}>
            A page error occurred. This can happen when browser extensions (e.g. Google Translate) modify the page. Try disabling translation or refreshing.
          </p>
          <button
            onClick={reset}
            style={{ padding: "10px 20px", background: "#f97316", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
