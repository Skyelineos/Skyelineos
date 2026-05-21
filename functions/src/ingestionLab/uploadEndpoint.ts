// Ingestion Lab upload endpoint — generic JSON intake for external scripts.
//
// POST /api/ingestionLab/upload — admin-only. Accepts a batch of items from
// the future iMessage and iCloud upload scripts (and any other manual /
// off-device source). Writes each to ingestion_lab/data/raw_items with a
// deterministic doc ID `${source}__${urlSafe(sourceRef)}` — idempotent on
// (source, sourceRef), so re-running the same batch skips duplicates rather
// than creating them.
//
// Request body shape:
//   {
//     source:      'imessage' | 'icloud',
//     projectHint: 'giboney' | 'christensen' | null,
//     items: [
//       { sourceRef: string, content: string, metadata?: object,
//         attachmentRefs?: [{filename, mime, size}] },
//       ...
//     ]
//   }
//
// Auth: Firebase ID token (admin role) in the Authorization header. The
// script signs in as an admin Firebase Auth account, grabs its ID token,
// and sends it as `Authorization: Bearer <token>`.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { adminOnly } from './adminAuth';

const ALLOWED_SOURCES = new Set(['imessage', 'icloud']);
const ALLOWED_PROJECT_HINTS = new Set(['giboney', 'christensen']);
const MAX_ITEMS_PER_REQUEST = 500;
// Firestore caps individual docs at ~1MB. Leave headroom for sourceMeta,
// timestamps, attachmentRefs, etc.
const MAX_CONTENT_BYTES = 900_000;

function rawItemsRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('raw_items');
}
function configRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('config');
}

export function registerUploadEndpoint(app: Express, db: FirebaseFirestore.Firestore): void {
  app.post('/api/ingestionLab/upload', adminOnly, async (req: any, res: any) => {
    try {
      const body = req.body || {};
      const source = String(body.source || '').trim();
      const projectHint = body.projectHint ? String(body.projectHint).trim() : null;
      const items = Array.isArray(body.items) ? body.items : null;

      if (!ALLOWED_SOURCES.has(source)) {
        res.status(400).json({
          error: `source must be one of: ${Array.from(ALLOWED_SOURCES).join(', ')}`,
        });
        return;
      }
      if (projectHint && !ALLOWED_PROJECT_HINTS.has(projectHint)) {
        res.status(400).json({
          error: `projectHint must be one of: ${Array.from(ALLOWED_PROJECT_HINTS).join(', ')} (or omitted)`,
        });
        return;
      }
      if (!items) {
        res.status(400).json({ error: 'items must be an array' });
        return;
      }
      if (items.length === 0) {
        res.json({ ok: true, received: 0, new: 0, skipped: 0, errors: [] });
        return;
      }
      if (items.length > MAX_ITEMS_PER_REQUEST) {
        res.status(400).json({
          error: `too many items in one request: ${items.length} (max ${MAX_ITEMS_PER_REQUEST}). Batch the upload.`,
        });
        return;
      }

      let newCount = 0;
      let skippedCount = 0;
      const errors: Array<{ sourceRef: string; error: string }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i] || {};
        const sourceRef = item.sourceRef ? String(item.sourceRef).trim() : '';
        const content = item.content != null ? String(item.content) : '';
        const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};

        if (!sourceRef) {
          errors.push({ sourceRef: `(index ${i})`, error: 'missing sourceRef' });
          continue;
        }
        if (Buffer.byteLength(content, 'utf-8') > MAX_CONTENT_BYTES) {
          errors.push({
            sourceRef,
            error: `content too large (${Buffer.byteLength(content, 'utf-8')} bytes, limit ${MAX_CONTENT_BYTES}). Split the item.`,
          });
          continue;
        }

        try {
          const docId = `${source}__${urlSafe(sourceRef)}`;
          await rawItemsRef(db).doc(docId).create({
            source,
            sourceRef,
            sourceMeta: metadata,
            projectHint: projectHint || null,
            content,
            contentMime:
              typeof metadata.contentMime === 'string' ? metadata.contentMime : 'text/plain',
            attachmentRefs: Array.isArray(item.attachmentRefs) ? item.attachmentRefs : [],
            ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
            ingestedByUid: req.user.uid,
            processedAt: null,
            processedItemId: null,
          });
          newCount += 1;
        } catch (e: any) {
          if (e?.code === 6 || /already exists/i.test(String(e?.message))) {
            skippedCount += 1;
          } else {
            console.error(`[ingestionLab/upload] item ${sourceRef} failed:`, e?.message || e);
            errors.push({ sourceRef, error: e?.message || 'unknown' });
          }
        }
      }

      await configRef(db).set(
        { lastUploadAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      res.json({
        ok: errors.length === 0,
        received: items.length,
        new: newCount,
        skipped: skippedCount,
        errors,
      });
    } catch (e: any) {
      console.error('[ingestionLab/upload] failed:', e);
      res.status(500).json({ error: e?.message || 'unknown' });
    }
  });
}

function urlSafe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}
