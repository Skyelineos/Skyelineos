#!/usr/bin/env bash
# notify-deploy.sh - SendGrid email after a deploy run.
#
# Called by .github/workflows/deploy-on-push.yml at the end of the workflow.
# Receives mode as the first arg ("ok" or "fail") and reads everything else
# from environment variables exported by the workflow step.
#
# All complex logic lives here so the YAML stays simple (no embedded JSON
# with quote/newline escape jungle). The workflow just calls:
#     bash scripts/notify-deploy.sh ok
#     bash scripts/notify-deploy.sh fail
#
# Required env vars:
#   SENDGRID_API_KEY        - SendGrid v3 REST API key.
#   SENDGRID_FROM_EMAIL     - verified sender.
#   TO_EMAIL                - recipient (Tyler).
#   GH_SHA                  - full commit SHA.
#   GH_REPO                 - "Skyelineos/Skyelineos".
#   GH_SERVER_URL           - "https://github.com".
#   GH_RUN_ID               - workflow run id.
#
# Exits 0 on success AND on missing-secrets fallback (never fails the workflow).

set -u

MODE="${1:-ok}"

# Fallback: missing any required secret -> log a warning and exit cleanly so
# the deploy workflow itself never fails on the notification step.
if [ -z "${SENDGRID_API_KEY:-}" ] || [ -z "${SENDGRID_FROM_EMAIL:-}" ] || [ -z "${TO_EMAIL:-}" ]; then
  echo "::warning::Deploy notification skipped - missing one of SENDGRID_API_KEY / SENDGRID_FROM_EMAIL / DEPLOY_NOTIFY_TO_EMAIL"
  exit 0
fi

SHORT_SHA=$(echo "$GH_SHA" | cut -c1-7)
RUN_URL="${GH_SERVER_URL}/${GH_REPO}/actions/runs/${GH_RUN_ID}"
COMMIT_URL="${GH_SERVER_URL}/${GH_REPO}/commit/${GH_SHA}"

# Best-effort commit metadata (git log can fail on shallow clones; that's fine).
COMMIT_MSG=$(git log -1 --format='%s' "$GH_SHA" 2>/dev/null | head -c 200 || echo "")
COMMIT_AUTHOR=$(git log -1 --format='%an' "$GH_SHA" 2>/dev/null || echo "")
FILES_CHANGED=$(git show --stat --format='' "$GH_SHA" 2>/dev/null | tail -1 | xargs || echo "")

if [ "$MODE" = "ok" ]; then
  STATUS_TAG="[OK]"
  HEADING="Deploy succeeded"
  HEADING_COLOR="#16a34a"
  SUBJECT="[Skyeline] [OK] Deployed ${SHORT_SHA}"
  EXTRA_BLOCK="<p style=\"margin:0 0 4px;\"><strong>Files changed:</strong> ${FILES_CHANGED}</p><p style=\"margin:16px 0 4px;\"><a href=\"https://skyelineos.web.app\" style=\"color:#C9A96E;\">Open prod</a></p>"
else
  STATUS_TAG="[FAIL]"
  HEADING="Deploy failed"
  HEADING_COLOR="#dc2626"
  SUBJECT="[Skyeline] [FAIL] Deploy failed ${SHORT_SHA}"
  # Tail of deploy.log if it exists; replace newlines with <br/> for HTML.
  if [ -f deploy.log ]; then
    ERROR_TAIL=$(tail -10 deploy.log | head -c 1500)
  else
    ERROR_TAIL="(no deploy.log captured - check the Actions run for the failing step)"
  fi
  # HTML-escape minimally + convert newlines to <br/> for inline display.
  # Use Python so we don't have to wrangle sed escape sequences.
  ESCAPED_TAIL=$(python3 -c '
import sys, html
data = sys.stdin.read()
print(html.escape(data).replace("\n", "<br/>"), end="")
' <<< "$ERROR_TAIL")
  EXTRA_BLOCK="<div style=\"background:#fef2f2;border-left:3px solid #dc2626;padding:8px 12px;margin:0 0 12px;font-family:ui-monospace,monospace;font-size:12px;\">${ESCAPED_TAIL}</div>"
fi

# Build HTML body. Single line, no embedded newlines.
HTML_BODY="<div style=\"font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1f2937;\"><h2 style=\"color:${HEADING_COLOR};margin:0 0 12px;\">${HEADING}</h2><p style=\"margin:0 0 4px;\"><strong>Commit:</strong> <code>${SHORT_SHA}</code></p><p style=\"margin:0 0 4px;\"><strong>Message:</strong> ${COMMIT_MSG}</p><p style=\"margin:0 0 12px;\"><strong>Author:</strong> ${COMMIT_AUTHOR}</p>${EXTRA_BLOCK}<p style=\"margin:16px 0 4px;\"><a href=\"${COMMIT_URL}\" style=\"color:#C9A96E;\">View commit on GitHub</a></p><p style=\"margin:0 0 4px;\"><a href=\"${RUN_URL}\" style=\"color:#C9A96E;\">View Actions run</a></p></div>"

# Construct the JSON payload via Python so we don't fight bash escapes.
JSON_BODY=$(python3 -c '
import json, os
payload = {
  "personalizations": [{"to": [{"email": os.environ["TO_EMAIL"]}]}],
  "from": {"email": os.environ["SENDGRID_FROM_EMAIL"], "name": "Skyeline Deploys"},
  "subject": os.environ["SUBJECT"],
  "content": [{"type": "text/html", "value": os.environ["HTML_BODY"]}],
}
print(json.dumps(payload))
' SUBJECT="$SUBJECT" HTML_BODY="$HTML_BODY")

HTTP_CODE=$(curl -s -o /tmp/sg-resp.txt -w "%{http_code}" -X POST \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JSON_BODY" \
  https://api.sendgrid.com/v3/mail/send)

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "Sent ${STATUS_TAG} notification to ${TO_EMAIL} (HTTP ${HTTP_CODE})"
else
  echo "::warning::SendGrid returned HTTP ${HTTP_CODE}"
  cat /tmp/sg-resp.txt 2>/dev/null || true
fi

# Always exit 0 - notification failures never break the deploy workflow.
exit 0
