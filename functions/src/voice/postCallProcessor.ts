// Skyeline Homes Voice AI Receptionist — post-call processing
//
// Runs when Twilio posts back the call transcription. Pipes the transcript
// through Claude to extract:
//   • Summary (1–2 sentences, Tyler-voice)
//   • Action items
//   • Project association (best-effort)
//   • Sentiment
//
// Side effects:
//   • Updates call_logs/{callSid} with the extracted fields
//   • Creates project_tasks docs for each action item (when we have a project)
//   • Writes a notifications doc when sentiment is "urgent" / "negative"
//   • Appends a row to communications/{threadId}/extractions when a project
//     was identified (mirrors the SMS extraction surface)
//
// Soft-fails everywhere — a bad extraction shouldn't break callbacks.

import Anthropic from '@anthropic-ai/sdk';
import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { CALL_LOGS, getCallLog, notifyTyler, updateCallLog } from './callLogger';
import type { CallSentiment } from './types';

const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 600;

const EXTRACTION_PROMPT = `You are analyzing a transcribed voicemail or phone call left for Skyeline Homes (Tyler Rhoton, GC, American Fork UT). Extract structured information for the project management system.

Return ONLY a JSON object with this shape:
{
  "summary": "<1–2 sentence summary in plain language; mention who called and what they wanted>",
  "actionItems": ["<short imperative phrase>", "..."],
  "projectHint": "<client last name or project nickname mentioned, or empty string>",
  "sentiment": "positive" | "neutral" | "urgent" | "negative",
  "callerIntent": "<one of: schedule, status_update, question, complaint, lead, payment, emergency, other>"
}

Rules:
- summary should sound like Tyler glancing at a call log: short, casual, factual.
- actionItems must be concrete things Tyler would put on a list ("call back John about driveway", "schedule electrical inspection"). Empty array if nothing actionable.
- sentiment "urgent" is reserved for safety / emergency / time-critical situations.
- Don't invent details. If the transcript is garbled, return empty fields and "neutral" sentiment.
- Output ONLY the JSON. No markdown, no code fences.`;

interface Extraction {
  summary: string;
  actionItems: string[];
  projectHint: string;
  sentiment: CallSentiment;
  callerIntent: string;
}

function client(): Anthropic {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not bound to this function');
  return new Anthropic({ apiKey });
}

/**
 * Entry point invoked by the transcription-complete webhook. Reads the
 * current call log, runs Claude over the transcript, writes the results back,
 * and fans out the side effects (tasks, notifications, communication thread).
 */
export async function processCallTranscript(
  db: Firestore,
  callSid: string,
  transcript: string,
): Promise<void> {
  const log = await getCallLog(db, callSid);
  if (!log) {
    console.warn('[voice/postCall] no call log for', callSid);
    return;
  }
  if (!transcript || !transcript.trim()) {
    await updateCallLog(db, callSid, { transcript: '', postProcessed: true });
    return;
  }

  let extraction: Extraction;
  try {
    extraction = await runExtraction(transcript);
  } catch (err: any) {
    console.error('[voice/postCall] extraction failed:', err?.message);
    // Still store the transcript so a human can read it later.
    await updateCallLog(db, callSid, { transcript, postProcessed: true });
    return;
  }

  // Best-effort project resolution if the AI hinted at a client/project name.
  let resolvedProjectId: string | null = log.projectId ?? null;
  let resolvedProjectName: string | null = log.projectName ?? null;
  if (!resolvedProjectId && extraction.projectHint) {
    const match = await findProjectByHint(db, extraction.projectHint);
    if (match) {
      resolvedProjectId = match.id;
      resolvedProjectName = match.name;
    }
  }

  await updateCallLog(db, callSid, {
    transcript,
    aiSummary: extraction.summary || null,
    actionItems: extraction.actionItems || [],
    sentiment: extraction.sentiment || 'neutral',
    projectId: resolvedProjectId,
    projectName: resolvedProjectName,
    postProcessed: true,
  });

  // Side effect 1: create project_tasks for each action item when we know the
  // project. We tag them as voice-sourced so Tyler can filter.
  if (resolvedProjectId && extraction.actionItems?.length) {
    await Promise.all(extraction.actionItems.slice(0, 10).map((item) =>
      db.collection('project_tasks').add({
        projectId: resolvedProjectId,
        projectName: resolvedProjectName || null,
        title: item.slice(0, 200),
        description: `From call ${callSid} (${log.from}): "${truncate(transcript, 400)}"`,
        status: 'open',
        source: 'voice',
        sourceCallSid: callSid,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: 'voice-agent',
      }).catch((err: any) => console.warn('[voice/postCall] task create failed:', err?.message)),
    ));
  }

  // Side effect 2: notify Tyler when something needs eyes.
  if (extraction.sentiment === 'urgent' || extraction.sentiment === 'negative') {
    await notifyTyler(
      db,
      extraction.sentiment === 'urgent' ? 'Urgent call needs attention' : 'Heads up — tense call',
      `${log.contactName || log.from}: ${extraction.summary}`,
      `/voice/calls/${callSid}`,
      { callSid, sentiment: extraction.sentiment, intent: extraction.callerIntent },
    );
  }

  // Side effect 3: log to the project communication thread so the activity
  // feed shows "📞 Brad called: framing done by Friday". We piggyback on the
  // existing communications collection.
  if (resolvedProjectId) {
    try {
      await db.collection('communications')
        .doc(resolvedProjectId)
        .collection('events')
        .add({
          type: 'voice_call',
          callSid,
          from: log.from,
          contactId: log.contactId || null,
          contactName: log.contactName || null,
          summary: extraction.summary,
          actionItems: extraction.actionItems,
          sentiment: extraction.sentiment,
          callerIntent: extraction.callerIntent,
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch (err: any) {
      console.warn('[voice/postCall] communication log failed:', err?.message);
    }
  }
}

async function runExtraction(transcript: string): Promise<Extraction> {
  const resp: any = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: `TRANSCRIPT:\n${transcript.trim()}` }],
  });
  const raw = (resp.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
  return parseExtraction(raw);
}

function parseExtraction(raw: string): Extraction {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) {
    return emptyExtraction();
  }
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    const sentiment = ['positive', 'neutral', 'urgent', 'negative'].includes(obj?.sentiment)
      ? (obj.sentiment as CallSentiment)
      : 'neutral';
    return {
      summary: String(obj?.summary || '').trim(),
      actionItems: Array.isArray(obj?.actionItems)
        ? obj.actionItems.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 20)
        : [],
      projectHint: String(obj?.projectHint || '').trim(),
      sentiment,
      callerIntent: String(obj?.callerIntent || 'other').trim().toLowerCase(),
    };
  } catch (err: any) {
    console.warn('[voice/postCall] parse failed:', err?.message);
    return emptyExtraction();
  }
}

function emptyExtraction(): Extraction {
  return {
    summary: '',
    actionItems: [],
    projectHint: '',
    sentiment: 'neutral',
    callerIntent: 'other',
  };
}

/**
 * Best-effort project lookup by hint string (typically a client last name or
 * city). We scan up to ~500 projects which is well under the active-project
 * count Tyler runs at once. If nothing fuzzy-matches we return null and let
 * the caller leave the project unset.
 */
async function findProjectByHint(
  db: Firestore,
  hint: string,
): Promise<{ id: string; name: string } | null> {
  const needle = hint.toLowerCase().trim();
  if (!needle) return null;
  try {
    const snap = await db.collection('projects').limit(500).get();
    for (const d of snap.docs) {
      const data: any = d.data() || {};
      const candidates = [
        data.name,
        data.clientLastName,
        data.client,
        data.nickname,
        data.address,
        data.city,
      ].filter(Boolean).map((s: string) => String(s).toLowerCase());
      if (candidates.some((c) => c.includes(needle) || needle.includes(c))) {
        return { id: d.id, name: data.name || data.clientLastName || d.id };
      }
    }
  } catch (err: any) {
    console.warn('[voice/postCall] findProjectByHint failed:', err?.message);
  }
  return null;
}

function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Re-export admin for tests that need it
export { admin };
