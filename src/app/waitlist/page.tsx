"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth";

export default function WaitlistPage() {
  const { user, logOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await logOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-slate-900 border border-white/[0.07] rounded-2xl p-8 text-center">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-[#0A66C2]/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-[#0A66C2]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* Heading */}
        <h1 className="text-white text-2xl font-bold mb-2">You&apos;re on the waitlist</h1>
        <p className="text-slate-400 text-sm leading-relaxed mb-3">
          LinkAuto is currently in <span className="text-white font-medium">closed beta</span>.
          Your account has been created but access is not yet approved.
        </p>

        {user?.email && (
          <p className="text-slate-500 text-xs mb-6">
            Signed in as <span className="text-slate-300">{user.email}</span>
          </p>
        )}

        {/* What happens next */}
        <div className="bg-white/[0.04] rounded-xl p-4 text-left mb-6 space-y-2">
          <p className="text-slate-300 text-sm font-medium mb-1">What happens next?</p>
          <div className="flex items-start gap-2.5">
            <span className="text-[#0A66C2] mt-0.5">1.</span>
            <p className="text-slate-400 text-sm">Email <span className="text-[#0A66C2]">nisarg2526@gmail.com</span> to request beta access.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="text-[#0A66C2] mt-0.5">2.</span>
            <p className="text-slate-400 text-sm">Once approved, sign in and you&apos;ll have full access.</p>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          className="w-full border border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20 py-2.5 rounded-lg text-sm font-medium transition-all"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
