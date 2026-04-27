# Cridl Master Documentation Index
_Last updated: 2026-04-02_

Welcome to the official documentation hub for **Cridl — LinkedIn Automation Portal**.

## Product & Vision
- [Product Specs](.claude/docs/product_specs.md) — Features, requirements, KPIs
- [SRS](.claude/docs/srs.md) — Software requirements specification
- [User Stories](.claude/docs/user_stories.md) — User journey and use cases
- [Feature List](docs/Feature%20list.md) — Competitive research + feature intelligence
- [Changelog — April 2026](docs/CHANGELOG_2026_04.md) — UI fixes, Idea Bank root cause fix, Dark/Light theme implementation

## Technical Architecture
- [System Architecture](.claude/docs/architecture.md) — Stack, pipeline, file map, infrastructure
- [Database Schema](.claude/docs/database_schema.md) — Firestore collections + localStorage keys
- [Firebase Schema](.claude/docs/firebase_schema.md) — Security rules + data structure
- [API Docs](.claude/docs/api_docs.md) — All API routes and payloads
- [Idea Bank Architecture](docs/IDEA_BANK_ARCHITECTURE.md) — Data model, API, Firestore fix, UI layer
- [Theme System](docs/THEME_SYSTEM.md) — Dark/light theme implementation, CSS variables, context API

## Operations & QA
- [Deployment](.claude/docs/deployment.md) — Vercel, Android APK, env vars, cron setup
- [Testing](.claude/docs/testing.md) — Test strategy and coverage
- [Vercel Deploy Guide](docs/VERCEL_DEPLOY.md) — Step-by-step Vercel setup
- [Developer Quick Reference](docs/DEVELOPER_QUICK_REFERENCE.md) — Quick lookup for recent fixes, patterns, common issues

## Key Files (Quick Reference)
| File | Purpose |
|------|---------|
| `NEEL_RUNTIME.md` | Single source of truth for all AI prompt text |
| `NEEL_DOCS.md` | AI pipeline documentation |
| `push-all.sh` | Always use this to deploy |
| `capacitor.config.ts` | Mobile app config (live Vercel URL, splash screen) |
| `android/app/release/app-release.apk` | Signed Android APK (~3 MB) |
| `C:\Users\USER\Desktop\cridl-key.jks` | Android signing keystore |
