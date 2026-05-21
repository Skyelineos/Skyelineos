// Gmail ingester for the Ingestion Lab.
//
// POST /api/ingestionLab/ingest/gmail — admin-only. Lists all messages in the
// connected Gmail account that carry the label "Skyeline-Spike", writes each
// to ingestion_lab/data/raw_items with a deterministic doc ID
// (gmail__{messageId}). Idempotent — re-runs skip already-ingested messages.
//
// projectHint resolution: if the sender email matches a single project in the
// contacts_cache, we stamp the matching slug on the raw_item. Multi-project
// matches and unknown senders leave projectHint null; the brain pass handles
// the disambiguation by routing to the Ask queue when projectId is null.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { adminOnly } from './adminAuth';
import { getAuthorizedClient } from './googleClient';

const SPIKE_LABEL = 'Skyeline-Spike';

function rawItemsRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('raw_items');
}
function contactsCacheRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('contacts_cache');
}
function configRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('config');
}

export function registerGmailIngester(app: Express, db: FirebaseFirestore.Firestore): void {
  app.post('/api/ingestionLab/ingest/gmail', adminOnly, async (req: any, res: any) => {
    try {
      const auth = await getAuthorizedClient(db, 'gmail');
      const gmail = google.gmail({ version: 'v1', auth: auth as any });

      // Resolve the Skyeline-Spike label ID. Gmail list-by-label needs the
      // internal label ID, not the display name.
      const labelsRes = await gmail.users.labels.list({ userId: 'me' });
      const spikeLabel = (labelsRes.data.labels || []).find((l: any) => l.name === SPIKE_LABEL);
      if (!spikeLabel || !spikeLabel.id) {
        res.status(400).json({
          error: `Label "${SPIKE_LABEL}" not found on the connected inbox. Create it in Gmail (or apply it to threads) and retry.`,
        });
        return;
      }

      // Build a sender-email → labProjectSlugs map from the contacts_cache.
      const contactsSnap = await contactsCacheRef(db).get();
      const contactsByEmail = new Map<string, string[]>();
      for (const c of contactsSnap.docs) {
        const d: any = c.data();
        if (d.email) contactsByEmail.set(String(d.email).toLowerCase(), d.labProjectSlugs || []);
      }

      // Paginate through every message on the label.
      const messageIds: string[] = [];
      let pageToken: string | undefined = undefined;
      do {
        const listRes: any = await gmail.users.messages.list({
          userId: 'me',
          labelIds: [spikeLabel.id],
          maxResults: 100,
          pageToken,
        });
        for (const m of listRes.data.messages || []) {
          if (m.id) messageIds.push(m.id);
        }
        pageToken = listRes.data.nextPageToken || undefined;
      } while (pageToken);

      let newCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const msgId of messageIds) {
        try {
          const docId = `gmail__${urlSafe(msgId)}`;
          const existingDoc = await rawItemsRef(db).doc(docId).get();
          if (existingDoc.exists) {
            // Quick skip — avoid wasting Gmail quota on already-ingested
            // messages. The create() below would also catch the duplicate,
            // but fetching the message body every run is needless cost.
            skippedCount += 1;
            continue;
          }

          const msg: any = await gmail.users.messages.get({
            userId: 'me',
            id: msgId,
            format: 'full',
          });

          const headers: any[] = msg.data.payload?.headers || [];
          const getHeader = (n: string) =>
            (headers.find((h: any) => (h.name || '').toLowerCase() === n.toLowerCase()) || {})
              .value || null;
          const fromHeader: string = getHeader('From') || '';
          const fromEmail = extractEmail(fromHeader);

          let projectHint: string | null = null;
          if (fromEmail) {
            const slugs = contactsByEmail.get(fromEmail.toLowerCase());
            if (slugs && slugs.length === 1) projectHint = slugs[0];
          }

          const body = extractBodyText(msg.data.payload);
          const attachmentRefs = extractAttachmentRefs(msg.data.payload);

          await rawItemsRef(db).doc(docId).create({
            source: 'gmail',
            sourceRef: msgId,
            sourceMeta: {
              threadId: msg.data.threadId || null,
              fromEmail: fromEmail || null,
              fromName: fromHeader || null,
              subject: getHeader('Subject'),
              date: getHeader('Date'),
              label: SPIKE_LABEL,
              snippet: msg.data.snippet || null,
            },
            projectHint,
            content: body,
            contentMime: 'text/plain',
            attachmentRefs,
            ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
            ingestedByUid: req.user.uid,
            processedAt: null,
            processedItemId: null,
          });
          newCount += 1;
        } catch (e: any) {
          // gRPC code 6 = ALREADY_EXISTS — treat as skip, not error.
          if (e?.code === 6 || /already exists/i.test(String(e?.message))) {
            skippedCount += 1;
          } else {
            console.error(`[ingest/gmail] message ${msgId} failed:`, e?.message || e);
            errors.push(`${msgId}: ${e?.message || 'unknown'}`);
          }
        }
      }

      await configRef(db).set(
        { lastGmailIngestAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      res.json({
        ok: true,
        labelMessages: messageIds.length,
        new: newCount,
        skipped: skippedCount,
        errors,
      });
    } catch (e: any) {
      console.error('[ingest/gmail] failed:', e);
      res.status(500).json({ error: e?.message || 'unknown' });
    }
  });
}

// "Tyler <tyler@skyelinehomes.com>" → "tyler@skyelinehomes.com"
function extractEmail(rawFrom: string): string {
  const angle = rawFrom.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  const bare = rawFrom.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return bare ? bare[0] : '';
}

// Walk the MIME tree, prefer text/plain, fall back to stripped text/html.
function extractBodyText(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts && payload.parts.length) {
    const texts: string[] = [];
    for (const part of payload.parts) {
      const t = extractBodyText(part);
      if (t) texts.push(t);
    }
    if (texts.length) return texts.join('\n\n');
    const html = extractByMime(payload, 'text/html');
    if (html) return stripHtml(html);
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }
  return '';
}

function extractByMime(payload: any, mime: string): string {
  if (!payload) return '';
  if (payload.mimeType === mime && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const t = extractByMime(part, mime);
    if (t) return t;
  }
  return '';
}

function decodeBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAttachmentRefs(
  payload: any,
): Array<{ filename: string; mime: string; size: number }> {
  const refs: Array<{ filename: string; mime: string; size: number }> = [];
  function walk(p: any) {
    if (!p) return;
    if (p.filename && p.filename.length > 0) {
      refs.push({
        filename: p.filename,
        mime: p.mimeType || 'application/octet-stream',
        size: p.body?.size || 0,
      });
    }
    for (const child of p.parts || []) walk(child);
  }
  walk(payload);
  return refs;
}

function urlSafe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}
