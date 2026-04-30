---
name: Always deploy after every change
description: User requires bash push-all.sh to be run after every code change, without being asked
type: feedback
---

Always run `bash push-all.sh` from the project root after every code change — do not wait for the user to ask.

**Why:** User explicitly instructed this after a session where changes were made but not deployed. Forgetting to deploy is a recurring friction point.

**How to apply:** At the end of every task that modifies any file, run `bash push-all.sh` as the final step before reporting completion.
