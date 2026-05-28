#!/bin/bash
# scripts/auto-push.sh
#
# Push session work to origin/main using the PAT stored at
# .claude-push-token (gitignored, never committed).
#
# Usage:
#   ./scripts/auto-push.sh "Commit message subject"
#   ./scripts/auto-push.sh -F path/to/commit-message-body.txt
#
# What it does:
#   1. Reads the GitHub PAT from .claude-push-token
#   2. Clones a fresh copy of origin/main to /tmp/skyelineos-auto-push
#      (avoids the workspace's stuck .git/index.lock problem)
#   3. rsyncs the workspace into the temp clone, excluding build artifacts
#      and the token file itself
#   4. Stages everything, commits with the provided message
#   5. Pushes to origin/main using the PAT
#   6. GitHub Actions takes over and deploys to Firebase
#
# Designed to be invoked either:
#   - By Claude from the sandbox at the end of a session
#   - By you from your Mac terminal if you want to push manually
#
# Either way, the credential never leaves .claude-push-token / the
# in-flight push URL (which is ephemeral and not logged).

set -e
set -o pipefail   # so a failed git push doesn't get masked by a successful sed

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="$REPO_ROOT/.claude-push-token"
TMP_CLONE="/tmp/skyelineos-auto-push"
REPO_URL_PATH="github.com/Skyelineos/Skyelineos.git"

# ── Arg handling ──────────────────────────────────────────────────────
if [ "$1" = "-F" ] && [ -n "$2" ] && [ -f "$2" ]; then
  COMMIT_MODE="file"
  COMMIT_ARG="$2"
elif [ -n "$1" ]; then
  COMMIT_MODE="message"
  COMMIT_ARG="$1"
else
  echo "Usage:"
  echo "  $0 \"Commit message subject\""
  echo "  $0 -F path/to/commit-message-body.txt"
  exit 1
fi

# ── Sanity: token + workspace ─────────────────────────────────────────
if [ ! -f "$TOKEN_FILE" ]; then
  echo "ERROR: no token at $TOKEN_FILE"
  echo "Create a GitHub PAT (fine-grained, Skyelineos repo, Contents R/W)"
  echo "and write it (single line, no trailing newline) to that path."
  exit 1
fi
TOKEN="$(tr -d '\n\r ' < "$TOKEN_FILE")"
if [ -z "$TOKEN" ]; then
  echo "ERROR: token file is empty"
  exit 1
fi
# Guard against the literal placeholder string from the setup instructions.
# Caught real users (literally — that's how we got here on attempt #1).
case "$TOKEN" in
  *PASTE_YOUR_TOKEN_HERE*|*paste_your_token_here*|*YOUR_TOKEN_HERE*)
    echo "ERROR: the token file still contains the placeholder text:"
    echo "         $TOKEN"
    echo "       Replace it with your real GitHub fine-grained PAT."
    echo "       Real tokens start with 'github_pat_' and are ~93 chars."
    exit 1
    ;;
esac
# Sanity-check shape. Fine-grained PATs start with github_pat_ and are
# 90-100 chars. Classic PATs start with ghp_ and are 40 chars. Anything
# else is almost certainly wrong.
case "$TOKEN" in
  github_pat_*)
    if [ "${#TOKEN}" -lt 80 ]; then
      echo "WARN: token starts with github_pat_ but is only ${#TOKEN} chars."
      echo "      Fine-grained PATs are normally ~93 chars. Continuing anyway..."
    fi
    ;;
  ghp_*)
    if [ "${#TOKEN}" -ne 40 ]; then
      echo "WARN: token starts with ghp_ but is ${#TOKEN} chars (expected 40)."
      echo "      Continuing anyway..."
    fi
    ;;
  *)
    echo "ERROR: token doesn't look like a GitHub PAT."
    echo "       Expected prefix: 'github_pat_' (fine-grained) or 'ghp_' (classic)."
    echo "       Got first 6 chars: '${TOKEN:0:6}...'"
    exit 1
    ;;
esac

# ── Fresh clone ────────────────────────────────────────────────────────
rm -rf "$TMP_CLONE"
echo "→ Cloning origin/main to $TMP_CLONE"
# Use the credential here so we authenticate the clone with the same PAT
# that will authenticate the push. Output is suppressed so the URL with
# embedded token doesn't end up in logs.
git clone --depth=1 --branch=main \
  "https://x-access-token:${TOKEN}@${REPO_URL_PATH}" \
  "$TMP_CLONE" 2>&1 | sed "s|${TOKEN}|***TOKEN***|g"

# ── Sync workspace into the clone ──────────────────────────────────────
echo "→ Syncing workspace state"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='/lib/' \
  --exclude='/functions/lib/' \
  --exclude='dist/' \
  --exclude='.firebase/' \
  --exclude='.claude-push-token*' \
  --exclude='*-token' \
  --exclude='*-token.*' \
  --exclude='*.pem' \
  --exclude='*.key' \
  --exclude='*.tmp' \
  --exclude='*.restore' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.DS_Store' \
  --exclude='vite.config.ts.timestamp-*' \
  --exclude='*.timestamp-*.mjs' \
  "$REPO_ROOT/" "$TMP_CLONE/"

# Apply the deny-list: files that were deleted from the canonical repo
# but still exist in the workspace (the Cowork sandbox can't `rm` workspace
# files — they only get removed from the clone here, every push).
# Without this step, rsync re-adds them on every push.
DENY_LIST="$REPO_ROOT/scripts/deleted-files.txt"
if [ -f "$DENY_LIST" ]; then
  echo "→ Applying deny-list from scripts/deleted-files.txt"
  while IFS= read -r path; do
    # skip blanks + comments
    case "$path" in
      ''|'#'*) continue ;;
    esac
    if [ -e "$TMP_CLONE/$path" ]; then
      rm -rf "$TMP_CLONE/$path" && echo "    removed: $path"
    fi
  done < "$DENY_LIST"
fi

# Belt-and-suspenders: if any file containing a literal "github_pat_" or
# "ghp_" prefix snuck through the rsync exclusions (typo paths, weird
# names), nuke it before commit. GitHub's secret scanner will reject the
# push anyway — better to find it locally than waste a push round trip.
echo "→ Scanning staged tree for stray token files..."
STRAY_TOKEN_FILES=$(grep -rlIE '(github_pat_[A-Za-z0-9_]{30,}|ghp_[A-Za-z0-9]{36,})' "$TMP_CLONE" 2>/dev/null | grep -v '/.git/' || true)
if [ -n "$STRAY_TOKEN_FILES" ]; then
  echo "→ Removing $(echo "$STRAY_TOKEN_FILES" | wc -l | tr -d ' ') file(s) containing PAT-shaped strings:"
  echo "$STRAY_TOKEN_FILES" | sed 's|^|    |'
  echo "$STRAY_TOKEN_FILES" | xargs rm -f
fi

# Restore the .git directory we just deleted via --delete (rsync didn't
# copy it because we excluded it, but --delete may have nuked it).
# Actually --exclude makes --delete skip those paths too, so .git stays.
# This is a sanity check.
if [ ! -d "$TMP_CLONE/.git" ]; then
  echo "ERROR: .git directory missing from clone after rsync — aborting"
  exit 1
fi

# ── Commit + push ──────────────────────────────────────────────────────
cd "$TMP_CLONE"
git config user.email "claude@skyelineos.local"
git config user.name  "Claude (session bot)"

git add -A

# If nothing changed vs origin, exit cleanly without an empty commit
if git diff --cached --quiet; then
  echo "→ No changes to push — workspace is already in sync with main"
  exit 0
fi

echo "→ Files in this commit:"
git diff --cached --stat | tail -30
echo

if [ "$COMMIT_MODE" = "file" ]; then
  git commit -F "$COMMIT_ARG"
else
  git commit -m "$COMMIT_ARG"
fi

COMMIT_SHA="$(git rev-parse HEAD)"
echo "→ Pushing commit $COMMIT_SHA to origin/main"

# Push. Mask the token in any output.
git push "https://x-access-token:${TOKEN}@${REPO_URL_PATH}" main 2>&1 \
  | sed "s|${TOKEN}|***TOKEN***|g"

echo
echo "✓ Pushed $COMMIT_SHA → main"
echo "  GitHub Actions deploy: https://github.com/Skyelineos/Skyelineos/actions"
