"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type Segment = "individual" | "corporate";

interface SegmentContextValue {
  segment: Segment;
  setSegment: (s: Segment) => void;
  isIndividual: boolean;
  isCorporate: boolean;
}

const SegmentContext = createContext<SegmentContextValue>({
  segment: "individual",
  setSegment: () => {},
  isIndividual: true,
  isCorporate: false,
});

const STORAGE_KEY = "cridl_active_segment";

export function SegmentProvider({ children }: { children: React.ReactNode }) {
  const [segment, setSegmentState] = useState<Segment>("individual");

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Segment | null;
      if (stored === "individual" || stored === "corporate") {
        setSegmentState(stored);
      }
    } catch {}
  }, []);

  const setSegment = useCallback((s: Segment) => {
    setSegmentState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch {}
  }, []);

  return (
    <SegmentContext.Provider value={{
      segment,
      setSegment,
      isIndividual: segment === "individual",
      isCorporate:  segment === "corporate",
    }}>
      {children}
    </SegmentContext.Provider>
  );
}

export function useSegment() {
  return useContext(SegmentContext);
}
