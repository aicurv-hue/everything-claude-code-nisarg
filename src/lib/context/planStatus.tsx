"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/lib/context/auth";

interface PlanStatus {
  plan: string;
  status: string;
  trialEndsAt: string | null;
  loading: boolean;
}

const PlanStatusContext = createContext<PlanStatus>({
  plan: "free", status: "free", trialEndsAt: null, loading: true,
});

export function PlanStatusProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<PlanStatus>({
    plan: "free", status: "free", trialEndsAt: null, loading: true,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setState(s => ({ ...s, loading: false })); return; }

    user.getIdToken().then(tok =>
      fetch("/api/subscriptions/status", { headers: { Authorization: `Bearer ${tok}` } })
    ).then(res => res.ok ? res.json() : null).then(data => {
      if (data) setState({ plan: data.plan || "free", status: data.status || "free", trialEndsAt: data.trialEndsAt || null, loading: false });
      else setState(s => ({ ...s, loading: false }));
    }).catch(() => setState(s => ({ ...s, loading: false })));
  }, [user, authLoading]);

  return <PlanStatusContext.Provider value={state}>{children}</PlanStatusContext.Provider>;
}

export function usePlanStatus() { return useContext(PlanStatusContext); }
