"use client";

import { useEffect, useState } from "react";
import {
  CreditCard, Zap, CheckCircle, AlertCircle, Gift,
  BarChart2, ChevronRight, Sparkles, Clock,
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

interface SubStatus {
  plan: string;
  status: string;
  trialEndsAt?: string | null;
}

// ── UsageBar ───────────────────────────────────────────────────────────────────

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const isUnlimited = limit >= 999999;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-[#0A66C2]";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-700 font-medium">{label}</span>
        <span className="text-slate-500 text-xs font-mono">
          {isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

// ── Plan badge helper ──────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  free:     { bg: "bg-slate-100",    text: "text-slate-600",  border: "border-slate-200" },
  starter:  { bg: "bg-blue-50",      text: "text-blue-700",   border: "border-blue-200"  },
  pro:      { bg: "bg-violet-50",    text: "text-violet-700", border: "border-violet-200"},
  business: { bg: "bg-amber-50",     text: "text-amber-700",  border: "border-amber-200" },
  trial:    { bg: "bg-violet-50",    text: "text-violet-700", border: "border-violet-200"},
};

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth();
  const { plan: ctxPlan, status: ctxStatus, trialEndsAt: ctxTrialEndsAt, loading: planLoading } = usePlanStatus();
  const [usage,   setUsage]   = useState<UsageData | null>(null);
  const [sub,     setSub]     = useState<SubStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Promo code
  const [promoCode,     setPromoCode]     = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError,   setRedeemError]   = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<{ daysRemaining: number } | null>(null);

  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

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

  useEffect(() => {
    if (planLoading) return;
    setSub({ plan: ctxPlan, status: ctxStatus, trialEndsAt: ctxTrialEndsAt });
    if (ctxStatus === "trial" && ctxTrialEndsAt) {
      const ms = new Date(ctxTrialEndsAt).getTime() - Date.now();
      if (ms > 0) setTrialDaysLeft(Math.ceil(ms / 86400000));
    }
  }, [ctxPlan, ctxStatus, ctxTrialEndsAt, planLoading]);

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
      setTrialDaysLeft(data.daysRemaining);
      setSub({ plan: "starter", status: "trial", trialEndsAt: data.trialExpiresAt });
    } catch {
      setRedeemError("Network error. Please try again.");
    } finally {
      setRedeemLoading(false);
    }
  }

  const isTrial   = sub?.status === "trial";
  const isFree    = !sub?.plan || sub.plan === "free";
  const isPaid    = sub?.status === "active";
  const planLabel = sub?.plan ? sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1) : "Free";
  const planColor = PLAN_COLORS[isTrial ? "trial" : (sub?.plan || "free")] ?? PLAN_COLORS.free;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8">

      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
          <CreditCard className="w-6 h-6 text-[#0A66C2]" />
          Billing &amp; Usage
        </h1>
        <p className="text-sm text-slate-500 mt-1">Manage your plan, track usage, and activate promo codes.</p>
      </div>

      {(loading || planLoading) ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Current Plan Card ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Plan</p>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${planColor.bg} ${planColor.text} ${planColor.border}`}>
                {isTrial ? "Trial" : planLabel}
              </span>
            </div>

            {isTrial && trialDaysLeft !== null && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-violet-50 border border-violet-200">
                <Clock className="w-5 h-5 text-violet-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-violet-900">
                    {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining in your trial
                  </p>
                  <p className="text-xs text-violet-600 mt-0.5">
                    You have full Starter plan access.{" "}
                    {sub?.trialEndsAt && <>Expires {new Date(sub.trialEndsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.</>}
                  </p>
                </div>
              </div>
            )}

            {isPaid && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-900">{planLabel} plan — active</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    To change or cancel, email{" "}
                    <a href="mailto:support@cridl.com" className="underline hover:text-green-900">support@cridl.com</a>.
                  </p>
                </div>
              </div>
            )}

            {isFree && !isTrial && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">You&apos;re on the Free plan</p>
                  <p className="text-xs text-amber-700 mt-0.5">5 posts/month, 2 AI images. Upgrade for more.</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Usage This Month ── */}
          {usage && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-slate-400" />
                <p className="text-sm font-semibold text-slate-700">Usage this month</p>
              </div>
              <UsageBar label="Posts generated"      used={usage.postsGenerated}      limit={usage.limits.postsPerMonth} />
              <UsageBar label="AI images"            used={usage.imagesGenerated}      limit={usage.limits.imagesPerMonth} />
              {usage.limits.faceImagesPerMonth > 0 && (
                <UsageBar label="Face images (Use My Face)" used={usage.faceImagesGenerated} limit={usage.limits.faceImagesPerMonth} />
              )}
              <p className="text-xs text-slate-400 pt-1">Usage resets on the 1st of each month.</p>
            </div>
          )}

          {/* ── Promo Code ── */}
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
                      {redeemLoading ? "Activating…" : "Activate"}
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

          {/* ── Upgrade Plans — always visible ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">
                {isTrial ? "Upgrade before your trial ends" : isPaid ? "Change your plan" : "Upgrade your plan"}
              </p>
            </div>
            <UpgradePlans />
          </div>
        </>
      )}
    </div>
  );
}
