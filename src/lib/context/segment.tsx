"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type Segment = "individual" | "corporate";

interface SegmentContextValue {
  segment: Segment;
  setSegment: (s: Segment) => void;
  isIndividual: boolean;
  isCorporate: boolean;
  segmentReady: boolean;
}

const SegmentContext = createContext<SegmentContextValue>({
  segment: "individual",
  setSegment: () => {},
  isIndividual: true,
  isCorporate: false,
  segmentReady: false,
});

const STORAGE_KEY = "cridl_active_segment";

export function SegmentProvider({ children }: { children: React.ReactNode }) {
  const [segment, setSegmentState] = useState<Segment>("individual");
  const [segmentReady, setSegmentReady] = useState(false);

  // Read from localStorage on mount — sets segmentReady when done
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Segment | null;
      if (stored === "individual" || stored === "corporate") {
        setSegmentState(stored);
      }
    } catch {}
    setSegmentReady(true);
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
      segmentReady,
    }}>
      {children}
    </SegmentContext.Provider>
  );
}

export function useSegment() {
  return useContext(SegmentContext);
}
