"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/context/auth";

interface PlanStatus {
  plan: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  subscriptionId: string | null;
  billingPeriod: "monthly" | "yearly" | null;
  loading: boolean;
}

const defaults: PlanStatus = {
  plan: "free", status: "free", trialEndsAt: null,
  currentPeriodEnd: null, subscriptionId: null, billingPeriod: null,
  loading: true,
};

const PlanStatusContext = createContext<PlanStatus>(defaults);

export function PlanStatusProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<PlanStatus>(defaults);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState(s => ({ ...s, loading: false })); return; }

    user.getIdToken().then(tok =>
      fetch("/api/subscriptions/status", { headers: { Authorization: `Bearer ${tok}` } })
    ).then(res => res.ok ? res.json() : null).then(data => {
      if (data) setState({
        plan: data.plan || "free",
        status: data.status || "free",
        trialEndsAt: data.trialEndsAt || null,
        currentPeriodEnd: data.currentPeriodEnd || null,
        subscriptionId: data.subscriptionId || null,
        billingPeriod: data.billingPeriod || null,
        loading: false,
      });
      else setState(s => ({ ...s, loading: false }));
    }).catch(() => setState(s => ({ ...s, loading: false })));
  }, [user, authLoading]);

  return <PlanStatusContext.Provider value={state}>{children}</PlanStatusContext.Provider>;
}

export function usePlanStatus() { return useContext(PlanStatusContext); }
