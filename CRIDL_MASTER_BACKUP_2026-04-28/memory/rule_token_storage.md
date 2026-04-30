---
name: LinkedIn token storage — CRITICAL, never change
description: LinkedIn tokens stored in Firestore tokens/{firebaseUID}. Every API route must use Firebase ID token. Never use browser cookies.
type: feedback
---

LinkedIn OAuth tokens MUST be stored in Firestore at `tokens/{firebaseUID}` — keyed by Firebase UID.

Every API route MUST authenticate via Firebase ID token in the Authorization header:
```
Authorization: Bearer <Firebase ID token>
```

NEVER use browser cookies for LinkedIn auth.

**Why:** This is a multi-user SaaS. Browser cookies are shared per-browser, not per-user. Using cookies would cause cross-user token leakage. Firebase UID-keyed storage is the secure, multi-tenant approach.

**How to apply:** Any API route that touches LinkedIn data or tokens must extract the Firebase UID from the Bearer token, never from cookies or session. This rule is marked CRITICAL in CLAUDE.md — do not deviate.
