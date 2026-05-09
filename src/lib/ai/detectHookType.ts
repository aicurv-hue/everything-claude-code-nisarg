/**
 * Detects the hook type of a LinkedIn post from its opening line.
 * Pure regex — no LLM, no async, edge-safe.
 *
 * Returns one of: "stat" | "story" | "contrarian" | "question" | "observation"
 *
 * Detection order matters — more specific patterns are checked first:
 *   question   → first visible line ends with "?"
 *   stat       → first line opens with a numeric signal (number, %, $, ₹)
 *   contrarian → first line contains a negation or challenge word
 *   story      → first line opens with a personal / past-tense narrative marker
 *   observation→ everything else (default)
 */
export function detectHookType(post: string): string {
  // Skip empty lines to get to the first real content line
  const firstLine = post
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) || "";

  // Question hook: ends with "?"
  if (firstLine.endsWith("?")) return "question";

  // Stat hook: opens with a numeric signal in the first 100 chars
  if (/^[\d$₹€£]/.test(firstLine)) return "stat";
  if (/\b\d+(%|x|X| percent| million| billion| lakhs?| crores?| hrs?| hours?| mins?| days?| weeks?| years?)/.test(firstLine.slice(0, 100))) return "stat";
  // e.g. "72% of..." / "3 out of 4..." / "$4M..." / "₹5 lakhs..."
  if (/^\d+\s+(out of|of every|\w+ out)/.test(firstLine)) return "stat";

  // Contrarian hook: negation or challenge framing
  if (/\b(not|never|stop|wrong|myth|no one|nobody|unpopular|actually|contrary|isn't|aren't|wasn't|weren't|doesn't|don't|won't|can't|shouldn't|failed|fail)\b/i.test(firstLine.slice(0, 120))) return "contrarian";
  if (/^(if you|most people|everyone says|they told|the conventional|forget|why (do|does|would|should) (everyone|most|people))/i.test(firstLine)) return "contrarian";

  // Story hook: first-person past tense or scene-setting opener
  if (/^(I |Last |When |After |Years ago|In \d{4}|It was|There was|Picture this|Imagine|Back in|At \d|Growing up|Once I|One day|Recently I)/i.test(firstLine)) return "story";

  return "observation";
}
