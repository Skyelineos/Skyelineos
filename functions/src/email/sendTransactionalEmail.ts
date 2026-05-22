/**
 * Single email send entry-point. Swap the provider here without changing callers.
 *
 * Currently uses SendGrid. Set this once:
 *   firebase functions:config:set sendgrid.key="SG.xxx" sendgrid.from="Skyeline OS <hello@skyelinehomes.com>"
 *
 * Or supply SENDGRID_API_KEY / EMAIL_FROM env vars (preferred for Functions v2).
 */
import * as functions from 'firebase-functions';

const FROM_DEFAULT = 'Skyeline OS <noreply@skyelinehomes.com>';

interface Args {
  toEmail: string;
  toName?: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendTransactionalEmail({ toEmail, toName, subject, html, replyTo }: Args): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY || functions.config()?.sendgrid?.key;
  const from = process.env.EMAIL_FROM || functions.config()?.sendgrid?.from || FROM_DEFAULT;

  if (!apiKey) {
    functions.logger.error('SendGrid API key missing — skipping email', { toEmail, subject });
    return;
  }

  const payload = {
    personalizations: [
      {
        to: [{ email: toEmail, name: toName }],
        subject,
      },
    ],
    from: parseFrom(from),
    reply_to: replyTo ? { email: replyTo } : undefined,
    content: [
      { type: 'text/html', value: html },
    ],
    tracking_settings: {
      click_tracking: { enable: false },
      open_tracking: { enable: false },
    },
  };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SendGrid send failed (${res.status}): ${errText}`);
  }
}

function parseFrom(s: string): { email: string; name?: string } {
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { email: s };
}
