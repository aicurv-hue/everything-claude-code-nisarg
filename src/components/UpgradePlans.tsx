"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

const PLANS = [
  {
    name: "Starter",
    price: "₹499",
    planId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_STARTER || "").trim(),
    features: ["45 posts/month", "20 AI images", "5 face images/month", "Post scheduling"],
    popular: false,
  },
  {
    name: "Pro",
    price: "₹999",
    planId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_PRO || "").trim(),
    features: ["100 posts/month", "50 AI images", "10 face images/month", "Campaigns", "Company page"],
    popular: true,
  },
  {
    name: "Business",
    price: "₹1,999",
    planId: (process.env.NEXT_PUBLIC_RAZORPAY_PLAN_BUSINESS || "").trim(),
    features: ["Unlimited posts", "100 AI images", "20 face images/month", "Campaigns", "Company page"],
    popular: false,
  },
];

export default function UpgradePlans() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(plan: (typeof PLANS)[0]) {
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
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg py-2 px-3">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-xl border p-4 flex items-center justify-between gap-4 ${
              plan.popular
                ? "border-[#0A66C2] ring-1 ring-[#0A66C2]/20"
                : "border-gray-200"
            }`}
          >
            {plan.popular && (
              <span className="absolute -top-2.5 left-4 bg-[#0A66C2] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                Most Popular
              </span>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-gray-900">{plan.name}</span>
                <span className="text-sm font-bold text-gray-900">{plan.price}</span>
                <span className="text-xs text-gray-400">/mo</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{plan.features.join(" · ")}</p>
            </div>
            <button
              onClick={() => handleCheckout(plan)}
              disabled={loading === plan.name}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                plan.popular
                  ? "bg-[#0A66C2] text-white hover:bg-[#0854a0]"
                  : "border border-[#0A66C2] text-[#0A66C2] hover:bg-[#0A66C2]/5"
              }`}
            >
              {loading === plan.name ? "Opening..." : "Upgrade"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
