---
name: Deployment — always use push-all.sh, branch linkedin-main
description: Never push manually. Always use push-all.sh from the linkedin-main branch.
type: feedback
---

Always work on the `linkedin-main` branch. Never push manually with git push.

Always deploy using:
```bash
bash push-all.sh
```

This pushes to:
- `linkedin/main` — triggers Vercel deploy (primary)
- `linkedin/linkedin-main`
- `origin/linkedin-main`

**Why:** Two remotes must stay in sync. The Vercel deployment watches `linkedin/main` only. Manual pushes to individual remotes will desync the repos.

**How to apply:** Any time the user asks to deploy, push, or "send to production", run `bash push-all.sh`. Never run bare `git push`.
