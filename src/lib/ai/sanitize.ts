/**
 * Prompt input sanitization utilities.
 * Prevents prompt injection via user-controlled fields that are interpolated
 * directly into system/user prompts sent to language models.
 */

/**
 * Sanitizes a user-supplied string before it is interpolated into an AI prompt.
 * - Enforces a maximum character length
 * - Strips characters and sequences commonly used for prompt injection
 */
export function sanitizePromptInput(raw: string | undefined | null, maxLength: number): string {
  if (!raw) return "";
  // Truncate first — don't process huge strings
  let s = raw.slice(0, maxLength);
  // Strip common prompt-injection delimiters
  s = s
    .replace(/```[\s\S]*?```/g, "") // strip fenced code blocks (used to escape context)
    .replace(/<\|[\s\S]*?\|>/g, "") // strip special tokens (e.g. <|system|>)
    .replace(/={10,}/g, "")         // strip long separator lines (used to fake new sections)
    .replace(/\[INST\]|\[\/INST\]/gi, "") // strip Llama instruction tags
    .trim();
  return s;
}
