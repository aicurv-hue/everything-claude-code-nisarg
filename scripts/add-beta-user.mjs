/**
 * Usage:
 *   node scripts/add-beta-user.mjs nisarg2526@gmail.com add
 *   node scripts/add-beta-user.mjs user@example.com remove
 *
 * Requires CRON_SECRET env var (same as set in Vercel/local .env.local)
 * and NEXT_PUBLIC_APP_URL (or pass it as 3rd arg).
 */

import { config } from "dotenv";
config({ path: ".env.local" });

const [email, action = "add"] = process.argv.slice(2);
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!email) { console.error("Usage: node scripts/add-beta-user.mjs <email> [add|remove]"); process.exit(1); }
if (!secret) { console.error("CRON_SECRET not set in .env.local"); process.exit(1); }

const res = await fetch(`${appUrl}/api/admin/beta-access`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
  body: JSON.stringify({ email, action }),
});

const data = await res.json();
if (!res.ok) { console.error("Error:", data); process.exit(1); }
console.log("✅", data);
