#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# git-sync-check.sh — "are all my devices on the same page?" check
#
# Tells you whether THIS clone is in sync with GitHub before you work, change
# code, or deploy. Used by:
#   • the Claude Code SessionStart hook (.claude/hooks/session-start.sh)
#   • the husky pre-push hook (.husky/pre-push)
#   • `npm run sync`  and  the `predeploy` gate
#
# Usage:
#   scripts/git-sync-check.sh             # informational, always exits 0
#   scripts/git-sync-check.sh --strict    # exits 1 if BEHIND or DIVERGED (gating)
#   scripts/git-sync-check.sh --no-fetch   # skip the network fetch (use cached refs)
#
# POSIX-compatible (runs in Git Bash on Windows, macOS, and Linux).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

STRICT=0
DO_FETCH=1
for arg in "$@"; do
  case "$arg" in
    --strict)   STRICT=1 ;;
    --no-fetch) DO_FETCH=0 ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "git-sync-check: not a git repository — skipping."
  exit 0
fi

MAIN_BRANCH="main"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "UNKNOWN")
LINE="──────────────────────────────────────────────────────────"

FETCH_NOTE=""
if [ "$DO_FETCH" -eq 1 ]; then
  if ! git fetch origin --quiet 2>/dev/null; then
    FETCH_NOTE="could not reach GitHub (offline?) — status may be stale."
  fi
fi

if ! git rev-parse --verify --quiet "origin/$MAIN_BRANCH" >/dev/null 2>&1; then
  echo "git-sync-check: origin/$MAIN_BRANCH not found — skipping."
  exit 0
fi

MAIN_SHA=$(git rev-parse --short "origin/$MAIN_BRANCH" 2>/dev/null)
MAIN_SUBJ=$(git log -1 --format=%s "origin/$MAIN_BRANCH" 2>/dev/null)

# Behind / ahead relative to origin/main (left=behind, right=ahead).
set -- $(git rev-list --left-right --count "origin/$MAIN_BRANCH"...HEAD 2>/dev/null || echo "0 0")
BEHIND_MAIN=${1:-0}
AHEAD_MAIN=${2:-0}

# Relationship to this branch's own remote tracking branch, if any.
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo "")
UP_BEHIND=0; UP_AHEAD=0
if [ -n "$UPSTREAM" ]; then
  set -- $(git rev-list --left-right --count "$UPSTREAM"...HEAD 2>/dev/null || echo "0 0")
  UP_BEHIND=${1:-0}
  UP_AHEAD=${2:-0}
fi

DIRTY_COUNT=$(git status --porcelain 2>/dev/null | grep -c . || true)

STATUS="OK"
if [ "$BEHIND_MAIN" -gt 0 ] && [ "$AHEAD_MAIN" -gt 0 ]; then
  STATUS="DIVERGED"
elif [ "$BEHIND_MAIN" -gt 0 ]; then
  STATUS="BEHIND"
fi

echo "$LINE"
echo "  SKYELINE OS — GITHUB SYNC CHECK"
echo "$LINE"
echo "  Current branch : $BRANCH"
echo "  origin/main    : $MAIN_SHA  \"$MAIN_SUBJ\""
if [ -n "$UPSTREAM" ]; then
  echo "  This branch    : $UP_BEHIND behind / $UP_AHEAD ahead of $UPSTREAM"
else
  echo "  This branch    : no remote tracking branch set"
fi
echo "  vs origin/main : $BEHIND_MAIN behind / $AHEAD_MAIN ahead"
[ "$DIRTY_COUNT" -gt 0 ] && echo "  Uncommitted    : $DIRTY_COUNT file(s) changed locally"
[ -n "$FETCH_NOTE" ] && echo "  Note           : $FETCH_NOTE"
echo "$LINE"

case "$STATUS" in
  OK)
    if [ "$BRANCH" = "$MAIN_BRANCH" ]; then
      echo "  OK  Up to date with origin/main — safe to work."
    else
      echo "  OK  Not behind origin/main."
    fi
    ;;
  BEHIND)
    echo "  WARNING  BEHIND origin/main by $BEHIND_MAIN commit(s)."
    echo "           Get current BEFORE working or deploying:"
    echo "             git pull origin main"
    ;;
  DIVERGED)
    echo "  STOP  DIVERGED from origin/main ($BEHIND_MAIN behind, $AHEAD_MAIN ahead)."
    echo "        Reconcile before deploying:"
    echo "           git pull origin main      # then resolve any conflicts"
    ;;
esac

if [ -n "$UPSTREAM" ] && [ "$UP_BEHIND" -gt 0 ]; then
  echo "  WARNING  Your branch's remote ($UPSTREAM) is $UP_BEHIND commit(s) ahead — pull it:"
  echo "             git pull"
fi
if [ "$DIRTY_COUNT" -gt 0 ]; then
  echo "  NOTE  You have uncommitted changes — commit or stash before pulling/switching."
fi
echo "$LINE"

if [ "$STRICT" -eq 1 ] && [ "$STATUS" != "OK" ]; then
  exit 1
fi
exit 0
