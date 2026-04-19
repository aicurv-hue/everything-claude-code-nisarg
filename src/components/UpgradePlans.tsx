"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

const PLANS = [
  {
    name: "Starter",
    monthlyPrice: 499,
    yearlyPrice: 4990,
    monthlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_STARTER || "").trim(),
    yearlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_STARTER_YEARLY || "").trim(),
    features: ["30 posts/month", "10 AI images", "5 face images/month", "Post scheduling"],
    popular: false,
  },
  {
    name: "Pro",
    monthlyPrice: 999,
    yearlyPrice: 9990,
    monthlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_PRO || "").trim(),
    yearlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_PRO_YEARLY || "").trim(),
    features: ["100 posts/month", "50 AI images", "20 face images/month", "Campaigns", "Company page"],
    popular: true,
  },
  {
    name: "Business",
    monthlyPrice: 1999,
    yearlyPrice: 19990,
    monthlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_BUSINESS || "").trim(),
    yearlyPlanId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_BUSINESS_YEARLY || "").trim(),
    features: ["Unlimited posts", "Unlimited AI images", "Unlimited face images", "Campaigns", "Company page"],
    popular: false,
  },
];

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, business: 3 };

export default function UpgradePlans({ currentPlan = "free" }: { currentPlan?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);

  async function handleCheckout(plan: (typeof PLANS)[0]) {
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
      rzp.on("payment.failed", function (response: { error?: { code?: string; description?: string; reason?: string } }) {
        console.error("[Razorpay] payment.failed", JSON.stringify(response));
        const msg = response.error?.description || response.error?.reason || response.error?.code || "Payment failed";
        setError(`Payment failed: ${msg}`);
      });
      rzp.open();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Monthly / Yearly toggle */}
      <div className="flex items-center justify-center gap-3 py-1">
        <span className={`text-sm font-medium ${!yearly ? "text-[var(--foreground)]" : "text-[var(--text-muted)]"}`}>Monthly</span>
        <button
          onClick={() => setYearly(v => !v)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${yearly ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
          aria-label="Toggle billing period"
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-[var(--card)] shadow transition-transform ${yearly ? "translate-x-6" : "translate-x-1"}`} />
        </button>
        <span className={`text-sm font-medium ${yearly ? "text-[var(--foreground)]" : "text-[var(--text-muted)]"}`}>
          Yearly
          <span className="ml-1.5 text-[10px] font-semibold bg-green-100 text-emerald-400 px-1.5 py-0.5 rounded-full">2 months free</span>
        </span>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-50 border border-red-200 rounded-lg py-2 px-3">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        {PLANS.filter((plan) => (PLAN_RANK[plan.name.toLowerCase()] ?? 0) > (PLAN_RANK[currentPlan] ?? 0)).map((plan) => {
          const displayPrice = yearly
            ? `₹${(plan.yearlyPrice / 12).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
            : `₹${plan.monthlyPrice.toLocaleString("en-IN")}`;
          return (
            <div
              key={plan.name}
              className={`relative rounded-xl border p-4 flex items-center justify-between gap-4 ${
                plan.popular
                  ? "border-[#0A66C2] ring-1 ring-[#0A66C2]/20"
                  : "border-[var(--border)]"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-2.5 left-4 bg-[var(--primary)] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-[var(--foreground)]">{plan.name}</span>
                  <span className="text-sm font-bold text-[var(--foreground)]">{displayPrice}</span>
                  <span className="text-xs text-[var(--text-muted)]">/mo</span>
                  {yearly && (
                    <span className="text-xs text-[var(--text-muted)]">
                      (₹{plan.yearlyPrice.toLocaleString("en-IN")}/yr)
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-sub)] mt-0.5 truncate">{plan.features.join(" · ")}</p>
              </div>
              <button
                onClick={() => handleCheckout(plan)}
                disabled={loading === plan.name}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                  plan.popular
                    ? "bg-[var(--primary)] text-white hover:opacity-90"
                    : "border border-[#0A66C2] text-[var(--primary)] hover:bg-[var(--primary)]/5"
                }`}
              >
                {loading === plan.name ? "Opening..." : "Upgrade"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
