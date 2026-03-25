import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A66C2] to-[#0854a0] flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-base">L</span>
          </div>
          <span className="text-white font-bold text-xl tracking-tight">LinkAuto</span>
        </div>
        {children}
      </div>
    </div>
  );
}
