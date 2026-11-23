/**
 * Owner AI Operations bridge.
 *
 * Transport: private Firestore owner inbox -> Google Sheets assignment queue ->
 * Muse's existing 15 minute poller -> Firestore replies/events.
 *
 * This is a provider bridge, not a native ChatGPT conversation. It never
 * marks a task running without an actual worker-reported run/heartbeat.
 * Requires sharing the assignments spreadsheet with the Cloud Functions
 * runtime service-account identity (Editor). No stored service account keys.
 */
import * as admin from 'firebase-admin';
import { createHash } from 'crypto';
import { google } from 'googleapis';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const SHEET_ID = '1TOQe8c0y0_5eIJ7Y1ln6ZJTHc2NAriNjTKa7rk6Od2E';
const COL = 'Assignments';
const QUEUE_PREFIX = 'OPS-';
const googleAuth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth: googleAuth });
const maxRows = 2000;

function stableId(id: string) {
  return QUEUE_PREFIX + id;
}
function safeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Never store/relay credentials or raw Google Auth request data to the UI.
  if (/403|permission|insufficient/i.test(msg)) return 'Sheets permission denied: grant Cloud Functions runtime identity Editor access to the Muse assignment spreadsheet.';
  if (/401|credential|unauthorized/i.test(msg)) return 'Cloud Functions Google credentials unavailable. Verify workload identity and project permissions.';
  if (/404|not found/i.test(msg)) return 'Muse assignment spreadsheet was not accessible by the Cloud Functions runtime.';
  return 'Assistant queue synchronization unavailable. Inspect Cloud Functions logs for details.';
}

async function bridgeHealth(status: 'connected' | 'degraded', message: string) {
  await db.doc('ownerAiBridge/health').set({
    status, message, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function recordEvent(id: string, title: string, detail: string, source: string, goalId?: string | null) {
  await db.collection('ownerGoalEvents').doc(id).set({
    title, detail, source, goalId: goalId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function loadAssignments() {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: COL + '!A2:F' + maxRows,
  });
  return (response.data.values || []) as string[][];
}

function rowFor(id: string, goalId: string | undefined, body: string) {
  return [
    id, 'Queued',
    'SkyelineOS AI Operations owner request (source: ' + id + ', goal: ' + (goalId || 'General') +
      '). Please acknowledge pickup, perform safe authorized work, document sources and result in the Result field, and mark Done or Blocked. ' +
      'Do not make payments, deploy, grant access, or contact third parties without explicit approval. REQUEST: ' + body,
    '', '', '',
  ];
}

async function dispatch(id: string, data: FirebaseFirestore.DocumentData) {
  const messageRef = db.collection('ownerAgentMessages').doc(id);
  const assignId = stableId(id);
  const body = String(data.body || '').trim().slice(0, 3000);
  if (data.sender !== 'owner' || !body) return;
  try {
    const rows = await loadAssignments();
    const exists = rows.some(row => row[0] === assignId);
    if (!exists) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: COL + '!A:F',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [rowFor(assignId, data.goalId, body)] },
      });
    }
    await messageRef.set({
      assignmentId: assignId,
      deliveryState: 'queued_to_muse',
      deliveryMessage: 'Sent to the shared Muse assignment queue. Awaiting pickup.',
      dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await recordEvent('queued-' + id, 'Assistant request queued', 'Delivered to Muse assignment queue; execution not yet confirmed.', 'SkyelineOS', data.goalId);
    await bridgeHealth('connected', 'Assignment queue reachable. Last outbound handoff succeeded.');
  } catch (error) {
    console.error('[AI Operations] queue dispatch failed', { id, error });
    const reason = safeError(error);
    await messageRef.set({ deliveryState: 'blocked', deliveryMessage: reason }, { merge: true });
    await recordEvent('blocked-' + id, 'Assistant delivery blocked', reason, 'SkyelineOS', data.goalId);
    await bridgeHealth('degraded', reason);
  }
}

export const aiOperationsDispatch = onDocumentCreated(
  { document: 'ownerAgentMessages/{messageId}', region: 'us-central1', retry: false },
  async event => {
    if (!event.data) return;
    const data = event.data.data();
    if (data.sender === 'owner') await dispatch(event.params.messageId, data);
  },
);

async function synchronizeResults() {
  const rows = await loadAssignments();
  for (const row of rows) {
    const [id, statusRaw, , resultRaw, blockerRaw] = row;
    if (!id || !id.startsWith(QUEUE_PREFIX)) continue;
    const messageId = id.slice(QUEUE_PREFIX.length);
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(messageId)) continue;
    const messageRef = db.collection('ownerAgentMessages').doc(messageId);
    const snap = await messageRef.get();
    if (!snap.exists || snap.data()?.sender !== 'owner') continue;
    const status = String(statusRaw || '').trim().toLowerCase();
    const result = String(resultRaw || '').trim().slice(0, 10000);
    const blocker = String(blockerRaw || '').trim().slice(0, 2000);
    const hash = createHash('sha256').update([status, result, blocker].join('\n')).digest('hex');
    if (snap.data()?.lastSyncedHash === hash) continue;
    const next = status === 'done' ? 'answered'
      : status === 'blocked' ? 'blocked'
      : status === 'in progress' || status === 'working' ? 'processing'
      : 'queued_to_muse';
    await messageRef.set({
      deliveryState: next, lastSyncedHash: hash,
      deliveryMessage: status === 'blocked' ? (blocker || 'Muse reported a blocker.')
        : next === 'answered' ? 'Muse returned a response.'
        : next === 'processing' ? 'Muse acknowledged this assignment.'
        : 'Awaiting Muse pickup.',
      lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (next === 'answered' || next === 'blocked') {
      const replyBody = result || blocker || 'Muse reported the status without details; follow-up required.';
      await db.collection('ownerAgentMessages').doc('reply-' + messageId).set({
        sender: 'agent', agentName: 'Muse',
        body: replyBody, goalId: snap.data()?.goalId || null,
        assignmentId: id, deliveryState: next,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      await recordEvent(next + '-' + messageId, next === 'answered' ? 'Muse delivered results' : 'Muse needs help',
        next === 'blocked' ? (blocker || replyBody) : 'Muse response saved in Assistant Inbox.',
        'Muse', snap.data()?.goalId);
    }
  }
}

async function checkStaleGoals() {
  const snap = await db.collection('ownerGoals').where('status', 'in', ['running', 'queued']).limit(200).get();
  const now = Date.now();
  for (const item of snap.docs) {
    const goal = item.data();
    const hb = goal.heartbeatAt?.toMillis?.() || 0;
    const lease = goal.leaseExpiresAt?.toMillis?.() || 0;
    const due = goal.nextCheckAt?.toMillis?.() || 0;
    const stale = goal.status === 'running'
      ? !goal.runId || !hb || !lease || now - hb > 10 * 60_000 || lease < now
      : !!due && due < now;
    if (!stale) continue;
    await item.ref.update({
      status: 'stalled', nextAction: 'Review agent execution status and recover or reassign.',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await recordEvent('stalled-' + item.id + '-' + Math.floor(now / 3_600_000),
      'Agent work stalled', 'The run lease expired or the next pickup check was missed.', 'SkyelineOS', item.id);
  }
}

export const aiOperationsWatchdog = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'America/Denver', region: 'us-central1' },
  async () => {
    try {
      await synchronizeResults();
      await bridgeHealth('connected', 'Assignment queue status sync succeeded.');
    } catch (err) {
      console.error('[AI Operations] inbound sync unavailable', err);
      await bridgeHealth('degraded', safeError(err));
    }
    await checkStaleGoals();
  },
);
