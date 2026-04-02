"use client";

import { useEffect } from "react";

/**
 * Hides the Capacitor splash screen after the app shell renders.
 * On web (non-Capacitor), this is a no-op.
 */
export default function SplashHider() {
  useEffect(() => {
    const hide = async () => {
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        await SplashScreen.hide({ fadeOutDuration: 300 });
      } catch {
        // Not running in Capacitor — ignore
      }
    };
    hide();
  }, []);

  return null;
}
