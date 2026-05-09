/**
 * Injects current date/time into every LLM call so the model never assumes
 * an older year from its training cutoff. Every Cortex agent (research, angle
 * engine, writer, idea, voice DNA, rewrite, score, memory extract, etc.) must
 * route messages through `withDateContext()` before sending to OpenRouter.
 *
 * Why: an Apr 2026 post referenced "the major shift in 2024 in AI" — the model
 * defaulted to its training-cutoff year because no current date was passed in.
 */

export function getCurrentDateContext(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
  const year = now.getUTCFullYear();
  return `CURRENT CONTEXT (read before reasoning):
- Today is ${dateStr}.
- Current UTC time: ${timeStr}.
- Year: ${year}.
When reasoning about "current," "recent," "now," "today," "this year," "last year," or any temporal claim, anchor to this date. Never assume an older year just because your training data ends earlier — treat anything since your cutoff as recent and present-tense. If you reference a year, it must be ${year} or earlier (never a future year, never an older year you imagine is current).`;
}

/**
 * Prepends a system message carrying the current date to a messages array.
 * If the first message is already `system` with string content, the date is
 * merged into its content instead of inserting a new message.
 *
 * Typed loosely as `any[]` because call sites use multiple shapes:
 *   - OpenAI SDK's `ChatCompletionMessageParam` (discriminated union)
 *   - Plain `{role, content}` objects passed via fetch
 * A strict generic widens literal types and breaks SDK overload matching.
 */
export function withDateContext<T extends readonly any[]>(messages: T): T {
  const dateBlock = getCurrentDateContext();
  const first = messages[0] as any;
  if (first && first.role === "system" && typeof first.content === "string") {
    const merged = { ...first, content: `${dateBlock}\n\n${first.content}` };
    return [merged, ...messages.slice(1)] as unknown as T;
  }
  const dateMsg = { role: "system", content: dateBlock };
  return [dateMsg, ...messages] as unknown as T;
}
