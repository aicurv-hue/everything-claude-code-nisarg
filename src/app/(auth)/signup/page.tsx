"use client";

import { useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const { signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const planHint = searchParams.get("plan");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      await signUp(email, password, name.trim());
      // Seed a blank Firestore profile for the new user (fire-and-forget)
      const token = await import("@/lib/utils/getAuthToken").then(m => m.getAuthToken());
      if (token) {
        fetch("/api/profile/init", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: name.trim() }),
        }).catch(() => {});
      }
      if (redirectTo) {
        router.replace(redirectTo);
        return;
      }
      router.replace("/dashboard");
    } catch (err: any) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  const loginHref = redirectTo
    ? `/login?redirect=${encodeURIComponent(redirectTo)}${planHint ? `&plan=${planHint}` : ""}`
    : "/login";

  return (
    <div className="bg-slate-900 border border-white/[0.07] rounded-2xl p-8 shadow-2xl">
      <h1 className="text-white text-2xl font-bold mb-1">Create your account</h1>
      <p className="text-slate-400 text-sm mb-5">Start building your LinkedIn presence today</p>

      {planHint && (
        <div className="mb-5 text-center text-xs text-[#0A66C2] bg-[#0A66C2]/10 border border-[#0A66C2]/20 rounded-lg py-2 px-3">
          Create your account to get started with the <span className="font-semibold capitalize">{planHint}</span> plan
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1.5">Full name</label>
          <input
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Neel Shah"
            className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#0A66C2] transition-colors"
          />
        </div>

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
          <label className="block text-slate-300 text-sm font-medium mb-1.5">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
            className="w-full bg-slate-800 border border-white/[0.08] rounded-lg px-4 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-[#0A66C2] transition-colors"
          />
        </div>

        <div>
          <label className="block text-slate-300 text-sm font-medium mb-1.5">Confirm password</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
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
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-slate-500 text-sm text-center mt-6">
        Already have an account?{" "}
        <Link href={loginHref} className="text-[#0A66C2] hover:underline font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    default:
      return "Sign up failed. Please try again.";
  }
}
