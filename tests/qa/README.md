# QA Visual Tests — LinkAuto

Playwright tests that open a real Chrome browser, check UI, and save screenshots.

## Setup (one time)

```bash
# Already done — but if needed:
npm install -D @playwright/test
npx playwright install chromium
```

## Run Against Localhost

Start the dev server first, then:

```bash
npx playwright test
```

## Run Against Live Vercel URL

```bash
QA_URL=https://your-vercel-url.vercel.app npx playwright test
```

## Run With Login (dashboard tests)

```bash
QA_EMAIL=you@email.com QA_PASSWORD=yourpassword npx playwright test
```

## View Screenshots

Screenshots saved to `tests/qa/results/` after every run.

## View HTML Report

```bash
npx playwright show-report tests/qa/report
```

## Test Files

| File | What it checks |
|---|---|
| `01-landing.spec.ts` | Landing page loads, login link visible |
| `02-auth.spec.ts` | Login/signup pages, unauthenticated redirect |
| `03-dashboard.spec.ts` | All dashboard pages, segment switcher, key UI elements |

## Adding a New Feature Test

Create `tests/qa/XX-feature-name.spec.ts` following the same pattern.
QA Agent will run this automatically when checking new features.
