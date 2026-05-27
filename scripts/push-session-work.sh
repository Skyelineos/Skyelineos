#!/bin/bash
# Push this session's work to GitHub main.
#
# What this does:
#   1. Clears any leftover .git/index.lock from the sandbox
#   2. Restores the accidentally-deleted logo PNGs from HEAD
#   3. Removes the empty App-minimal.tsx.restore artifact
#   4. Stages everything else
#   5. Commits with the session's full message
#   6. Pushes to origin/main
#
# Run from this directory:
#   ./scripts/push-session-work.sh
#
# After the push, GitHub Actions will auto-deploy via the workflow at
# .github/workflows/deploy-on-push.yml (requires FIREBASE_TOKEN secret —
# already configured per user). Watch progress at:
#   https://github.com/Skyelineos/Skyelineos/actions

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ Working in: $REPO_ROOT"
echo

# 1. Clear stuck git lock
if [ -f .git/index.lock ]; then
  echo "→ Clearing stale .git/index.lock"
  rm -f .git/index.lock
fi

# 2. Restore accidentally-deleted branding assets
echo "→ Restoring deleted logo PNGs from HEAD"
git checkout HEAD -- client/public/logos/ 2>/dev/null || true

# 3. Remove empty artifact
rm -f client/src/App-minimal.tsx.restore

# 4. Stage everything
echo "→ Staging changes"
git add -A

# Quick sanity check — show what's being committed
echo
echo "→ Files in this commit:"
git diff --cached --stat | tail -40
echo

# 5. Commit
echo "→ Creating commit"
git commit -F scripts/push-session-work.commit-message.txt

# 6. Push
echo
echo "→ Pushing to origin/main"
git push origin main

echo
echo "✓ Done. GitHub Actions will deploy at:"
echo "  https://github.com/Skyelineos/Skyelineos/actions"
