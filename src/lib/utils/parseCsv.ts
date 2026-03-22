/**
 * CSV parser for bulk post scheduling.
 *
 * Column structure (new format — date + time split):
 *   topic        REQ  — What the post is about. Neel generates the post from this.
 *   date         REQ  — Publish date: YYYY-MM-DD (e.g. 2026-06-15)
 *   time         REQ  — Publish time: HH:mm 24-hour (e.g. 09:30)
 *   content      OPT  — Pre-written post text. If provided, used as-is. If blank, Neel generates at publish time.
 *   tone         OPT  — professional | storytelling | educational | contrarian (default: professional)
 *   audience     OPT  — Your target reader description (default: general)
 *   length       OPT  — short | medium | long (default: medium)
 *   timezone     OPT  — IANA timezone string (default: browser timezone)
 *
 * Backward compatibility:
 *   Also accepts legacy "scheduled_at" column (YYYY-MM-DD HH:mm) in place of date + time.
 */

export interface ParsedCsvRow {
  topic: string;
  scheduled_at: string;   // ISO string, derived from date+time or scheduled_at column
  content?: string;       // Optional pre-written post. If absent, Neel generates at publish.
  tone?: string;
  audience?: string;
  length?: string;
  timezone?: string;
}

export interface RowValidation {
  row: number;
  topic: string;
  date: string;
  time: string;
  tone: string;
  audience: string;
  length: string;
  content: string;
  timezone: string;
  errors: Record<string, string>;   // field → error message
  isValid: boolean;
}

export interface RowError {
  row: number;
  content_preview: string;
  reason: string;
}

export interface ParseCsvResult {
  rows: ParsedCsvRow[];
  validations: RowValidation[];   // one entry per data row — used for the preview table
  errors: RowError[];
  fileError?: string;
}

export const VALID_TONES   = ["professional", "storytelling", "educational", "contrarian"] as const;
export const VALID_LENGTHS = ["short", "medium", "long"] as const;
const MAX_ROWS = 500;

/** Minimal RFC-4180 CSV parser — handles quoted fields with embedded commas/newlines */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parse date + time strings into a JS Date. Returns null if invalid.
 *
 * Accepted date formats:
 *   DD-Mon-YY   — e.g. 22-Mar-27  (primary — shown in template)
 *   YYYY-MM-DD  — e.g. 2027-03-22 (legacy fallback)
 *
 * Time format: HH:mm 24-hour — e.g. 09:30 or 17:00
 */
function parseDateTime(date: string, time: string): Date | null {
  const d = date.trim();
  const t = time.trim();

  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (hh > 23 || mm > 59) return null;

  let year: number, month: number, day: number;

  // Format 1: DD-Mon-YY  (e.g. 22-Mar-27)
  const shortMatch = d.match(/^(\d{2})-([A-Za-z]{3})-(\d{2})$/);
  if (shortMatch) {
    day   = parseInt(shortMatch[1], 10);
    const mon = shortMatch[2].toLowerCase();
    if (!(mon in MONTH_MAP)) return null;
    month = MONTH_MAP[mon];
    year  = 2000 + parseInt(shortMatch[3], 10);
  }
  // Format 2: YYYY-MM-DD  (e.g. 2027-03-22)
  else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const parts = d.split("-").map(Number);
    year = parts[0]; month = parts[1] - 1; day = parts[2];
  }
  else {
    return null;
  }

  const result = new Date(year, month, day, hh, mm, 0);
  return isNaN(result.getTime()) ? null : result;
}

export function parseCsv(rawText: string): ParseCsvResult {
  const lines    = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");

  if (nonEmpty.length < 2) return { rows: [], validations: [], errors: [], fileError: "CSV has no data rows." };
  if (nonEmpty.length - 1 > MAX_ROWS) return { rows: [], validations: [], errors: [], fileError: `CSV exceeds ${MAX_ROWS} rows. Split into multiple files.` };

  const headers = splitCsvLine(nonEmpty[0]).map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));

  // Detect column format: new (date + time) or legacy (scheduled_at)
  const hasDateCol      = headers.includes("date");
  const hasTimeCol      = headers.includes("time");
  const hasScheduledAt  = headers.includes("scheduled_at");
  const hasTopicCol     = headers.includes("topic");

  // Require: topic + (date & time) OR (scheduled_at)
  if (!hasTopicCol) {
    return { rows: [], validations: [], errors: [], fileError: 'Missing required column: "topic". This is what the post is about — Neel generates from it.' };
  }
  if (!hasDateCol && !hasScheduledAt) {
    return { rows: [], validations: [], errors: [], fileError: 'Missing required column: "date" (format: YYYY-MM-DD, e.g. 2026-06-15)' };
  }
  if (hasDateCol && !hasTimeCol) {
    return { rows: [], validations: [], errors: [], fileError: 'Missing required column: "time" (format: HH:mm, e.g. 09:30)' };
  }

  const idx = (col: string) => headers.indexOf(col);

  const rows:        ParsedCsvRow[]   = [];
  const validations: RowValidation[]  = [];
  const errors:      RowError[]       = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const cells  = splitCsvLine(nonEmpty[i]);
    const rowNum = i + 1;
    const get    = (col: string) => (idx(col) >= 0 ? (cells[idx(col)] || "").trim() : "");

    const topic    = get("topic");
    const content  = get("content");
    const tone     = get("tone").toLowerCase();
    const audience = get("audience");
    const length   = get("length").toLowerCase();
    const timezone = get("timezone");

    // Determine date and time strings for display + validation
    let dateStr: string;
    let timeStr: string;

    if (hasDateCol) {
      dateStr = get("date");
      timeStr = get("time");
    } else {
      // Legacy scheduled_at — split into date and time for display
      const raw = get("scheduled_at");
      const parts = raw.split(" ");
      dateStr = parts[0] || "";
      timeStr = parts[1] || "";
    }

    // Per-field validation
    const fieldErrors: Record<string, string> = {};

    if (!topic) {
      fieldErrors.topic = "Required — enter a short description of what this post should be about.";
    }

    const parsed = parseDateTime(dateStr, timeStr);
    if (!dateStr) {
      fieldErrors.date = "Required. Format: DD-Mon-YY (e.g. 22-Mar-27)";
    } else if (!/^\d{2}-[A-Za-z]{3}-\d{2}$/.test(dateStr) && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      fieldErrors.date = `Wrong format: "${dateStr}". Use DD-Mon-YY, e.g. 22-Mar-27`;
    }
    if (!timeStr) {
      fieldErrors.time = "Required. Format: HH:mm 24-hour (e.g. 09:30 or 17:00)";
    } else if (!/^\d{2}:\d{2}$/.test(timeStr)) {
      fieldErrors.time = `Wrong format: "${timeStr}". Use HH:mm, e.g. 09:30`;
    }
    if (!fieldErrors.date && !fieldErrors.time) {
      if (!parsed) {
        fieldErrors.date = `Cannot parse this date+time. Check values.`;
      }
    }

    if (tone && !VALID_TONES.includes(tone as any)) {
      fieldErrors.tone = `"${tone}" is not valid. Use one of: ${VALID_TONES.join(", ")}`;
    }
    if (length && !VALID_LENGTHS.includes(length as any)) {
      fieldErrors.length = `"${length}" is not valid. Use one of: ${VALID_LENGTHS.join(", ")}`;
    }
    if (content && content.length > 3000) {
      fieldErrors.content = `Too long (${content.length} chars). Max 3000.`;
    }

    const isValid = Object.keys(fieldErrors).length === 0;

    // Always push a validation entry (for the preview table)
    validations.push({
      row: rowNum,
      topic,
      date:     dateStr,
      time:     timeStr,
      tone:     tone || "(default: professional)",
      audience: audience || "(default: general)",
      length:   length || "(default: medium)",
      content:  content ? `${content.slice(0, 60)}${content.length > 60 ? "…" : ""}` : "(Neel generates this)",
      timezone: timezone || "(uses your browser timezone)",
      errors:   fieldErrors,
      isValid,
    });

    if (!isValid) {
      const firstError = Object.values(fieldErrors)[0];
      errors.push({ row: rowNum, content_preview: topic.slice(0, 40), reason: firstError });
      continue;
    }

    rows.push({
      topic,
      scheduled_at: parsed!.toISOString(),
      content:  content || undefined,
      tone:     tone || undefined,
      audience: audience || undefined,
      length:   length || undefined,
      timezone: timezone || undefined,
    });
  }

  return { rows, validations, errors };
}

export const CSV_TEMPLATE = `topic,date,time,content,tone,audience,length,timezone
My first LinkedIn topic — what the post is about,01-Apr-26,09:00,,professional,LinkedIn professionals,medium,Asia/Kolkata
Second topic — Neel generates if content is blank,03-Apr-26,17:00,,storytelling,Startup founders,short,Asia/Kolkata`;
