/**
 * Twilio-backed SMS for selection reminders.
 *
 * Set once:
 *   firebase functions:config:set \
 *     twilio.sid="AC..." twilio.token="..." twilio.from="+1XXXXXXXXXX"
 *
 * Or env vars: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER.
 *
 * SMS is reserved for OVERDUE selection digests sent to the client.
 * Daily digest path lives in scheduledRemindersDaily.ts.
 */
import * as functions from 'firebase-functions';

interface Args {
  toPhone: string;
  body: string;
}

export async function sendSelectionReminderSms({ toPhone, body }: Args): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID || functions.config()?.twilio?.sid;
  const token = process.env.TWILIO_AUTH_TOKEN || functions.config()?.twilio?.token;
  const from = process.env.TWILIO_FROM_NUMBER || functions.config()?.twilio?.from;

  if (!sid || !token || !from) {
    functions.logger.error('Twilio config missing — skipping SMS', { toPhone });
    return;
  }

  const to = normalizeUS(toPhone);
  if (!to) {
    functions.logger.warn('Invalid phone, skipping SMS', { toPhone });
    return;
  }

  const params = new URLSearchParams();
  params.append('To', to);
  params.append('From', from);
  params.append('Body', body.slice(0, 320));

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Twilio send failed (${res.status}): ${errText}`);
  }
  functions.logger.info('SMS sent', { toPhone: to.replace(/\d(?=\d{4})/g, '*') });
}

function normalizeUS(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+')) return raw;
  return null;
}
