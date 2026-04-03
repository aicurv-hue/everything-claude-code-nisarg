# LinkAuto Master Documentation Index
_Last updated: 2026-04-02_

Welcome to the official documentation hub for **LinkAuto — LinkedIn Automation Portal**.

## Product & Vision
- [Product Specs](.claude/docs/product_specs.md) — Features, requirements, KPIs
- [SRS](.claude/docs/srs.md) — Software requirements specification
- [User Stories](.claude/docs/user_stories.md) — User journey and use cases
- [Feature List](docs/Feature%20list.md) — Competitive research + feature intelligence

## Technical Architecture
- [System Architecture](.claude/docs/architecture.md) — Stack, pipeline, file map, infrastructure
- [Database Schema](.claude/docs/database_schema.md) — Firestore collections + localStorage keys
- [Firebase Schema](.claude/docs/firebase_schema.md) — Security rules + data structure
- [API Docs](.claude/docs/api_docs.md) — All API routes and payloads

## Operations & QA
- [Deployment](.claude/docs/deployment.md) — Vercel, Android APK, env vars, cron setup
- [Testing](.claude/docs/testing.md) — Test strategy and coverage
- [Vercel Deploy Guide](docs/VERCEL_DEPLOY.md) — Step-by-step Vercel setup

## Key Files (Quick Reference)
| File | Purpose |
|------|---------|
| `Master_Neel_Prompt.md` | Single source of truth for all AI prompt text |
| `NEEL.md` | AI pipeline documentation |
| `push-all.sh` | Always use this to deploy |
| `capacitor.config.ts` | Mobile app config (live Vercel URL, splash screen) |
| `android/app/release/app-release.apk` | Signed Android APK (~3 MB) |
| `C:\Users\USER\Desktop\linkauto-key.jks` | Android signing keystore |
