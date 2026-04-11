"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const planHint = searchParams.get("plan");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      try {
        const res = await fetch(`/api/beta/check?email=${encodeURIComponent(email.toLowerCase().trim())}`);
        const { approved } = await res.json();
        router.replace(approved ? "/dashboard" : "/waitlist");
      } catch {
        router.replace("/dashboard");
      }
    } catch (err: any) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  const signupHref = redirectTo
    ? `/signup?redirect=${encodeURIComponent(redirectTo)}${planHint ? `&plan=${planHint}` : ""}`
    : "/signup";

  return (
    <div className="bg-slate-900 border border-white/[0.07] rounded-2xl p-8 shadow-2xl">
      <h1 className="text-white text-2xl font-bold mb-1">Welcome back</h1>
      <p className="text-slate-400 text-sm mb-5">Sign in to your Cridl account</p>

      {planHint && (
        <div className="mb-5 text-center text-xs text-[#0A66C2] bg-[#0A66C2]/10 border border-[#0A66C2]/20 rounded-lg py-2 px-3">
          Sign in to start your <span className="font-semibold capitalize">{planHint}</span> plan free trial
        </div>
      )}

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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-slate-300 text-sm font-medium">Password</label>
            <Link href="/reset-password" className="text-[#0A66C2] text-xs hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
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
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-slate-500 text-sm text-center mt-6">
        Don&apos;t have an account?{" "}
        <Link href={signupHref} className="text-[#0A66C2] hover:underline font-medium">
          Sign up
        </Link>
      </p>
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support.";
    default:
      return "Sign in failed. Please try again.";
  }
}
