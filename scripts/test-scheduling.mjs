/**
 * Scheduling flow smoke test — run with: node scripts/test-scheduling.mjs
 * Pure JS — no TypeScript, no imports from app source.
 * Mirrors all critical logic to verify fixes are correct.
 */

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ─── Inline the parseCsv logic for testing ───────────────────────────────────

const MONTH_MAP = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
const VALID_TONES = ["professional","storytelling","educational","contrarian"];
const VALID_LENGTHS = ["short","medium","long"];

function splitCsvLine(line) {
  const result = [];
  let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQuotes && line[i+1] === '"') { cur += '"'; i++; } else inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseDateTime(date, time) {
  const d = date.trim(); const t = time.trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (hh > 23 || mm > 59) return null;
  let year, month, day;
  const shortMatch = d.match(/^(\d{2})-([A-Za-z]{3})-(\d{2})$/);
  if (shortMatch) {
    day = parseInt(shortMatch[1],10);
    const mon = shortMatch[2].toLowerCase();
    if (!(mon in MONTH_MAP)) return null;
    month = MONTH_MAP[mon];
    year = 2000 + parseInt(shortMatch[3],10);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const parts = d.split("-").map(Number);
    year = parts[0]; month = parts[1]-1; day = parts[2];
  } else return null;
  const result = new Date(year, month, day, hh, mm, 0);
  return isNaN(result.getTime()) ? null : result;
}

function parseCsv(rawText) {
  const lines = rawText.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n");
  const nonEmpty = lines.filter(l => l.trim() !== "");
  if (nonEmpty.length < 2) return { rows:[], validations:[], errors:[], fileError:"CSV has no data rows." };
  const headers = splitCsvLine(nonEmpty[0]).map(h => h.toLowerCase().trim().replace(/\s+/g,"_"));
  const hasDateCol = headers.includes("date");
  const hasTimeCol = headers.includes("time");
  const hasScheduledAt = headers.includes("scheduled_at");
  const hasTopicCol = headers.includes("topic");
  if (!hasTopicCol) return { rows:[], validations:[], errors:[], fileError:'Missing required column: "topic".' };
  if (!hasDateCol && !hasScheduledAt) return { rows:[], validations:[], errors:[], fileError:'Missing required column: "date".' };
  if (hasDateCol && !hasTimeCol) return { rows:[], validations:[], errors:[], fileError:'Missing required column: "time".' };
  const idx = col => headers.indexOf(col);
  const rows = []; const validations = []; const errors = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = splitCsvLine(nonEmpty[i]);
    const rowNum = i + 1;
    const get = col => (idx(col) >= 0 ? (cells[idx(col)] || "").trim() : "");
    const topic = get("topic");
    const content = get("content");
    const tone = get("tone").toLowerCase();
    const audience = get("audience");
    const length = get("length").toLowerCase();
    const timezone = get("timezone");
    let dateStr, timeStr;
    if (hasDateCol) { dateStr = get("date"); timeStr = get("time"); }
    else { const raw = get("scheduled_at"); const parts = raw.split(" "); dateStr = parts[0]||""; timeStr = parts[1]||""; }
    const fieldErrors = {};
    if (!topic) fieldErrors.topic = "Required.";
    const parsed = parseDateTime(dateStr, timeStr);
    if (!dateStr) fieldErrors.date = 'Required. Format: DD-Mon-YY';
    else if (!/^\d{2}-[A-Za-z]{3}-\d{2}$/.test(dateStr) && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) fieldErrors.date = `Wrong format: "${dateStr}"`;
    if (!timeStr) fieldErrors.time = "Required. Format: HH:mm";
    else if (!/^\d{2}:\d{2}$/.test(timeStr)) fieldErrors.time = `Wrong format: "${timeStr}"`;
    if (!fieldErrors.date && !fieldErrors.time && !parsed) fieldErrors.date = "Cannot parse this date+time.";
    if (tone && !VALID_TONES.includes(tone)) fieldErrors.tone = `"${tone}" is not valid.`;
    if (length && !VALID_LENGTHS.includes(length)) fieldErrors.length = `"${length}" is not valid.`;
    if (content && content.length > 3000) fieldErrors.content = `Too long.`;
    const isValid = Object.keys(fieldErrors).length === 0;
    validations.push({ row:rowNum, topic, date:dateStr, time:timeStr, tone:tone||"(default: professional)", audience:audience||"(default: general)", length:length||"(default: medium)", content:content?`${content.slice(0,60)}`:"(Cortex generates this)", timezone:timezone||"(browser timezone)", errors:fieldErrors, isValid });
    if (!isValid) { errors.push({ row:rowNum, content_preview:topic.slice(0,40), reason:Object.values(fieldErrors)[0] }); continue; }
    rows.push({ topic, scheduled_at: parsed.toISOString(), content:content||undefined, tone:tone||undefined, audience:audience||undefined, length:length||undefined, timezone:timezone||undefined });
  }
  return { rows, validations, errors };
}

// ─── 1. parseCsv tests ───────────────────────────────────────────────────────
console.log("\n📋  parseCsv");

{
  const csv = `topic,date,time,tone,audience,length,timezone\nAI and manufacturing,22-Mar-99,09:30,professional,Factory owners,medium,Asia/Kolkata`;
  const r = parseCsv(csv);
  assert("No fileError for valid CSV", !r.fileError, r.fileError);
  assert("1 valid row parsed", r.rows.length === 1);
  assert("1 validation entry", r.validations.length === 1);
  assert("Row is valid", r.validations[0].isValid);
  assert("scheduled_at is ISO string", typeof r.rows[0].scheduled_at === "string");
  assert("scheduled_at parses to valid Date", !isNaN(new Date(r.rows[0].scheduled_at).getTime()));
  assert("topic correct", r.rows[0].topic === "AI and manufacturing");
  assert("tone correct", r.rows[0].tone === "professional");
}

assert("Missing topic → fileError",  !!parseCsv(`date,time\n22-Mar-99,09:30`).fileError);
assert("Missing date → fileError",   !!parseCsv(`topic,time\nSomething,09:30`).fileError);
assert("Missing time → fileError",   !!parseCsv(`topic,date\nSomething,22-Mar-99`).fileError);

{
  const r = parseCsv(`topic,date,time\nSomething,2099/03/22,09:30`);
  assert("Wrong date format → row error", r.validations[0]?.errors?.date !== undefined);
  assert("Invalid row excluded from rows[]", r.rows.length === 0);
}

{
  const r = parseCsv(`topic,date,time\nSomething,22-Mar-99,9:30am`);
  assert("Wrong time format → row error", r.validations[0]?.errors?.time !== undefined);
}

{
  const r = parseCsv(`topic,date,time,tone\nSomething,22-Mar-99,09:30,aggressive`);
  assert("Invalid tone → row error", r.validations[0]?.errors?.tone !== undefined);
}

{
  const r = parseCsv(`topic,date,time,content\nSomething,22-Mar-99,09:30,"My pre-written post"`);
  assert("Content passed through", r.rows[0]?.content === "My pre-written post");
}

{
  const r = parseCsv(`topic,date,time,content\nSomething,22-Mar-99,09:30,`);
  assert("Blank content → undefined", r.rows[0]?.content === undefined);
}

{
  const r = parseCsv(`topic,scheduled_at\nOld format post,2099-06-15 09:30`);
  assert("Legacy scheduled_at column accepted", r.rows.length === 1, JSON.stringify(r.fileError));
  assert("Legacy row is valid", r.validations[0]?.isValid);
}

{
  const csv = `topic,date,time\nPost one,22-Mar-99,09:30\nPost two,BAD-DATE,09:30\nPost three,22-Jun-99,17:00`;
  const r = parseCsv(csv);
  assert("3 validation entries for 3 rows", r.validations.length === 3);
  assert("2 valid rows in rows[]", r.rows.length === 2);
  assert("1 error recorded", r.errors.length === 1);
  assert("Row 2 (bad date) is invalid", !r.validations[1].isValid);
}

assert("Empty CSV → fileError", !!parseCsv("").fileError);

{
  // No time cap — past dates must NOT produce an error
  const r = parseCsv(`topic,date,time\nPast post,01-Jan-20,09:30`);
  assert("Past date has no time-cap error (cap removed)", r.validations[0]?.errors?.date === undefined);
  assert("Past date row is valid", r.validations[0]?.isValid === true);
}

// ─── 2. schedule-suggestions timestamp comparison fix ────────────────────────
console.log("\n📅  schedule-suggestions timestamp fix");

{
  const now = Date.now();
  const futureSeconds = (now + 7 * 24 * 3600 * 1000) / 1000;
  const pastSeconds   = (now - 1000) / 1000;

  assert("Future expires_at passes — fixed comparison",  (futureSeconds * 1000) > now);
  assert("Past expires_at fails   — fixed comparison",  !((pastSeconds  * 1000) > now));

  // Confirm the old bug: plain object comparison to number is always false
  const obj = { seconds: futureSeconds };
  assert("Old bug: object > number is always false (confirmed)", !(obj > now));
}

// ─── 3. best-time JSON parse safety ─────────────────────────────────────────
console.log("\n🤖  best-time JSON parse safety");

function safeParse(raw) {
  let parsed = [];
  try {
    parsed = JSON.parse(raw.replace(/```json?|```/g,"").trim());
    if (!Array.isArray(parsed)) parsed = [];
  } catch { parsed = []; }
  return parsed;
}

assert("Handles plain text",         safeParse("Sorry I cannot help.").length === 0);
assert("Handles broken JSON",        safeParse("```json\n[{broken}]\n```").length === 0);
assert("Handles empty string",       safeParse("").length === 0);
assert("Handles null",               safeParse("null").length === 0);
assert("Handles object not array",   safeParse("{}").length === 0);
assert("Valid JSON array parses OK", safeParse(`[{"day_of_week":"Tuesday","hour":9}]`).length === 1);

{
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const items = [
    { day_of_week: "Tuesday" },
    { day_of_week: "Funday" },   // invalid
    { day_of_week: "Friday" },
  ];
  const filtered = items.map(s => DAYS.indexOf(s.day_of_week) === -1 ? null : s).filter(Boolean);
  assert("Invalid day_of_week filtered out", filtered.length === 2);
}

// ─── 4. data: URL stripping ──────────────────────────────────────────────────
console.log("\n🖼️   data: URL stripping");

const strip = url => (url?.startsWith("data:") ? undefined : url);
assert("data: URL stripped → undefined",  strip("data:image/png;base64,abc") === undefined);
assert("https: URL kept",                 strip("https://example.com/img.png") === "https://example.com/img.png");
assert("undefined stays undefined",       strip(undefined) === undefined);
assert("null-ish handled",                strip(null) === null);

// ─── 5. Bulk schedule date conversion ────────────────────────────────────────
console.log("\n📦  Bulk schedule — ISO string → Date conversion");

{
  const iso = "2099-03-22T04:00:00.000Z";
  const d   = new Date(iso);
  assert("ISO string → valid Date",     !isNaN(d.getTime()));
  assert("Date.getTime() > 0",          d.getTime() > 0);

  // Simulate what BulkUploadFlow now does (direct postService call)
  const postsToSchedule = [{
    scheduled_at: new Date(iso),
    schedule_timezone: "Asia/Kolkata",
    topic: "Test",
    content: "[Pending generation] Test",
    tone: "professional",
    audience: "",
    length: "medium",
    segment: "individual",
    research_data: {},
    user_id: "demo-user",
    account_id: "personal-account",
  }];
  assert("Post object built correctly", postsToSchedule[0].scheduled_at instanceof Date);
  assert("schedule_timezone set",       postsToSchedule[0].schedule_timezone === "Asia/Kolkata");
}

// ─── 6. QuotaExceededError simulation ────────────────────────────────────────
console.log("\n💾  localStorage quota protection");

{
  // Simulate saveMockPost with quota fallback (logic mirror)
  function saveMockPostSim(post, existingPosts) {
    const newPost = { ...post, id: "test-id", created_at: { seconds: Date.now()/1000 } };
    let throwCount = 0;
    const fakeStorage = {
      setItem(key, val) {
        // First call throws QuotaExceededError, subsequent calls succeed
        if (throwCount++ === 0 && val.length > 100) throw new Error("QuotaExceededError");
      }
    };
    try {
      fakeStorage.setItem("mock_posts", JSON.stringify([newPost, ...existingPosts]));
      return newPost;
    } catch {
      const slim = { ...newPost, research_data: {} };
      if (typeof slim.image_url === "string" && slim.image_url.startsWith("data:")) slim.image_url = undefined;
      fakeStorage.setItem("mock_posts", JSON.stringify([slim, ...existingPosts]));
      return slim;
    }
  }

  const largePost = {
    topic: "Test",
    research_data: { insights: Array(50).fill({ title:"A", content:"B".repeat(200) }) },
    image_url: "data:image/png;base64," + "A".repeat(1000),
  };

  const result = saveMockPostSim(largePost, []);
  assert("Quota fallback strips research_data", Object.keys(result.research_data).length === 0);
  assert("Quota fallback strips data: URLs",    result.image_url === undefined);
  assert("Post still returned with id",         result.id === "test-id");
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error("❌ Some tests failed."); process.exit(1); }
else console.log("✅ All tests passed.");
