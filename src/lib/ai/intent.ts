/**
 * Intent classification for a user-supplied topic.
 *
 * Pure, edge-safe (no Firestore, no openrouter, no "use server"). Imported by
 * both the server-action research module and the edge research route so the
 * two paths can never drift.
 *
 * "personal" → strip brand/product fields from research + generation; the post
 * is a story or reflection, not a sales asset.
 * "professional" → apply full brand context.
 *
 * Patterns include both past-tense and gerund forms ("watched"/"watching",
 * "listened"/"listening", "read"/"reading") because users phrase the prompt in
 * either tense interchangeably ("Watching Citadel — AI in spy networks…" must
 * classify as personal, same as "Watched Citadel last night…").
 */

export type IntentType = "personal" | "professional";

export const PERSONAL_SIGNALS: RegExp[] = [
  // Media-consumption verbs — past + gerund forms (was past-only, missed
  // "watching Citadel"). Bare "see" is excluded — too common in professional
  // phrasing ("see results", "see growth"). "seeing" alone is reflective enough.
  /\bwatch(ed|ing)\b/,
  /\bsaw\b/,
  /\bseeing\b/,
  /\blisten(ed|ing)\b/,
  /\bread(ing)?\b/,
  // Specific media nouns — high-signal, low false-positive
  /\bfilm\b/, /\bmovie\b/, /\bbook\b/, /\bpodcast\b/,
  // Reflective phrasing
  /\bsharing my thoughts?\b/, /\bjust (thinking|reflecting)\b/,
  /\bmy (opinion|view|take)\b/, /\bi (realized|noticed|felt)\b/,
  /\bpersonal(ly)?\b/, /\blife lesson\b/, /\bunpopular opinion\b/,
  /\brecently i\b/,
];

export function detectIntent(topic: string): IntentType {
  const lower = (topic || "").toLowerCase();
  return PERSONAL_SIGNALS.some((re) => re.test(lower)) ? "personal" : "professional";
}
