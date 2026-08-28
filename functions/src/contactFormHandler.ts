// Contact form handler for the Skyeline Homes marketing site (skyelinehomes.com).
// Public endpoint — no auth required. Protected by a honeypot field + basic
// validation. Sends a formatted inquiry email to tyler@skyelinehomes.com via
// SendGrid using the same SENDGRID_API_KEY / SENDGRID_FROM_EMAIL secrets already
// bound to the `api` Cloud Function.
//
// POST /api/contact
// Body: { firstName, lastName, email, phone?, cityOfInterest?, budgetRange?,
//         projectType?, lotStatus?, source?, message?, website? (honeypot) }
// Response: { ok: true } | { error: string }

import type { Express } from 'express';
import { Resend } from 'resend';

// Allowed CORS origins — the marketing site + local Astro dev server
const ALLOWED_ORIGINS = [
  'https://skyelinehomes.web.app',
  'https://www.skyelinehomes.com',
  'https://skyelinehomes.com',
  'http://localhost:4321',
  'http://localhost:3000',
];

interface ContactFormPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cityOfInterest?: string;
  budgetRange?: string;
  projectType?: string;
  lotStatus?: string;
  source?: string;
  message?: string;
  // Honeypot field — real users never see/fill this; bots do
  website?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function row(label: string, value: string | undefined): string {
  if (!value) return '';
  return `<tr>
    <td style="font-weight:600;padding:9px 14px;background:#f8f7f4;width:170px;border-bottom:1px solid #e8e3d8;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:9px 14px;border-bottom:1px solid #e8e3d8;">${escapeHtml(value)}</td>
  </tr>`;
}

function buildHtml(p: ContactFormPayload, fullName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="font-family:Georgia,'Times New Roman',serif;color:#1a1a18;background:#fff;max-width:640px;margin:0 auto;padding:32px 24px;">

  <div style="border-top:4px solid #b8922a;padding-top:20px;margin-bottom:28px;">
    <p style="font-size:22px;font-weight:700;letter-spacing:0.04em;color:#1a1a18;margin:0;">SKYELINE HOMES</p>
    <p style="font-size:12px;letter-spacing:0.2em;color:#8a8070;margin:4px 0 0;text-transform:uppercase;">New Contact Inquiry</p>
  </div>

  <h2 style="font-size:20px;margin:0 0 20px;font-weight:600;">You have a new inquiry from ${escapeHtml(fullName)}</h2>

  <table style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:24px;">
    <tbody>
      ${row('Name', fullName)}
      ${row('Email', p.email)}
      ${row('Phone', p.phone)}
      ${row('City of Interest', p.cityOfInterest)}
      ${row('Budget Range', p.budgetRange)}
      ${row('Project Type', p.projectType)}
      ${row('Lot Status', p.lotStatus)}
      ${row('How They Found Us', p.source)}
    </tbody>
  </table>

  ${p.message ? `
  <div style="margin-bottom:24px;">
    <p style="font-size:13px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#8a8070;margin:0 0 8px;">Project Details</p>
    <div style="background:#f8f7f4;border-left:3px solid #b8922a;padding:14px 16px;font-size:15px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(p.message)}</div>
  </div>` : ''}

  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e8e3d8;">
    <a href="mailto:${escapeHtml(p.email || '')}" style="display:inline-block;background:#1a1a18;color:#fff;padding:12px 28px;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;">Reply to ${escapeHtml(fullName)}</a>
  </div>

  <p style="margin-top:28px;font-size:12px;color:#aaa;">Submitted via skyelinehomes.com contact form · ${new Date().toLocaleString('en-US', { timeZone: 'America/Denver', dateStyle: 'medium', timeStyle: 'short' })} MT</p>
</body>
</html>`;
}

function buildText(p: ContactFormPayload, fullName: string): string {
  const lines = [
    'NEW CONTACT INQUIRY — SKYELINE HOMES',
    '======================================',
    `Name:         ${fullName}`,
    `Email:        ${p.email || '—'}`,
    `Phone:        ${p.phone || '—'}`,
    `City:         ${p.cityOfInterest || '—'}`,
    `Budget:       ${p.budgetRange || '—'}`,
    `Project Type: ${p.projectType || '—'}`,
    `Lot Status:   ${p.lotStatus || '—'}`,
    `Source:       ${p.source || '—'}`,
  ];
  if (p.message) {
    lines.push('', 'Project Details:', '----------------', p.message);
  }
  lines.push('', `Submitted via skyelinehomes.com contact form — ${new Date().toISOString()}`);
  return lines.join('\n');
}

export function registerContactFormHandler(app: Express) {
  // Handle CORS preflight for cross-origin POSTs from the marketing site
  app.options('/api/contact', (req: any, res: any) => {
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).send('');
  });

  app.post('/api/contact', async (req: any, res: any) => {
    // Explicit CORS header for the marketing site (global cors({ origin: true })
    // already covers it, but belt-and-suspenders for the cross-site POST flow)
    const origin = req.headers.origin || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    try {
      const p = (req.body || {}) as ContactFormPayload;

      // Honeypot — bots auto-fill every field; real users never see `website`
      if (p.website && String(p.website).trim() !== '') {
        console.warn('[contactForm] honeypot tripped — dropping silently');
        return res.json({ ok: true });
      }

      // Validate required fields
      const firstName = (p.firstName || '').trim();
      const lastName = (p.lastName || '').trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const email = (p.email || '').trim().toLowerCase();

      if (!fullName || fullName.length < 2) {
        return res.status(400).json({ error: 'Please enter your name.' });
      }
      if (!email || !/.+@.+\..+/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      // Resend config — secrets bound via firebase:secrets
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        console.error('[contactForm] RESEND_API_KEY not set');
        return res.status(503).json({ error: 'Email service is temporarily unavailable. Please call us directly.' });
      }

      const resend = new Resend(apiKey);
      const { error: resendError } = await resend.emails.send({
        from: 'Skyeline Homes <tyler@skyelinehomes.com>',
        to: 'tyler@skyelinehomes.com',
        replyTo: `${fullName} <${email}>`,
        subject: `New Inquiry: ${fullName}${p.cityOfInterest ? ` — ${p.cityOfInterest}` : ''}${p.budgetRange ? ` (${p.budgetRange})` : ''}`,
        text: buildText(p, fullName),
        html: buildHtml(p, fullName),
      });
      if (resendError) throw new Error(resendError.message);

      console.log(`[contactForm] inquiry sent — from=${email} city=${p.cityOfInterest || '?'} budget=${p.budgetRange || '?'}`);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error('[contactForm] failed', err?.response?.body || err?.message || err);
      return res.status(500).json({ error: 'Failed to send your message. Please try again or call us directly.' });
    }
  });
}
