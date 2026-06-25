// Skyeline Homes Voice AI Receptionist — Express routes
//
// PUBLIC (Twilio signature is the gate):
//   POST /api/voice/inbound                  — initial TwiML, starts the call
//   POST /api/voice/gather                   — handles speech turns from caller
//   POST /api/voice/recording-complete       — Twilio posts final recording URL
//   POST /api/voice/transcription-complete   — Twilio posts the transcript
//
// All four endpoints return TwiML on 2xx no matter what — Twilio retry-storms
// on 5xx and the call hangs. We catch every error and emit a valid TwiML
// fallback (usually "Let me grab Tyler").
//
// Signature validation mirrors smsService.ts: trust the TWILIO_WEBHOOK_URL env
// when set, fall back to the host header. On signature failure we log + allow
// through (same as SMS — once the URL is locked in we can flip it to a hard
// reject).

import type { Express, Request, Response } from 'express';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import twilio from 'twilio';
import { findContactByPhone } from '../sms/smsService';
import type { SmsContact, JobContext } from '../sms/types';
import { generateVoiceResponse, safeTransfer } from './voiceAgent';
import {
  appendTurn,
  CALL_LOGS,
  getCallLog,
  logCall,
  updateCallLog,
} from './callLogger';
import { processCallTranscript } from './postCallProcessor';

// ── Configuration ───────────────────────────────────────────────────────────

const TYLER_CELL = '+12084035905';
const SKYELINE_NUMBER = '+13852334688';
// Polly Neural voices are the most natural option Twilio offers without an
// external TTS hop. Joanna is warm, female, US English. If Tyler wants male
// or non-US we can swap this constant.
const TTS_VOICE = 'Polly.Joanna-Neural';

// ── Twilio signature validation ─────────────────────────────────────────────
// Same defensive shape as the SMS verifier. We treat a missing auth token as
// a local-dev bypass so tests can hit the routes without secrets.
function verifyTwilioVoiceSignature(req: Request): boolean {
  const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
  if (!authToken) return true;
  const signature = String(req.headers['x-twilio-signature'] || '');
  if (!signature) return false;

  // Voice endpoints are different URLs from SMS so we derive the base URL
  // from TWILIO_WEBHOOK_URL when present, then swap the path. If that env is
  // unset (or points to /api/sms/...) we fall back to the host header.
  const configured = (process.env.TWILIO_WEBHOOK_URL || '').trim();
  let url: string;
  if (configured) {
    try {
      const u = new URL(configured);
      u.pathname = req.originalUrl.split('?')[0] || u.pathname;
      url = u.toString();
    } catch {
      url = configured;
    }
  } else {
    url = `https://${req.get('host')}${req.originalUrl}`;
  }

  try {
    return twilio.validateRequest(authToken, signature, url, req.body || {});
  } catch (err: any) {
    console.error('[voice] signature validation threw:', err?.message);
    return false;
  }
}

// ── TwiML helpers ───────────────────────────────────────────────────────────
//
// We hand-build TwiML rather than importing twilio.twiml.VoiceResponse so the
// emitted XML is auditable inline and we can be paranoid about escaping.

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function say(text: string): string {
  return `<Say voice="${TTS_VOICE}">${xmlEscape(text)}</Say>`;
}

function twimlResponse(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

/**
 * TwiML to transfer the call to Tyler's cell. The Dial verb shows Tyler our
 * Twilio number as the caller ID (not the original caller) so he can see at
 * a glance that it came through the receptionist line.
 */
function transferToTyler(prefaceText?: string): string {
  const preface = prefaceText ? say(prefaceText) : '';
  return twimlResponse(`${preface}<Dial callerId="${SKYELINE_NUMBER}" timeout="20">${TYLER_CELL}</Dial>`);
}

/**
 * TwiML for "go listen for the next utterance". We use <Gather input="speech">
 * so Twilio runs real-time speech recognition and posts the result back to
 * /api/voice/gather.
 */
function gather(promptText?: string): string {
  const prompt = promptText ? say(promptText) : '';
  return twimlResponse(
    `<Gather input="speech" action="/api/voice/gather" method="POST" timeout="6" speechTimeout="auto">${prompt}</Gather>${say("I didn't catch that. Let me grab Tyler.")}<Dial callerId="${SKYELINE_NUMBER}">${TYLER_CELL}</Dial>`,
  );
}

/**
 * TwiML to record a voicemail. Used as a fallback when the AI hits an error
 * or the caller wants to leave a message. Twilio fires the transcription
 * callback when done.
 */
function recordVoicemail(prompt: string): string {
  return twimlResponse(
    `${say(prompt)}<Record action="/api/voice/recording-complete" method="POST" transcribe="true" transcribeCallback="/api/voice/transcription-complete" maxLength="180" playBeep="true" trim="trim-silence" />${say("Thanks. We'll get back to you.")}<Hangup/>`,
  );
}

// ── Route registration ─────────────────────────────────────────────────────

export function registerVoiceRoutes(app: Express, db: Firestore): void {
  // POST /api/voice/inbound — entry point
  app.post('/api/voice/inbound', async (req: Request, res: Response) => {
    res.set('Content-Type', 'text/xml');
    try {
      if (!verifyTwilioVoiceSignature(req)) {
        // Log but allow through — same posture as the SMS webhook until URL
        // is locked in. Flip this to a hard reject once verified in prod.
        console.warn('[voice/inbound] signature invalid — allowing through for debug');
      }

      const body = (req.body || {}) as Record<string, string>;
      const callSid = String(body.CallSid || '');
      const from = String(body.From || '').trim();
      const to = String(body.To || SKYELINE_NUMBER).trim();

      if (!callSid || !from) {
        console.warn('[voice/inbound] missing CallSid/From — taking voicemail');
        res.send(recordVoicemail('Hey, thanks for calling Skyeline Homes. Leave a message after the beep and Tyler will get back to you.'));
        return;
      }

      // Look up caller in roster.
      const contact = await findContactByPhone(db, from).catch((err: any) => {
        console.warn('[voice/inbound] contact lookup failed:', err?.message);
        return null;
      });

      // Create the call log up front so callbacks have a row to merge into.
      await logCall(db, callSid, from, to, contact, null, undefined, 'IN_PROGRESS')
        .catch((err: any) => console.warn('[voice/inbound] logCall failed:', err?.message));

      // Tailor the greeting to whether we recognize the caller.
      const greeting = contact
        ? `Hey ${firstName(contact.name)}, this is the Skyeline assistant. What can I help you with?`
        : `Hey, thanks for calling Skyeline Homes. This is the Skyeline assistant. What can I help you with today?`;

      // Note: we don't <Record> on the top-level call because that would dial
      // Twilio's recording in parallel with <Gather>. Instead we rely on the
      // gather → AI → potential Record path, and Twilio's "record entire call"
      // setting can be turned on at the number level later if Tyler wants a
      // belt-and-suspenders archive.
      res.send(gather(greeting));
    } catch (err: any) {
      console.error('[voice/inbound] error:', err?.message);
      res.send(transferToTyler('One sec, let me get Tyler.'));
    }
  });

  // POST /api/voice/gather — runs after each Gather verb captures speech
  app.post('/api/voice/gather', async (req: Request, res: Response) => {
    res.set('Content-Type', 'text/xml');
    try {
      if (!verifyTwilioVoiceSignature(req)) {
        console.warn('[voice/gather] signature invalid — allowing through for debug');
      }

      const body = (req.body || {}) as Record<string, string>;
      const callSid = String(body.CallSid || '');
      const from = String(body.From || '').trim();
      const speechResult = String(body.SpeechResult || '').trim();
      const confidence = Number(body.Confidence || 0);

      // No speech captured (silence / hangup-ish behaviour). Twilio also hits
      // this URL with empty SpeechResult when its STT timed out. Transfer.
      if (!speechResult) {
        console.info(`[voice/gather] empty SpeechResult on ${callSid} — transferring`);
        await updateCallLog(db, callSid, { disposition: 'TRANSFERRED', transferReason: 'No speech captured' });
        res.send(transferToTyler("I didn't catch that. Let me grab Tyler for you."));
        return;
      }

      // Log the caller's turn first so the AI sees its own context.
      await appendTurn(db, callSid, { speaker: 'caller', text: speechResult });

      // Load the call log to get context (turns, contact, project).
      const log = await getCallLog(db, callSid);
      const contact = log?.contactId
        ? await loadContactById(db, log.contactId)
        : await findContactByPhone(db, from).catch(() => null);

      // Generate the AI response.
      let aiResponse;
      try {
        aiResponse = await generateVoiceResponse({
          contact: contact || null,
          capturedName: log?.capturedName || null,
          project: null,           // TODO: route resolution like SMS — phase 2
          turns: log?.turns || [],
          latestUtterance: speechResult,
        });
      } catch (err: any) {
        console.error('[voice/gather] AI generation failed:', err?.message);
        aiResponse = safeTransfer('AI generation threw');
      }

      // Defensive: STT had very low confidence and the AI didn't already
      // transfer — bump up to a transfer rather than acting on garbage.
      if (confidence > 0 && confidence < 0.3 && aiResponse.type === 'ANSWER') {
        console.info(`[voice/gather] low STT confidence ${confidence}; upgrading to transfer`);
        aiResponse = safeTransfer('Low STT confidence');
      }

      // Log the assistant's turn for the post-call processor.
      await appendTurn(db, callSid, {
        speaker: 'assistant',
        text: aiResponse.spokenResponse,
        responseType: aiResponse.type,
      });

      // Branch on the AI's decision.
      switch (aiResponse.type) {
        case 'URGENT_TRANSFER':
          await updateCallLog(db, callSid, {
            disposition: 'TRANSFERRED',
            transferReason: aiResponse.transferReason || 'Urgent transfer',
            sentiment: 'urgent',
          });
          // Notify Tyler before connecting so he sees context even if he
          // misses the ring.
          await db.collection('notifications').add({
            source: 'voice',
            title: '🚨 Urgent call coming in',
            body: `${contact?.name || from}: ${aiResponse.transferReason || 'urgent transfer'}`,
            audienceRole: 'admin',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
          }).catch(() => { /* best-effort */ });
          res.send(transferToTyler(aiResponse.spokenResponse));
          return;

        case 'TRANSFER':
          await updateCallLog(db, callSid, {
            disposition: 'TRANSFERRED',
            transferReason: aiResponse.transferReason || 'AI decided to transfer',
          });
          res.send(transferToTyler(aiResponse.spokenResponse));
          return;

        case 'TAKE_MESSAGE':
          await updateCallLog(db, callSid, { disposition: 'VOICEMAIL' });
          res.send(recordVoicemail(aiResponse.spokenResponse));
          return;

        case 'ANSWER':
        default:
          // Keep the conversation going.
          await updateCallLog(db, callSid, { disposition: 'ANSWERED_BY_AI' });
          res.send(gather(aiResponse.spokenResponse));
          return;
      }
    } catch (err: any) {
      console.error('[voice/gather] error:', err?.message);
      res.send(transferToTyler('One sec, let me get Tyler.'));
    }
  });

  // POST /api/voice/recording-complete — Twilio posts the recording URL
  app.post('/api/voice/recording-complete', async (req: Request, res: Response) => {
    res.set('Content-Type', 'text/xml');
    try {
      if (!verifyTwilioVoiceSignature(req)) {
        console.warn('[voice/recording-complete] signature invalid — allowing through for debug');
      }
      const body = (req.body || {}) as Record<string, string>;
      const callSid = String(body.CallSid || '');
      const recordingUrl = String(body.RecordingUrl || '').trim();
      const duration = Number(body.RecordingDuration || 0);

      if (callSid && recordingUrl) {
        await updateCallLog(db, callSid, {
          recordingUrl: `${recordingUrl}.mp3`,  // Twilio expects you to suffix the format
          recordingDuration: duration || null,
        });
      }
    } catch (err: any) {
      console.error('[voice/recording-complete] error:', err?.message);
    }
    // No further TwiML — call has already ended.
    res.send(twimlResponse(''));
  });

  // POST /api/voice/transcription-complete — Twilio posts the transcript
  app.post('/api/voice/transcription-complete', async (req: Request, res: Response) => {
    res.set('Content-Type', 'text/xml');
    try {
      if (!verifyTwilioVoiceSignature(req)) {
        console.warn('[voice/transcription-complete] signature invalid — allowing through for debug');
      }
      const body = (req.body || {}) as Record<string, string>;
      const callSid = String(body.CallSid || '');
      const transcript = String(body.TranscriptionText || '').trim();
      const transcriptionStatus = String(body.TranscriptionStatus || '').trim();

      if (!callSid) {
        res.send(twimlResponse(''));
        return;
      }
      if (transcriptionStatus && transcriptionStatus !== 'completed') {
        console.info(`[voice/transcription-complete] ${callSid} status=${transcriptionStatus}; skipping extraction`);
        await updateCallLog(db, callSid, { transcript: transcript || null, postProcessed: true });
        res.send(twimlResponse(''));
        return;
      }

      // Run extraction async — don't make Twilio wait. But await within the
      // handler so logs surface in the same request when something throws.
      await processCallTranscript(db, callSid, transcript)
        .catch((err: any) => console.error('[voice/transcription-complete] processing failed:', err?.message));
    } catch (err: any) {
      console.error('[voice/transcription-complete] error:', err?.message);
    }
    res.send(twimlResponse(''));
  });
}

// ── Internal helpers ───────────────────────────────────────────────────────

async function loadContactById(db: Firestore, contactId: string): Promise<SmsContact | null> {
  try {
    const snap = await db.collection('sms_contacts').doc(contactId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...(snap.data() as any) } as SmsContact;
  } catch (err: any) {
    console.warn('[voice] loadContactById failed:', err?.message);
    return null;
  }
}

function firstName(full: string): string {
  if (!full) return '';
  const first = full.trim().split(/\s+/)[0];
  return first || full;
}

// Re-export CALL_LOGS for the agent route module.
export { CALL_LOGS };

// Re-export JobContext to avoid an unused-import warning if the file is type-checked in isolation.
export type { JobContext };
