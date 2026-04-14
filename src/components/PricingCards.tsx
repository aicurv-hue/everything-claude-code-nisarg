"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

const LIMIT_NOTE = "Each generation & regeneration counts toward your monthly limit";

const FREE_PLAN = {
  name: "Free",
  price: "₹0",
  features: ["10 posts/month", "5 AI images/month", "Scheduling", LIMIT_NOTE],
  popular: false,
  planId: null,
};

const PAID_PLANS = [
  {
    name: "Starter",
    price: "₹499",
    planId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_STARTER || "").trim(),
    features: ["45 posts/month", "20 AI images/month", "5 Face images/month", "Scheduling", LIMIT_NOTE],
    popular: false,
  },
  {
    name: "Pro",
    price: "₹999",
    planId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_PRO || "").trim(),
    features: ["100 posts/month", "50 AI images/month", "10 Face images/month", "Scheduling", "Campaigns", "Company page", LIMIT_NOTE],
    popular: true,
  },
  {
    name: "Business",
    price: "₹1,999",
    planId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_BUSINESS || "").trim(),
    features: ["Unlimited posts", "100 AI images/month", "20 Face images/month", "Scheduling", "Campaigns", "Company page", LIMIT_NOTE],
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

  async function handleCheckout(plan: (typeof PAID_PLANS)[0]) {
    const user = auth.currentUser;
    if (!user) {
      const redirect = encodeURIComponent(`/?plan=${plan.name.toLowerCase()}#pricing`);
      router.push(`/login?plan=${plan.name.toLowerCase()}&redirect=${redirect}`);
      return;
    }

    setLoading(plan.name);
    setError(null);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/subscriptions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ planId: plan.planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create subscription");

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        subscription_id: data.subscriptionId,
        name: "Cridl",
        description: `${plan.name} Plan`,
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
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Simple, transparent pricing</h2>
          <p className="text-gray-500">Start free. Upgrade when you&apos;re ready.</p>
        </div>
        {error && (
          <div className="mb-6 text-center text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg py-3 px-4">
            {error}
          </div>
        )}
        <div className="grid md:grid-cols-4 gap-6">
          {/* Free plan card */}
          <div className="relative rounded-2xl border border-gray-200 p-6 flex flex-col">
            <div className="mb-4">
              <p className="font-semibold text-gray-900 text-lg">{FREE_PLAN.name}</p>
              <p className="mt-1">
                <span className="text-3xl font-bold text-gray-900">{FREE_PLAN.price}</span>
                <span className="text-gray-400 text-sm">/month</span>
              </p>
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {FREE_PLAN.features.slice(0, -1).map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-gray-400">✓</span> {f}
                </li>
              ))}
              <li className="text-xs text-gray-400 italic pt-1">{FREE_PLAN.features[FREE_PLAN.features.length - 1]}</li>
            </ul>
            <a
              href="/signup"
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-center border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Sign Up Free
            </a>
          </div>

          {/* Paid plan cards */}
          {PAID_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                plan.popular
                  ? "border-[#0A66C2] ring-2 ring-[#0A66C2]/20 shadow-lg"
                  : "border-gray-200"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0A66C2] text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </span>
              )}
              <div className="mb-4">
                <p className="font-semibold text-gray-900 text-lg">{plan.name}</p>
                <p className="mt-1">
                  <span className="text-3xl font-bold text-gray-900">{plan.price}</span>
                  <span className="text-gray-400 text-sm">/month</span>
                </p>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.slice(0, -1).map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="text-[#0A66C2]">✓</span> {f}
                  </li>
                ))}
                <li className="text-xs text-gray-400 italic pt-1">{plan.features[plan.features.length - 1]}</li>
              </ul>
              <button
                onClick={() => handleCheckout(plan)}
                disabled={loading === plan.name}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  plan.popular
                    ? "bg-[#0A66C2] text-white hover:bg-[#0A66C2]/90"
                    : "border border-[#0A66C2] text-[#0A66C2] hover:bg-[#0A66C2]/5"
                } disabled:opacity-50`}
              >
                {loading === plan.name ? "Opening..." : plan.popular ? "Buy Now" : "Get Started"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
