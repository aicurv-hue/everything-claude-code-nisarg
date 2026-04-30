---
name: LinkedIn post links must be real anchor tags
description: "Live on LinkedIn" and any LinkedIn reference in History/Schedule must be a real <a> tag, not a span
type: feedback
---

Always make "Live on LinkedIn" a real `<a>` tag linking to `https://www.linkedin.com/feed/update/${post.linkedin_post_id}/` with `target="_blank"`.

**Why:** User found the span was not clickable and was frustrated it wasn't a real link. They explicitly said "solve once and for all and remember that."

**How to apply:** Any time a LinkedIn post ID is displayed anywhere in the UI (History, Schedule drawer, Dashboard), render it as a clickable anchor tag, never a plain span. Always add `onClick={(e) => e.stopPropagation()}` to prevent row click conflicts.
