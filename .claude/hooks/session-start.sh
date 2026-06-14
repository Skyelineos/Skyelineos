#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Claude Code SessionStart hook — GitHub sync guard
#
# Runs at the start of EVERY Claude session, on EVERY device (web, desktop,
# laptop). It surfaces whether this clone is in sync with GitHub so work,
# deploys, and code changes always start from the same page.
#
# Synchronous (no async) so the status is in context before the agent acts.
# ─────────────────────────────────────────────────────────────────────────────
set -u

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

echo "===== GitHub sync status (checked automatically at session start) ====="
bash scripts/git-sync-check.sh || true
echo ""
echo "AGENT INSTRUCTION: Relay the sync status above to the user in your first"
echo "reply. If it says BEHIND or DIVERGED from origin/main, tell the user to"
echo "sync (e.g. 'git pull origin main') BEFORE making code changes or"
echo "deploying, and do not deploy from a stale branch without confirming."
exit 0
