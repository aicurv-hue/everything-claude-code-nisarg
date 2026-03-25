"use client";

import { useRef, useState } from "react";
import {
  Upload, CheckCircle, AlertCircle, Download, ArrowLeft,
  CalendarDays, X, AlertTriangle, Info
} from "lucide-react";
import { parseCsv, ParsedCsvRow, RowValidation, RowError, CSV_TEMPLATE, VALID_TONES, VALID_LENGTHS } from "@/lib/utils/parseCsv";
import { postService } from "@/lib/db/posts";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { useAuth } from "@/lib/context/auth";

interface Props {
  segment: "individual" | "corporate";
  onComplete: (result: { scheduled: number; errors: number }) => void;
  onViewCalendar: () => void;
}

type Step = 1 | 2 | 3;

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "linkauto-bulk-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

/** Cell: shows a value with a red error badge if invalid */
function ValidationCell({ value, error }: { value: string; error?: string }) {
  if (!error) {
    return <span className="text-xs text-slate-700">{value || <span className="text-slate-400 italic">—</span>}</span>;
  }
  return (
    <div>
      <span className="text-xs text-red-600 font-medium">{value || "missing"}</span>
      <p className="text-[10px] text-red-400 leading-tight mt-0.5">{error}</p>
    </div>
  );
}

export default function BulkUploadFlow({ segment, onComplete, onViewCalendar }: Props) {
  const { user } = useAuth();
  const isCorp     = segment === "corporate";
  const accent     = isCorp ? "bg-violet-600 hover:bg-violet-700" : "bg-[#0A66C2] hover:bg-[#0854a0]";
  const accentText = isCorp ? "text-violet-600" : "text-[#0A66C2]";
  const fileRef    = useRef<HTMLInputElement>(null);

  const [step, setStep]               = useState<Step>(1);
  const [rows, setRows]               = useState<ParsedCsvRow[]>([]);
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [parseErrors, setParseErrors] = useState<RowError[]>([]);
  const [fileError, setFileError]     = useState<string | null>(null);
  const [fileName, setFileName]       = useState("");
  const [isDragging, setIsDragging]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult]           = useState<{ scheduled: number; errors: number } | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setFileError("File exceeds 5 MB limit."); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows: r, validations: v, errors: er, fileError: fe } = parseCsv(text);
      if (fe) { setFileError(fe); return; }
      setFileError(null);
      setRows(r);
      setValidations(v);
      setParseErrors(er);
      setStep(2);
    };
    reader.readAsText(file);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) processFile(f);
  };

  const handleSubmit = async () => {
    if (!rows.length || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const postsToSchedule = rows.map((r) => ({
        user_id:           user!.uid,
        account_id:        "personal-account",
        content:           r.content || `[Pending generation] ${r.topic}`,
        topic:             r.topic,
        tone:              r.tone     || "professional",
        audience:          r.audience || "",
        length:            (r.length  || "medium") as "short" | "medium" | "long",
        segment,
        research_data:     {},
        scheduled_at:      new Date(r.scheduled_at),
        schedule_timezone: r.timezone || tz,
      }));

      const result = await postService.createBulkScheduled(postsToSchedule);
      const summary = { scheduled: result.created.length, errors: result.errors.length };
      setResult(summary);
      onComplete(summary);
      setStep(3);
    } catch (err: any) {
      setFileError(`Scheduling failed: ${err?.message || "Please try again."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1); setRows([]); setValidations([]); setParseErrors([]);
    setFileError(null); setFileName(""); setResult(null); setShowAllRows(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ───────────────────────────────────────────────
     STEP 1 — Upload
  ─────────────────────────────────────────────── */
  if (step === 1) return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Bulk Schedule via CSV</h2>
          <p className="text-sm text-slate-500 mt-0.5">Plan weeks of content at once — up to 500 posts per file</p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-all"
        >
          <Download className="w-4 h-4" /> Download Template
        </button>
      </div>

      {/* Column guide */}
      <div className="card p-5 space-y-4">
        <div className="flex items-start gap-2">
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-0.5">How it works</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Fill in your topics and schedule dates. Neel will generate the post text automatically at publish time.
              If you already have written posts, paste them in the <code className="bg-slate-100 px-1 rounded">content</code> column — they'll be used as-is.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">Column reference</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
            {[
              {
                col: "topic", req: true,
                note: "What this post is about — Neel generates the post from this",
                help: "Be specific: 'How AI is reducing energy costs in Indian manufacturing' is better than 'AI'. The more detail, the better the generated post.",
              },
              {
                col: "date", req: true,
                note: "Publish date — format: DD-Mon-YY",
                help: "Use format: DD-Mon-YY. Examples: 22-Mar-27 = 22 March 2027, 05-Jun-26 = 5 June 2026, 01-Jan-28 = 1 January 2028. Must be a future date.",
              },
              {
                col: "time", req: true,
                note: "Publish time — format: HH:mm (24-hour)",
                help: "Use 24-hour format. 09:30 = 9:30 AM. 17:00 = 5 PM. 13:00 = 1 PM.",
              },
              {
                col: "content", req: false,
                note: "Pre-written post text (optional — Neel generates if left blank)",
                help: "Leave blank = Neel generates the post automatically using your topic + profile. Fill in = your text is used as-is, no generation happens.",
              },
              {
                col: "tone", req: false,
                note: `One of: ${VALID_TONES.join(", ")}`,
                help: `professional = data-driven insight hook\nstorytelling = personal moment, scene-setting\neducational = how-to with numbered steps\ncontrarian = challenges a belief with data\nDefault: professional`,
              },
              {
                col: "audience", req: false,
                note: "Who you're writing for (free text)",
                help: "Describe your reader: 'Factory owners in Gujarat', 'B2B SaaS founders', 'Marketing managers at mid-size companies'. Default: general professional audience.",
              },
              {
                col: "length", req: false,
                note: `One of: ${VALID_LENGTHS.join(", ")}`,
                help: "short ≈ 100 words (tight hooks and punchy lines)\nmedium ≈ 200 words (sweet spot for most posts)\nlong ≈ 400 words (deep-dive thought leadership)\nDefault: medium",
              },
              {
                col: "timezone", req: false,
                note: `IANA timezone (default: ${tz})`,
                help: `Common values:\n• Asia/Kolkata (India)\n• Asia/Dubai (UAE)\n• Europe/London (UK)\n• America/New_York (US East)\n• America/Los_Angeles (US West)\nLeave blank = uses ${tz}`,
              },
            ].map(({ col, req, note, help }) => (
              <div key={col} className="flex items-start gap-2">
                <div className={`mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${req ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500"}`}>
                  {req ? "REQ" : "OPT"}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    <code className="text-xs font-mono font-semibold text-slate-800">{col}</code>
                    <HelpTooltip text={help} position="right" width="w-72" />
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-[11px] text-blue-700 leading-relaxed">
          <strong>Quickest way to start:</strong> Download the template → open in Excel or Google Sheets → fill in <code className="bg-blue-100 px-1 rounded">topic</code>, <code className="bg-blue-100 px-1 rounded">date</code>, and <code className="bg-blue-100 px-1 rounded">time</code> → save as CSV → upload here. Everything else defaults automatically.
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? (isCorp ? "border-violet-400 bg-violet-50" : "border-[#0A66C2] bg-blue-50")
            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
        }`}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isCorp ? "bg-violet-100" : "bg-blue-100"}`}>
            <Upload className={`w-6 h-6 ${isCorp ? "text-violet-600" : "text-[#0A66C2]"}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Drop your CSV here, or click to browse</p>
            <p className="text-xs text-slate-400 mt-1">Supports .csv files up to 5 MB · max 500 rows</p>
          </div>
        </div>
      </div>

      {fileError && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-600">File Error</p>
            <p className="text-xs text-red-500 mt-0.5">{fileError}</p>
          </div>
        </div>
      )}
    </div>
  );

  /* ───────────────────────────────────────────────
     STEP 2 — Validation Preview Table
  ─────────────────────────────────────────────── */
  if (step === 2) {
    const invalidCount = validations.filter((v) => !v.isValid).length;
    const validCount   = validations.filter((v) => v.isValid).length;
    const displayRows  = showAllRows ? validations : validations.slice(0, 20);

    return (
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={reset} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-all">
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Review & Validate</h2>
            <p className="text-sm text-slate-500">{fileName} — {validations.length} rows found</p>
          </div>
        </div>

        {/* Summary bar */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs font-semibold text-green-700">
            <CheckCircle className="w-3.5 h-3.5" /> {validCount} ready to schedule
          </div>
          {invalidCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-600">
              <AlertCircle className="w-3.5 h-3.5" /> {invalidCount} rows have errors — fix in CSV and re-upload
            </div>
          )}
          {invalidCount === 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-semibold text-[#0A66C2]">
              <CheckCircle className="w-3.5 h-3.5" /> All rows are valid
            </div>
          )}
        </div>

        {/* How to read this table */}
        {invalidCount > 0 && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Red cells = errors that must be fixed.</strong> Hover any red cell to see the exact fix needed.
              Fix these in your CSV file, then re-upload. Rows with errors will not be scheduled — all valid rows will still go through.
            </div>
          </div>
        )}

        {/* Validation table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                  <th className="px-3 py-2.5 w-8">#</th>
                  <th className="px-3 py-2.5 w-6"></th>
                  <th className="px-3 py-2.5">Topic</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Time</th>
                  <th className="px-3 py-2.5">Tone</th>
                  <th className="px-3 py-2.5">Length</th>
                  <th className="px-3 py-2.5">Content</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayRows.map((v) => (
                  <tr
                    key={v.row}
                    className={`transition-colors ${
                      v.isValid ? "hover:bg-slate-50" : "bg-red-50/40 hover:bg-red-50"
                    }`}
                  >
                    {/* Row number */}
                    <td className="px-3 py-2.5 text-[11px] text-slate-400 font-mono">{v.row}</td>

                    {/* Status icon */}
                    <td className="px-3 py-2.5">
                      {v.isValid
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        : <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      }
                    </td>

                    {/* Topic */}
                    <td className={`px-3 py-2.5 max-w-[180px] ${v.errors.topic ? "bg-red-100/60" : ""}`}>
                      <ValidationCell value={v.topic} error={v.errors.topic} />
                    </td>

                    {/* Date */}
                    <td className={`px-3 py-2.5 ${v.errors.date ? "bg-red-100/60" : ""}`}>
                      <ValidationCell value={v.date} error={v.errors.date} />
                    </td>

                    {/* Time */}
                    <td className={`px-3 py-2.5 ${v.errors.time ? "bg-red-100/60" : ""}`}>
                      <ValidationCell value={v.time} error={v.errors.time} />
                    </td>

                    {/* Tone */}
                    <td className={`px-3 py-2.5 ${v.errors.tone ? "bg-red-100/60" : ""}`}>
                      {v.errors.tone ? (
                        <ValidationCell value={v.tone} error={v.errors.tone} />
                      ) : (
                        <span className={`text-[11px] px-2 py-0.5 rounded capitalize font-medium ${
                          v.tone.startsWith("(") ? "text-slate-400" : "bg-blue-50 text-blue-700"
                        }`}>
                          {v.tone}
                        </span>
                      )}
                    </td>

                    {/* Length */}
                    <td className={`px-3 py-2.5 ${v.errors.length ? "bg-red-100/60" : ""}`}>
                      {v.errors.length ? (
                        <ValidationCell value={v.length} error={v.errors.length} />
                      ) : (
                        <span className={`text-[11px] px-2 py-0.5 rounded capitalize ${
                          v.length.startsWith("(") ? "text-slate-400" : "bg-slate-100 text-slate-600"
                        }`}>
                          {v.length}
                        </span>
                      )}
                    </td>

                    {/* Content */}
                    <td className={`px-3 py-2.5 max-w-[200px] ${v.errors.content ? "bg-red-100/60" : ""}`}>
                      {v.errors.content ? (
                        <ValidationCell value={v.content} error={v.errors.content} />
                      ) : (
                        <span className={`text-[11px] ${v.content === "(Neel generates this)" ? "text-slate-400 italic" : "text-slate-600"}`}>
                          {v.content}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validations.length > 20 && (
            <div className="border-t border-slate-100 px-4 py-3 text-center">
              <button
                onClick={() => setShowAllRows(!showAllRows)}
                className="text-xs text-slate-500 hover:text-slate-700 transition-colors font-medium"
              >
                {showAllRows
                  ? "Show fewer rows"
                  : `Show all ${validations.length} rows (currently showing 20)`}
              </button>
            </div>
          )}
        </div>

        {/* Acceptable values reference */}
        <div className="card p-4 bg-slate-50 border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Valid values reference</p>
          <div className="grid grid-cols-3 gap-3 text-[11px]">
            <div>
              <p className="font-semibold text-slate-600 mb-1">tone</p>
              {VALID_TONES.map(t => <p key={t} className="text-slate-400">• {t}</p>)}
            </div>
            <div>
              <p className="font-semibold text-slate-600 mb-1">length</p>
              {VALID_LENGTHS.map(l => <p key={l} className="text-slate-400">• {l}</p>)}
            </div>
            <div>
              <p className="font-semibold text-slate-600 mb-1">date / time format</p>
              <p className="text-slate-400">date: 22-Mar-27</p>
              <p className="text-slate-400">time: 09:30 or 17:00</p>
              <p className="text-slate-400 mt-1 text-[10px]">DD-Mon-YY · 24-hour · future only</p>
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
          >
            ← Re-upload CSV
          </button>
          <button
            onClick={handleSubmit}
            disabled={rows.length === 0 || isSubmitting}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 ${accent}`}
          >
            {isSubmitting
              ? "Scheduling…"
              : rows.length === 0
              ? "No valid rows to schedule"
              : `Schedule ${rows.length} Valid Post${rows.length !== 1 ? "s" : ""}${invalidCount > 0 ? ` (skip ${invalidCount} errors)` : ""}`}
          </button>
        </div>
      </div>
    );
  }

  /* ───────────────────────────────────────────────
     STEP 3 — Success
  ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-col items-center py-12 text-center space-y-5">
      <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
        <CheckCircle className="w-8 h-8 text-green-600" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-900">Upload Complete!</h2>
        <p className="text-sm text-slate-500 mt-1">
          {result?.scheduled} post{(result?.scheduled || 0) !== 1 ? "s" : ""} added to your content calendar
          {(result?.errors || 0) > 0 ? ` · ${result?.errors} rows skipped (had errors)` : ""}
        </p>
      </div>

      <div className="max-w-sm text-[12px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-left space-y-1.5">
        <p>✅ Posts are now visible on your <strong>Schedule calendar</strong></p>
        <p>🤖 Neel will generate post text automatically at publish time (for rows where content was left blank)</p>
        <p>🔗 Posts publish automatically once you connect your LinkedIn account</p>
        <p>✏️ Click any post in the calendar to reschedule or delete it</p>
      </div>

      {(result?.errors || 0) > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700 max-w-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {result?.errors} rows were skipped due to errors. Fix them in your CSV and re-upload to add them.
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
        >
          <Upload className="w-4 h-4" /> Upload Another
        </button>
        <button
          onClick={onViewCalendar}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${accent}`}
        >
          <CalendarDays className="w-4 h-4" /> View Calendar
        </button>
      </div>
    </div>
  );
}
