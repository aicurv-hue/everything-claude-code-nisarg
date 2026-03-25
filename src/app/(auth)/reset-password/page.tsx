"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth";

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: any) {
      setError("Could not send reset email. Check the address and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="bg-slate-900 border border-white/[0.07] rounded-2xl p-8 shadow-2xl text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-green-400 text-xl">✓</span>
        </div>
        <h1 className="text-white text-xl font-bold mb-2">Check your inbox</h1>
        <p className="text-slate-400 text-sm mb-6">
          We sent a password reset link to <span className="text-white font-medium">{email}</span>.
          Check your spam folder if you don&apos;t see it.
        </p>
        <Link href="/login" className="text-[#0A66C2] text-sm hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-white/[0.07] rounded-2xl p-8 shadow-2xl">
      <h1 className="text-white text-2xl font-bold mb-1">Reset your password</h1>
      <p className="text-slate-400 text-sm mb-7">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#0A66C2] transition-colors"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#0A66C2] hover:bg-[#0854a0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="text-slate-500 text-sm text-center mt-6">
        Remembered it?{" "}
        <Link href="/login" className="text-[#0A66C2] hover:underline font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
