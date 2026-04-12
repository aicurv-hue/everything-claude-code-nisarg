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
    <nav className="fixed top-0 left-0 right-0 z-50 h-16 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <span className="font-bold text-xl text-slate-900">Cridl</span>
        <div className="flex gap-3 items-center">
          <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg">
            Pricing
          </a>
          {checked && (
            loggedIn ? (
              <Link
                href="/dashboard"
                className="text-sm bg-[#0A66C2] text-white px-4 py-2 rounded-lg hover:bg-[#0854a0] transition-colors"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg">
                  Sign in
                </Link>
                <a
                  href="#pricing"
                  className="text-sm bg-[#0A66C2] text-white px-4 py-2 rounded-lg hover:bg-[#0854a0] transition-colors"
                >
                  Get started free
                </a>
              </>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
