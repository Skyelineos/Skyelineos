# Twilio SMS — Activation Runbook

**Status:** Turn-on checklist for the SMS text-alert pipeline (operator + subs).
**Companion to:** `docs/setup-runbook.md` §F (generic Twilio provisioning) and
`SESSION_NOTES.md` Session 14 (what the code does).

The code is done and deployed. Everything below is **Twilio console + Secret
Manager config** — no more code. Work this top to bottom.

---

## Where you are today

- **Account:** Skyeline Homes, **trial** (~$13.57 credit).
- **Sending number:** `+13852334688` (Utah 385 — good, looks local).
- **Credentials:** Account SID (`AC…`) + Auth Token both exist on the Twilio
  console dashboard (top "Account Info" panel).

**Two trial limits that matter:**
1. You can **only text *verified* numbers** (ones you add under Verified Caller
   IDs). Real subs receive nothing until you upgrade.
2. Every message is prefixed **"Sent from your Twilio trial account."**

So there are two phases: **(1) prove it works on yourself (trial, free)** and
**(2) go live for subs (upgrade + A2P 10DLC)**.

---

## Phase 1 — Prove the pipeline (trial, ~15 min, no upgrade)

### 1. Verify your own cell
Console → **Phone Numbers → Manage → Verified Caller IDs** → Add a number →
enter your mobile → confirm the code Twilio texts you.

### 2. Set the three secrets
From the repo root (paste each value when prompted):
```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID  --project skyelineos   # AC… (Account SID)
firebase functions:secrets:set TWILIO_AUTH_TOKEN   --project skyelineos   # click "Show" to copy
firebase functions:secrets:set TWILIO_FROM_NUMBER  --project skyelineos   # +13852334688
```
Already set them before? Confirm with:
```bash
firebase functions:secrets:list --project skyelineos
```
and double-check `TWILIO_FROM_NUMBER` is exactly `+13852334688`.

### 3. Set your phone on your user doc
Firestore → `users/{your-uid}` → add field **`phone`** = your verified mobile in
**E.164** (`+1801…`). New-lead alerts force SMS, so this alone makes leads text
you. (The app also normalizes messier formats now, but store it clean.)

### 4. Deploy + test
```bash
npm run deploy:functions
```
Create a test lead (Sales → new lead, or the public form). Within ~10s you
should get a text (with the trial prefix). Watch **Monitor → Logs → Messaging**
in the Twilio console for the outbound record / any error code.

---

## Phase 2 — Go live for subs (required before subs get texts)

### 5. Upgrade out of trial
Dashboard → **Upgrade your account** → add a payment method. This removes the
verified-number restriction and the trial prefix. (Keep your number.)

### 6. Register A2P 10DLC  ← the real gate
Messaging → **Regulatory Compliance → A2P 10DLC**. US carriers filter/block
application-to-person texts from unregistered local numbers, *even after you
upgrade*. For a small builder, the **Sole Proprietor** brand is the fast, cheap
path (lower throughput, plenty for sub alerts).
- Register a **Brand**, then a **Campaign** (use case: *Mixed / Notifications* —
  describe it as "transactional jobsite + bid notifications to subcontractors and
  the operator").
- Associate `+13852334688` with the campaign's Messaging Service.
- Approval is typically **1–3 business days**. Until it clears, sub texts may be
  filtered.

### 7. Wire the inbound STOP/HELP webhook
This is what makes the opt-out ledger record STOP/START. Console → Phone Numbers
→ click **`+13852334688`** → **Messaging** → "A message comes in":
- **Webhook**, URL `https://skyelineos.web.app/api/sms/inbound`, **HTTP POST**.

(If you put the number in a Messaging Service for A2P, set the same inbound
webhook at the Messaging Service → Integration level instead.)

Twilio honors STOP at the carrier level regardless, but this webhook keeps our
own `sms_opt_outs/{e164}` ledger in sync so our senders skip opted-out numbers
and `START` re-enables them.

### 8. Set a spend cap (do this once)
Settings → General → **Spending Limit** → start at **$25/month**. US SMS is
~$0.0079 each; this is a guardrail, not a real budget.

---

## How alerts behave once live

| Event | Who gets texted | Opt-in needed? |
|-------|-----------------|----------------|
| New lead (any source) | All admins | No — forced |
| Bid invitation sent | Invited subs | No — transactional (bid routes) |
| Bid awarded | Winning sub | No — forced |
| Other notifications (tasks, due dates, etc.) | Recipient | **Yes** — `notificationPrefs.sms` |

All paths **honor STOP** (the `sms_opt_outs` ledger) even when "forced," and
skip any number that can't be normalized to E.164.

**Opt-in toggle (you/team):** Settings → User Preferences → Notifications →
"SMS notifications" now writes `users/{uid}.notificationPrefs.sms` (and stamps a
consent record). Previously it was cosmetic.

**Consent capture (subs/contacts):** Contacts → edit a contact → once they have
a phone, an **"agreed to receive SMS text alerts"** checkbox appears. Check it
when you collect a sub's number — it records the opt-in (`smsConsentAt` +
source) and enables `notificationPrefs.sms`. This is the proof-of-consent to
check before texting subs at scale.

---

## Still open (not blocking, but know it)

- **Sub self-onboarding consent.** The GC-side opt-in checkbox is live
  (EditContactModal). A sub opting *themselves* in during their own portal
  signup is the remaining surface — add it if you want subs to self-consent.
- **Per-event sub toggles.** Subs have no SMS preferences screen yet; award +
  invite are forced/transactional. Add a sub notification-prefs screen if you
  want them to self-manage.

---

## Quick reference

- Outbound code paths: `functions/src/notifications/dispatch.ts`,
  `functions/src/bids/sendBidRequestRoute.ts`,
  `functions/src/bids/bidPackageDispatchRoute.ts`
- Inbound webhook: `functions/src/notifications/smsInboundRoute.ts` →
  `POST /api/sms/inbound`
- Shared util: `functions/src/notifications/sms.ts` (`toE164`, opt-out ledger)
- Opt-out data: `sms_opt_outs/{e164}` (Cloud-Function-only; see `firestore.rules`)
