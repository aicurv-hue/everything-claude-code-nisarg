"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function HomeNavbar() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setLoggedIn(!!user);
      setChecked(true);
    });
    return unsub;
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-[var(--card)] border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <span className="font-bold text-xl text-[var(--foreground)]">Cridl</span>
        <div className="flex gap-3 items-center">
          <Link href="/#pricing" className="text-sm text-[var(--text-sub)] hover:text-[var(--foreground)] px-4 py-2 rounded-lg">
            Pricing
          </Link>
          {checked && (
            loggedIn ? (
              <Link
                href="/dashboard"
                className="text-sm bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-colors"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-[var(--text-sub)] hover:text-[var(--foreground)] px-4 py-2 rounded-lg">
                  Sign in
                </Link>
                <Link
                  href="/#pricing"
                  className="text-sm bg-[var(--primary)] text-white px-4 py-2 rounded-lg hover:opacity-90 transition-colors"
                >
                  Get started free
                </Link>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
