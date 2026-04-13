"use client";

import { useEffect, useState } from "react";
import { Copy, CheckCircle, Plus, RefreshCw } from "lucide-react";
import { auth } from "@/lib/firebase";

interface PromoCode {
  code: string;
  label: string;
  plan: string;
  trialDays: number;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string | null;
}

const PLAN_COLORS: Record<string, string> = {
  starter:  "bg-blue-500/15 text-blue-400",
  pro:      "bg-violet-500/15 text-violet-400",
  business: "bg-amber-500/15 text-amber-400",
};

async function getToken(): Promise<string | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export default function PromoCodesPage() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formPlan, setFormPlan] = useState("starter");
  const [formTrialDays, setFormTrialDays] = useState("15");
  const [formMaxUses, setFormMaxUses] = useState("");
  const [formExpiresAt, setFormExpiresAt] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formResult, setFormResult] = useState<string | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const loadCodes = async () => {
    setListLoading(true);
    setListError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/promo-codes", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) { setListError(data.error || "Failed to load codes."); return; }
      setCodes(data.codes || []);
    } catch {
      setListError("Network error.");
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { loadCodes(); }, []);

  const handleGenerate = async () => {
    setFormError(null);
    setFormResult(null);
    setFormLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          label: formLabel,
          plan: formPlan,
          trialDays: parseInt(formTrialDays) || 15,
          maxUses: formMaxUses ? parseInt(formMaxUses) : null,
          expiresAt: formExpiresAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed to generate code."); return; }
      setFormResult(data.code);
      setFormLabel("");
      setFormPlan("starter");
      setFormTrialDays("15");
      setFormMaxUses("");
      setFormExpiresAt("");
      loadCodes();
    } catch {
      setFormError("Network error.");
    } finally {
      setFormLoading(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const inputClass = "w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#0A66C2] text-sm";
  const labelClass = "block text-xs font-medium text-slate-400 mb-1";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Promo Codes</h1>
          <p className="text-slate-400 text-sm mt-1">Generate and manage trial promo codes.</p>
        </div>
        <button onClick={loadCodes} className="text-slate-400 hover:text-white transition-colors" title="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Generate form */}
      <div className="bg-slate-900 border border-white/[0.07] rounded-xl p-6 space-y-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0A66C2]" />
          Generate New Code
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Label</label>
            <input type="text" value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="e.g. ProductHunt Launch" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Plan</label>
            <select value={formPlan} onChange={e => setFormPlan(e.target.value)} className={inputClass}>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="business">Business</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Trial Days</label>
            <input type="number" value={formTrialDays} onChange={e => setFormTrialDays(e.target.value)} min="1" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Max Uses (blank = unlimited)</label>
            <input type="number" value={formMaxUses} onChange={e => setFormMaxUses(e.target.value)} min="1" placeholder="Unlimited" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Expiry Date (optional)</label>
            <input type="date" value={formExpiresAt} onChange={e => setFormExpiresAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {formError && <p className="text-sm text-red-400">{formError}</p>}
        {formResult && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <span className="font-mono text-green-400 text-lg font-bold tracking-widest">{formResult}</span>
            <button onClick={() => copyCode(formResult!)} className="text-green-400 hover:text-green-300 transition-colors">
              {copiedCode === formResult ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={formLoading}
          className="px-5 py-2 bg-[#0A66C2] hover:bg-[#0854a0] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {formLoading ? "Generating..." : "Generate Code"}
        </button>
      </div>

      {/* Codes table */}
      <div className="bg-slate-900 border border-white/[0.07] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.07]">
          <h2 className="text-sm font-semibold text-white">All Codes</h2>
        </div>
        {listLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#0A66C2] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : listError ? (
          <div className="px-6 py-8 text-sm text-red-400">{listError}</div>
        ) : codes.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-500">No promo codes yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-medium text-slate-500 uppercase tracking-wide border-b border-white/[0.07]">
                  <th className="px-6 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Label</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-left">Trial</th>
                  <th className="px-4 py-3 text-left">Uses</th>
                  <th className="px-4 py-3 text-left">Expiry</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {codes.map(c => (
                  <tr key={c.code} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-white text-xs tracking-wider">{c.code}</span>
                        <button onClick={() => copyCode(c.code)} className="text-slate-500 hover:text-slate-300 transition-colors">
                          {copiedCode === c.code ? <CheckCircle className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.label || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${PLAN_COLORS[c.plan] || "bg-slate-700 text-slate-400"}`}>
                        {c.plan || "starter"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.trialDays}d</td>
                    <td className="px-4 py-3 text-slate-300">
                      {c.usesCount} / {c.maxUses === null ? "∞" : c.maxUses}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.isActive ? "bg-green-500/15 text-green-400" : "bg-slate-700 text-slate-500"}`}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
