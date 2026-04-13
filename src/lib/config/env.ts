/**
 * Environment variable validation for Node.js runtime routes.
 * Call validateRequiredEnvVars() at the top of any server module that needs
 * these vars — it throws immediately with a clear message on misconfiguration
 * rather than failing cryptically at the first API call.
 *
 * Do NOT import this in Edge Runtime files (no process.env access at module load).
 */

const REQUIRED_VARS: Record<string, string> = {
  OPENROUTER_API_KEY: "Required for all AI generation (OpenRouter)",
  INTERNAL_API_SECRET: "Required for internal API route security (tokens/save)",
  CRON_SECRET: "Required to authenticate the scheduled post worker",
  NEXT_PUBLIC_FIREBASE_API_KEY: "Required for Firebase client SDK",
  FIREBASE_SERVICE_ACCOUNT_JSON: "Required for Firebase Admin SDK (server routes)",
};

let validated = false;

export function validateRequiredEnvVars(): void {
  if (validated) return; // only check once per process lifetime
  const missing: string[] = [];
  for (const [key, description] of Object.entries(REQUIRED_VARS)) {
    if (!process.env[key]) {
      missing.push(`  - ${key}: ${description}`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables:\n${missing.join("\n")}\n\nSet these in your .env.local file or Vercel dashboard.`
    );
  }
  validated = true;
}
