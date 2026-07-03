#!/usr/bin/env bash
# Resubmit the Skyeline Homes A2P 10DLC campaign after privacy policy fix.
# Prereqs: privacy.html deployed to https://skyelineos.web.app/privacy.html
#          with the required "Mobile information and messaging consent are
#          not shared with third parties." language.
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
source .env

SERVICE_SID="MG115ab5c02124eae757afcf8d4ebed1c9"
OLD_CAMPAIGN_SID="QE2c6890da8086d771620e9b13fadeba0b"

echo "==> Verifying live privacy policy contains required TCR language..."
if ! curl -fsSL https://skyelineos.web.app/privacy.html \
    | grep -q "Mobile information and messaging consent are not shared with third parties"; then
  echo "!! Live privacy.html is missing the required TCR sentence."
  echo "!! Run: npm run deploy:hosting  (from ~/Projects/Skyelineos) and try again."
  exit 1
fi
echo "   OK — TCR statement is live."

echo "==> Current campaign status:"
curl -s "https://messaging.twilio.com/v1/Services/${SERVICE_SID}/Compliance/Usa2p" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" | python3 -m json.tool

echo "==> Deleting failed campaign ${OLD_CAMPAIGN_SID}..."
curl -s -X DELETE \
  "https://messaging.twilio.com/v1/Services/${SERVICE_SID}/Compliance/Usa2p/${OLD_CAMPAIGN_SID}" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" -w "\nHTTP %{http_code}\n" || true

echo
echo "==> Recreating campaign with identical fields (only privacy policy content changed)..."
curl -s -X POST "https://messaging.twilio.com/v1/Services/${SERVICE_SID}/Compliance/Usa2p" \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  --data-urlencode "Description=Skyeline Homes, a licensed custom home builder in American Fork, Utah, uses SMS to communicate with existing business contacts (clients under signed construction contracts, subcontractors under signed trade agreements, and internal staff) about active construction projects: project status, scheduling, milestones, task assignments, inspection notices, material deliveries, and account/invoice notifications. All recipients have an existing business relationship and provided their phone in a signed agreement with SMS consent disclosure. No marketing or cold outreach. Privacy: https://skyelineos.web.app/privacy.html Terms: https://skyelineos.web.app/terms.html" \
  --data-urlencode "MessageFlow=End users opt in by signing a written agreement with Skyeline Homes that includes an explicit SMS consent disclosure and checkbox next to the phone number field. (1) CLIENTS sign a construction contract containing this verbatim clause: \"By providing your mobile number and checking this box, you consent to receive SMS from Skyeline Homes regarding your construction project, including status updates, scheduling, inspection notices, milestones, and invoice notifications. Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help. Privacy: https://skyelineos.web.app/privacy.html Terms: https://skyelineos.web.app/terms.html\". The checkbox is unchecked by default and consent is not a condition of service. (2) SUBCONTRACTORS sign a Subcontractor Agreement/intake form with the same disclosure tailored to trade coordination (job assignments, schedules, site coordination). (3) STAFF sign an onboarding form with an equivalent disclosure for internal project coordination. All three documents are countersigned and retained as the written opt-in record (name, phone, source, date, signature) in the Skyeline Homes internal project management system. No web form, keyword, or public sign-up is used to collect numbers — every recipient is a counterparty to a signed contract with Skyeline Homes. Recipients may opt out any time by replying STOP; opt-outs are honored immediately and logged. Full SMS program terms are public at https://skyelineos.web.app/terms.html and privacy policy at https://skyelineos.web.app/privacy.html." \
  --data-urlencode "MessageSamples=Skyeline Homes: Your foundation inspection is scheduled for Thursday 7/3 at 10am. Your PM Chris will be on site. Questions? Reply here. Reply STOP to opt out." \
  --data-urlencode "MessageSamples=Skyeline Homes: Framing complete on your home — we are ahead of schedule. Drywall starts Monday. Photos uploaded to your portal at https://skyelineos.web.app. Reply STOP to opt out." \
  --data-urlencode "MessageSamples=Skyeline Homes: Hi Brad, you have been assigned to the Gardanier framing crew at 703 W 930 N, American Fork. Start date Monday 7/7 at 7am. Reply YES to confirm or call Tyler at (208) 403-5905. Reply STOP to opt out." \
  --data-urlencode "UsAppToPersonUsecase=MIXED" \
  --data-urlencode "HasEmbeddedLinks=true" \
  --data-urlencode "HasEmbeddedPhone=true" \
  --data-urlencode "OptInKeywords=START" \
  --data-urlencode "OptInKeywords=YES" \
  --data-urlencode "OptInKeywords=JOIN" \
  --data-urlencode "OptInMessage=Skyeline Homes: You are now subscribed to project notifications. Msg & data rates may apply. Msg frequency varies. Reply HELP for help, STOP to opt out." \
  --data-urlencode "OptOutKeywords=STOP" \
  --data-urlencode "OptOutKeywords=STOPALL" \
  --data-urlencode "OptOutKeywords=UNSUBSCRIBE" \
  --data-urlencode "OptOutKeywords=CANCEL" \
  --data-urlencode "OptOutKeywords=END" \
  --data-urlencode "OptOutKeywords=QUIT" \
  --data-urlencode "OptOutKeywords=OPTOUT" \
  --data-urlencode "OptOutKeywords=REVOKE" \
  --data-urlencode "OptOutMessage=You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe." \
  --data-urlencode "HelpKeywords=HELP" \
  --data-urlencode "HelpKeywords=INFO" \
  --data-urlencode "HelpMessage=Reply STOP to unsubscribe. Msg&Data Rates May Apply." \
  | python3 -m json.tool
