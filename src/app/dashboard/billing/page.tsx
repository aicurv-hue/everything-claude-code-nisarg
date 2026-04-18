"use client";

import { useEffect, useState } from "react";
import {
  CreditCard, Zap, CheckCircle, AlertCircle, Gift,
  BarChart2, ChevronRight, Sparkles, Clock, Calendar,
  XCircle, RefreshCw,
} from "lucide-react";
import UpgradePlans from "@/components/UpgradePlans";
import { useAuth } from "@/lib/context/auth";
import { usePlanStatus } from "@/lib/context/planStatus";

// ── Types ──────────────────────────────────────────────────────────────────────

interface UsageData {
  postsGenerated: number;
  imagesGenerated: number;
  faceImagesGenerated: number;
  plan: string;
  limits: {
    postsPerMonth: number;
    imagesPerMonth: number;
    faceImagesPerMonth: number;
  };
}

// ── UsageBar ───────────────────────────────────────────────────────────────────

function UsageBar({ label, used, limit, tooltip, displayUnlimited }: { label: string; used: number; limit: number; tooltip?: string; displayUnlimited?: boolean }) {
  const isUnlimited = displayUnlimited || limit >= 9999;
  const pct = isUnlimited ? Math.min(used * 2, 100) : Math.min(100, Math.round((used / limit) * 100));
  const color = !isUnlimited && pct >= 90 ? "bg-red-500" : !isUnlimited && pct >= 70 ? "bg-amber-400" : "bg-[#0A66C2]";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 font-medium flex items-center gap-1.5">
          {label}
          {tooltip && (
            <span className="group relative inline-flex items-center">
              <span className="w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[9px] flex items-center justify-center font-bold cursor-default select-none">i</span>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-52 rounded-lg bg-slate-800 text-white text-xs px-2.5 py-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 leading-snug shadow-lg">
                {tooltip}
              </span>
            </span>
          )}
        </span>
        <span className="text-slate-500 text-xs font-mono">
          {isUnlimited ? <>{used} <span className="text-slate-400">used</span></> : `${used} / ${limit}`}
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${isUnlimited ? Math.min(used * 0.5, 15) : pct}%` }} />
      </div>
      {!isUnlimited && pct >= 90 && (
        <p className="text-xs text-red-500 font-medium">
          {pct >= 100 ? "Limit reached — upgrade your plan for more" : "Almost at your limit"}
        </p>
      )}
    </div>
  );
}

// ── Plan badge colors ──────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  free:     { bg: "bg-slate-100",    text: "text-slate-600",  border: "border-slate-200" },
  starter:  { bg: "bg-blue-50",      text: "text-blue-700",   border: "border-blue-200"  },
  pro:      { bg: "bg-violet-50",    text: "text-violet-700", border: "border-violet-200"},
  business: { bg: "bg-amber-50",     text: "text-amber-700",  border: "border-amber-200" },
  trial:    { bg: "bg-violet-50",    text: "text-violet-700", border: "border-violet-200"},
};

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter:  { monthly: 499,  yearly: 4990  },
  pro:      { monthly: 999,  yearly: 9990  },
  business: { monthly: 1999, yearly: 19990 },
};

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth();
  const {
    plan: ctxPlan, status: ctxStatus, trialEndsAt: ctxTrialEndsAt,
    currentPeriodEnd: ctxPeriodEnd, subscriptionId: ctxSubId,
    billingPeriod: ctxBillingPeriod, loading: planLoading,
  } = usePlanStatus();
  const [usage,   setUsage]   = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  // Promo code
  const [promoCode,     setPromoCode]     = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError,   setRedeemError]   = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<{ daysRemaining: number } | null>(null);

  // Cancel
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError,   setCancelError]   = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }

    async function load() {
      setLoading(true);
      try {
        const tok = await user!.getIdToken();
        const usageRes = await fetch("/api/usage/me", { headers: { Authorization: `Bearer ${tok}` } });
        if (usageRes.ok) setUsage(await usageRes.json());
      } catch (err) {
        console.error("[BillingPage] load error", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, authLoading]);

  async function handleRedeem() {
    setRedeemError(null);
    setRedeemSuccess(null);
    if (!promoCode.trim()) { setRedeemError("Enter a promo code."); return; }
    setRedeemLoading(true);
    try {
      const tok = await user!.getIdToken();
      const res = await fetch("/api/promo/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setRedeemError(data.error || "Failed to redeem."); return; }
      setRedeemSuccess({ daysRemaining: data.daysRemaining });
      setPromoCode("");
    } catch {
      setRedeemError("Network error. Please try again.");
    } finally {
      setRedeemLoading(false);
    }
  }

  async function handleCancel() {
    if (!ctxSubId) return;
    setCancelLoading(true);
    setCancelError(null);
    try {
      const tok = await user!.getIdToken();
      const res = await fetch("/api/subscriptions/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ subscriptionId: ctxSubId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCancelError(data.error || "Failed to cancel.");
        return;
      }
      setCancelSuccess(true);
      setShowCancelConfirm(false);
    } catch {
      setCancelError("Network error. Please try again.");
    } finally {
      setCancelLoading(false);
    }
  }

  const isTrial   = ctxStatus === "trial";
  const isFree    = !ctxPlan || ctxPlan === "free";
  const isPaid    = ctxStatus === "active";
  const effectivePlan = ctxPlan || "free";
  const planLabel = effectivePlan.charAt(0).toUpperCase() + effectivePlan.slice(1);
  const planColor = PLAN_COLORS[isTrial ? "trial" : effectivePlan] ?? PLAN_COLORS.free;

  const billingPeriod = ctxBillingPeriod || "monthly";
  const priceInfo = PLAN_PRICES[effectivePlan];

  const BILLING_LIMITS: Record<string, { postsPerMonth: number; imagesPerMonth: number; faceImagesPerMonth: number }> = {
    free:     { postsPerMonth: 5,    imagesPerMonth: 2,    faceImagesPerMonth: 0    },
    starter:  { postsPerMonth: 30,   imagesPerMonth: 10,   faceImagesPerMonth: 5    },
    pro:      { postsPerMonth: 100,  imagesPerMonth: 50,   faceImagesPerMonth: 20   },
    business: { postsPerMonth: 9999, imagesPerMonth: 9999, faceImagesPerMonth: 9999 },
  };
  const displayLimits = usage ? (BILLING_LIMITS[effectivePlan] ?? usage.limits) : null;

  // Trial days remaining
  let trialDaysLeft: number | null = null;
  if (isTrial && ctxTrialEndsAt) {
    const ms = new Date(ctxTrialEndsAt).getTime() - Date.now();
    if (ms > 0) trialDaysLeft = Math.ceil(ms / 86400000);
  }

  // Renewal date
  const renewalDate = ctxPeriodEnd ? new Date(ctxPeriodEnd) : null;

  // Days until renewal
  const daysUntilRenewal = renewalDate ? Math.max(0, Math.ceil((renewalDate.getTime() - Date.now()) / 86400000)) : null;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <CreditCard className="w-6 h-6 text-[#0A66C2]" />
          Billing &amp; Usage
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage your plan, track usage, and subscription details.</p>
      </div>

      {(loading || planLoading) ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ══════════════ SECTION 1: Current Plan ══════════════ */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Plan header row */}
            <div className="p-6 pb-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900">{planLabel} plan</h2>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${planColor.bg} ${planColor.text} ${planColor.border} uppercase tracking-wider`}>
                      {isTrial ? "Trial" : isPaid ? "Active" : "Free"}
                    </span>
                  </div>
                  {isPaid && priceInfo && (
                    <p className="text-sm text-slate-500">
                      {billingPeriod === "yearly" ? "Yearly" : "Monthly"} &middot;{" "}
                      &#8377;{billingPeriod === "yearly" ? priceInfo.yearly.toLocaleString("en-IN") : priceInfo.monthly.toLocaleString("en-IN")}/{billingPeriod === "yearly" ? "yr" : "mo"}
                    </p>
                  )}
                </div>
                {isPaid && effectivePlan !== "business" && (
                  <button
                    onClick={() => {
                      const el = document.getElementById("upgrade-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="text-xs font-medium text-[#0A66C2] hover:text-[#0854a0] border border-[#0A66C2]/20 rounded-lg px-3 py-1.5 hover:bg-[#0A66C2]/5 transition-colors"
                  >
                    Adjust plan
                  </button>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-100" />

            {/* Renewal / Status info */}
            <div className="px-6 py-4 space-y-3">
              {isTrial && trialDaysLeft !== null && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-violet-50 border border-violet-100">
                  <Clock className="w-4.5 h-4.5 text-violet-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-violet-900">
                      {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
                    </p>
                    <p className="text-xs text-violet-600 mt-0.5">
                      Full Starter access.{" "}
                      {ctxTrialEndsAt && <>Expires {formatDate(new Date(ctxTrialEndsAt))}.</>}
                    </p>
                  </div>
                </div>
              )}

              {isPaid && renewalDate && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                  <RefreshCw className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <p className="text-sm text-slate-700">
                      Your subscription will auto renew on <span className="font-semibold">{formatDate(renewalDate)}</span>.
                      {daysUntilRenewal !== null && daysUntilRenewal <= 7 && (
                        <span className="ml-1 text-amber-600 font-medium">({daysUntilRenewal} day{daysUntilRenewal !== 1 ? "s" : ""} left)</span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {isPaid && !renewalDate && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-green-50 border border-green-100">
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-sm text-green-800">{planLabel} plan is active.</p>
                </div>
              )}

              {isFree && !isTrial && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-100">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">You&apos;re on the Free plan</p>
                    <p className="text-xs text-amber-700 mt-0.5">5 posts/month, 2 AI images. Upgrade below for more.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════ SECTION 2: Usage ══════════════ */}
          {usage && displayLimits && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 pt-5 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-700">Plan usage limits</h3>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${planColor.bg} ${planColor.text}`}>
                  {planLabel}
                </span>
              </div>

              <div className="px-6 pb-5 space-y-5">
                <UsageBar
                  label="Posts generated"
                  used={usage.postsGenerated}
                  limit={displayLimits.postsPerMonth}
                  tooltip="Every time you generate or regenerate a post, it uses 1 from your monthly limit."
                  displayUnlimited={effectivePlan === "business"}
                />
                <UsageBar
                  label="AI images"
                  used={usage.imagesGenerated}
                  limit={displayLimits.imagesPerMonth}
                  displayUnlimited={effectivePlan === "business"}
                />
                {displayLimits.faceImagesPerMonth > 0 && (
                  <UsageBar
                    label="Face images (Use My Face)"
                    used={usage.faceImagesGenerated}
                    limit={displayLimits.faceImagesPerMonth}
                    displayUnlimited={effectivePlan === "business"}
                  />
                )}
              </div>

              <div className="border-t border-slate-100 px-6 py-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs text-slate-400">Usage resets on the 1st of each month.</p>
              </div>
            </div>
          )}

          {/* ══════════════ SECTION 3: Promo Code ══════════════ */}
          {!isPaid && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-violet-500" />
                <p className="text-sm font-semibold text-slate-700">Have a promo code?</p>
              </div>
              <p className="text-xs text-slate-500">Enter your code below to activate a free trial with Starter plan access.</p>

              {redeemSuccess ? (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                  <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-green-900">Promo code activated!</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Your Starter plan trial is active for {redeemSuccess.daysRemaining} more day{redeemSuccess.daysRemaining !== 1 ? "s" : ""}.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2.5">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === "Enter" && handleRedeem()}
                      placeholder="CRIDL-XXXXXXXX"
                      className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-mono tracking-wider text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A66C2]/20 focus:border-[#0A66C2] transition-all"
                    />
                    <button
                      onClick={handleRedeem}
                      disabled={redeemLoading || !promoCode.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#0A66C2] hover:bg-[#0854a0] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                    >
                      <Zap className="w-4 h-4" />
                      {redeemLoading ? "Activating..." : "Activate"}
                    </button>
                  </div>
                  {redeemError && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {redeemError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══════════════ SECTION 4: Upgrade Plans ══════════════ */}
          {effectivePlan !== "business" && (
            <div id="upgrade-section" className="space-y-4">
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none">
                  <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90" />
                  <p className="text-sm font-semibold text-slate-700">
                    {isTrial ? "Upgrade before your trial ends" : isPaid ? "Change your plan" : "Upgrade your plan"}
                  </p>
                </summary>
                <div className="mt-3">
                  <UpgradePlans currentPlan={effectivePlan} />
                </div>
              </details>
            </div>
          )}

          {/* ══════════════ SECTION 5: Cancellation ══════════════ */}
          {isPaid && ctxSubId && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 pt-5 pb-2">
                <h3 className="text-sm font-semibold text-slate-700">Cancellation</h3>
              </div>
              <div className="border-t border-slate-100" />
              <div className="px-6 py-4">
                {cancelSuccess ? (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-100">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Subscription cancelled</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        You&apos;ll retain access until the end of your current billing period
                        {renewalDate && <> ({formatDate(renewalDate)})</>}. After that, you&apos;ll be on the Free plan.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-700">Cancel plan</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        You&apos;ll keep access until the end of your billing period.
                      </p>
                    </div>
                    {!showCancelConfirm ? (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                      >
                        Cancel
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Keep plan
                        </button>
                        <button
                          onClick={handleCancel}
                          disabled={cancelLoading}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {cancelLoading ? "Cancelling..." : "Confirm cancel"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {cancelError && (
                  <div className="flex items-center gap-2 text-sm text-red-600 mt-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {cancelError}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
