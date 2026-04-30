# LinkedIn Automation Portal — Memory Index

## Project
- [Project Overview](project_overview.md) — stack, architecture, working features, limitations
- [Key File Index](file_index.md) — map of important source files
- [How It Works](HOW_IT_WORKS.md) — end-to-end flow for every major feature
- [Rebrand: Neel → Cortex (Apr 2026)](rebrand_neel_cortex.md) — use "Cortex" in all new user-facing text; legacy `NEEL_*` filenames intentionally kept
- [Website vs Codebase Audit](audit_website_vs_codebase.md) — positioning deviations

## Rules (Critical)
- [Deployment](rule_deployment.md) — always `bash push-all.sh` on `linkedin-main`
- [Token Storage](rule_token_storage.md) — LinkedIn tokens in Firestore `tokens/{firebaseUID}`, Bearer auth, never cookies
- [Edge Runtime](rule_edge_runtime.md) — OpenRouter/fal.ai/OAuth routes must `export const runtime = "edge"`
- [Post Flow](rule_post_flow.md) — never post directly; editable preview first; strict Individual/Corporate separation

## Feedback
- [LinkedIn links must be real `<a>` tags](feedback_linkedin_links.md)
- [Deploy after every change](feedback_deploy_after_changes.md)
- [Update NEEL.md on pipeline changes](feedback_neel_doc.md)

## Misc
- [Skills & Agents](skills-agents.md)
