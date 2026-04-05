#!/usr/bin/env bash
# push-all.sh — Push the latest linkedin-main to every branch that Vercel + GitHub track.
# Usage: bash push-all.sh
# Run from the repo root after committing your changes on linkedin-main.
#
# Remote layout:
#   linkedin remote = aicurv-hue/linkedin-automation  (Vercel watches linkedin/main)
#   origin remote   = aicurv-hue/everything-claude-code-nisarg  (ECC framework mirror)

set -e

BRANCH="linkedin-main"

echo "Pushing $BRANCH to all targets..."

# 1. linkedin remote — Vercel production deploy (main only — avoids double deploy)
git push linkedin "$BRANCH:main"

# 2. origin remote — ECC repo mirror (linkedin-main branch only — never touch origin/main)
git push origin "$BRANCH:linkedin-main"

echo ""
echo "✅ All branches updated:"
echo "   linkedin/main          ← Vercel production deploy triggered"
echo "   origin/linkedin-main   ← ECC repo mirror"
