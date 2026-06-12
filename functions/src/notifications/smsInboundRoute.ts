// POST /api/sms/inbound
//
// Twilio inbound-message webhook. Point your Twilio messaging number's
// "A MESSAGE COMES IN" webhook here:
//   https://skyelineos.web.app/api/sms/inbound   (HTTP POST)
//
// Honors the carrier-mandated keywords so we stay TCPA / CTIA compliant and
// keep our own opt-out ledger (`sms_opt_outs/{e164}`) in sync:
//   STOP / UNSUBSCRIBE / CANCEL / END / QUIT  → opt the number out
//   START / UNSTOP / YES                       → opt the number back in
//   HELP / INFO                                → reply with help text
//
// Twilio's Advanced Opt-Out already blocks STOPed numbers at the carrier level,
// but mirroring the state lets our own senders skip the number (no wasted
// Twilio errors) and lets START re-enable it. We respond with TwiML; for STOP
// we send an empty <Response/> because the carrier injects the confirmation.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { classifySmsKeyword, applySmsKeyword } from './sms';

const HELP_REPLY =
  'Skyeline Homes alerts. Reply STOP to unsubscribe, START to resubscribe. Msg & data rates may apply. Questions: call your Skyeline contact.';

function twiml(message?: string): string {
  if (!message) return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

export function registerSmsInboundRoute(app: Express, db: admin.firestore.Firestore) {
  app.post('/api/sms/inbound', async (req: any, res: any) => {
    try {
      const from = String(req.body?.From || '').trim();
      const body = String(req.body?.Body || '');
      const keyword = classifySmsKeyword(body);

      if (from && (keyword === 'stop' || keyword === 'start')) {
        await applySmsKeyword(db, from, keyword);
        console.log(`[sms-inbound] ${keyword.toUpperCase()} from ${from}`);
      }

      res.set('Content-Type', 'text/xml');
      // STOP confirmation is injected by the carrier — reply empty to avoid a
      // double message. HELP gets our help text. START + anything else: empty.
      return res.send(twiml(keyword === 'help' ? HELP_REPLY : undefined));
    } catch (e: any) {
      console.error('[sms-inbound] error:', e);
      // Always 200 with valid TwiML so Twilio doesn't retry-storm.
      res.set('Content-Type', 'text/xml');
      return res.send(twiml());
    }
  });
}
