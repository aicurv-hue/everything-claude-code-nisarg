"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

const LIMIT_NOTE = "Each generation & regeneration counts toward your monthly limit";

const FREE_PLAN = {
  name: "Free",
  price: "₹0",
  features: ["5 posts/month", "2 AI images/month", "Scheduling", LIMIT_NOTE],
  popular: false,
  planId: null,
};

const PAID_PLANS = [
  {
    name: "Starter",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    monthlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_STARTER || "").trim(),
    yearlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_STARTER_YEARLY || "").trim(),
    features: ["30 posts/month", "10 AI images/month", "5 Face images/month", "Scheduling", LIMIT_NOTE],
    popular: false,
  },
  {
    name: "Pro",
    monthlyPrice: 999,
    yearlyPrice: 9990,
    monthlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_PRO || "").trim(),
    yearlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_PRO_YEARLY || "").trim(),
    features: ["100 posts/month", "50 AI images/month", "20 Face images/month", "Scheduling", "Campaigns", "Company page", LIMIT_NOTE],
    popular: true,
  },
  {
    name: "Business",
    monthlyPrice: 1999,
    yearlyPrice: 19990,
    monthlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_BUSINESS || "").trim(),
    yearlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_BUSINESS_YEARLY || "").trim(),
    features: ["Unlimited posts", "Unlimited AI images", "Unlimited Face images", "Scheduling", "Campaigns", "Company page", LIMIT_NOTE],
    popular: false,
  },
];

export default function PricingCards() {
  return (
    <Suspense fallback={null}>
      <PricingCardsInner />
    </Suspense>
  );
}

function PricingCardsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);

  async function handleCheckout(plan: (typeof PAID_PLANS)[0]) {
    const user = auth.currentUser;
    if (!user) {
      const redirect = encodeURIComponent(`/?plan=${plan.name.toLowerCase()}#pricing`);
      router.push(`/login?plan=${plan.name.toLowerCase()}&redirect=${redirect}`);
      return;
    }

    const planId = yearly ? plan.yearlyPlanId : plan.monthlyPlanId;
    setLoading(plan.name);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create subscription");

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        subscription_id: data.subscriptionId,
        name: "Cridl",
        description: `${plan.name} Plan (${yearly ? "Yearly" : "Monthly"})`,
        handler: function () {
          router.push(`/dashboard?welcome=true&plan=${plan.name.toLowerCase()}`);
        },
        prefill: {
          name: user.displayName || "",
          email: user.email || "",
        },
        theme: { color: "#0A66C2" },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const RazorpayClass = (window as any).Razorpay;
      if (!RazorpayClass) throw new Error("Payment SDK not loaded. Please refresh the page.");
      const rzp = new RazorpayClass(options);
      rzp.on("payment.failed", function (response: { error?: { description?: string } }) {
        setError(response.error?.description || "Payment failed");
      });
      rzp.open();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  // Auto-trigger checkout if ?plan= param is in URL (user came back after login)
  useEffect(() => {
    const autoPlan = searchParams.get("plan");
    if (!autoPlan || autoPlan === "free") return;
    const match = PAID_PLANS.find(p => p.name.toLowerCase() === autoPlan.toLowerCase());
    if (!match) return;

    const unsub = onAuthStateChanged(auth, (user) => {
      unsub(); // fire once only
      if (user) {
        handleCheckout(match);
      } else {
        const redirect = encodeURIComponent(`/?plan=${autoPlan}#pricing`);
        router.push(`/login?plan=${autoPlan}&redirect=${redirect}`);
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="py-20 bg-[var(--card)]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-[var(--foreground)] mb-3">Simple, transparent pricing</h2>
          <p className="text-[var(--text-sub)]">Start free. Upgrade when you&apos;re ready.</p>
        </div>

        {/* Monthly / Yearly toggle */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <span className={`text-sm font-medium ${!yearly ? "text-[var(--foreground)]" : "text-[var(--text-muted)]"}`}>Monthly</span>
          <button
            onClick={() => setYearly(v => !v)}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${yearly ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
            aria-label="Toggle billing period"
          >
            <span className={`inline-block h-5 w-5 rounded-full bg-[var(--card)] shadow transition-transform ${yearly ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className={`text-sm font-medium ${yearly ? "text-[var(--foreground)]" : "text-[var(--text-muted)]"}`}>
            Yearly
            <span className="ml-2 text-xs font-semibold bg-green-100 text-emerald-400 px-2 py-0.5 rounded-full">2 months free</span>
          </span>
        </div>

        {error && (
          <div className="mb-6 text-center text-sm text-red-400 bg-red-50 border border-red-200 rounded-lg py-3 px-4">
            {error}
          </div>
        )}
        <div className="grid md:grid-cols-4 gap-6">
          {/* Free plan card */}
          <div className="relative rounded-2xl border border-[var(--border)] p-6 flex flex-col">
            <div className="mb-4">
              <p className="font-semibold text-[var(--foreground)] text-lg">{FREE_PLAN.name}</p>
              <p className="mt-1">
                <span className="text-3xl font-bold text-[var(--foreground)]">₹0</span>
                <span className="text-[var(--text-muted)] text-sm">/month</span>
              </p>
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {FREE_PLAN.features.slice(0, -1).map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-sub)]">
                  <span className="text-[var(--text-muted)]">✓</span> {f}
                </li>
              ))}
              <li className="text-xs text-[var(--text-muted)] italic pt-1">{FREE_PLAN.features[FREE_PLAN.features.length - 1]}</li>
            </ul>
            <a
              href="/signup"
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-center border border-[var(--border)] text-[var(--text-sub)] hover:bg-[var(--card-hover)] transition-colors"
            >
              Sign Up Free
            </a>
          </div>

          {/* Paid plan cards */}
          {PAID_PLANS.map((plan) => {
            const displayMonthly = yearly
              ? Math.round(plan.yearlyPrice / 12)
              : plan.monthlyPrice;
            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl border p-6 flex flex-col ${
                  plan.popular
                    ? "border-[#0A66C2] ring-2 ring-[#0A66C2]/20 shadow-lg"
                    : "border-[var(--border)]"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--primary)] text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                <div className="mb-4">
                  <p className="font-semibold text-[var(--foreground)] text-lg">{plan.name}</p>
                  <p className="mt-1">
                    <span className="text-3xl font-bold text-[var(--foreground)]">
                      ₹{displayMonthly.toLocaleString("en-IN")}
                    </span>
                    <span className="text-[var(--text-muted)] text-sm">/month</span>
                  </p>
                  {yearly && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      ₹{plan.yearlyPrice.toLocaleString("en-IN")} billed annually
                    </p>
                  )}
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.slice(0, -1).map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-[var(--text-sub)]">
                      <span className="text-[var(--primary)]">✓</span> {f}
                    </li>
                  ))}
                  <li className="text-xs text-[var(--text-muted)] italic pt-1">{plan.features[plan.features.length - 1]}</li>
                </ul>
                <button
                  onClick={() => handleCheckout(plan)}
                  disabled={loading === plan.name}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    plan.popular
                      ? "bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90"
                      : "border border-[#0A66C2] text-[var(--primary)] hover:bg-[var(--primary)]/5"
                  } disabled:opacity-50`}
                >
                  {loading === plan.name ? "Opening..." : plan.popular ? "Buy Now" : "Get Started"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
