// Google Drive ingester for the Ingestion Lab.
//
// POST /api/ingestionLab/ingest/drive — admin-only. For each of the two
// hardcoded project folders (Giboney + Christensen), recursively lists files
// (capped depth + count for safety), extracts content per mime type, and
// writes each to ingestion_lab/data/raw_items with deterministic doc ID
// drive__{fileId}. Idempotent — re-runs skip already-ingested files.
//
// Content extraction policy this session:
//   - Google Docs              → text/plain via Drive export
//   - Google Sheets            → CSV via Drive export
//   - Google Slides            → text/plain via Drive export
//   - PDFs                     → text via pdf-parse
//   - Plain text variants      → as-is
//   - Images                   → ref only, no OCR (deferred)
//   - Files > 25MB             → ref only with a "too large" marker
//   - Anything else            → ref only

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
import { PDFParse } from 'pdf-parse';
import { adminOnly } from './adminAuth';
import { getAuthorizedClient } from './googleClient';

// Two real projects, fixed folder IDs. Do NOT generalize this to a
// projects registry — when we productize, we refactor then.
const PROJECT_FOLDERS: Record<string, string> = {
  giboney: '1AR5kio4_DAmUFMMxW0xvuRxlMp_axuz6',
  christensen: '1204VUtL4jOp28bksBcacQDaW_XnrLpaf',
};

const MAX_FILES_PER_PROJECT = 500;
const MAX_RECURSION_DEPTH = 5;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

function rawItemsRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('raw_items');
}
function configRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('config');
}

export function registerDriveIngester(app: Express, db: FirebaseFirestore.Firestore): void {
  app.post('/api/ingestionLab/ingest/drive', adminOnly, async (req: any, res: any) => {
    try {
      const auth = await getAuthorizedClient(db, 'drive');
      const drive = google.drive({ version: 'v3', auth: auth as any });

      let newCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      const perProject: Record<string, { listed: number; new: number; skipped: number }> = {};

      for (const slug of Object.keys(PROJECT_FOLDERS)) {
        const folderId = PROJECT_FOLDERS[slug];
        const files = await listFilesRecursively(
          drive,
          folderId,
          MAX_RECURSION_DEPTH,
          MAX_FILES_PER_PROJECT,
        );
        perProject[slug] = { listed: files.length, new: 0, skipped: 0 };

        for (const file of files) {
          try {
            const docId = `drive__${urlSafe(file.id!)}`;
            const existingDoc = await rawItemsRef(db).doc(docId).get();
            if (existingDoc.exists) {
              skippedCount += 1;
              perProject[slug].skipped += 1;
              continue;
            }

            const { content, contentMime } = await extractContent(drive, file);

            await rawItemsRef(db).doc(docId).create({
              source: 'drive',
              sourceRef: file.id,
              sourceMeta: {
                folderId,
                fileName: file.name || null,
                mimeType: file.mimeType || null,
                modifiedTime: file.modifiedTime || null,
                size: file.size ? Number(file.size) : null,
                webViewLink: file.webViewLink || null,
                pathBreadcrumb: file._pathBreadcrumb || null,
              },
              projectHint: slug,
              content,
              contentMime,
              attachmentRefs: [],
              ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
              ingestedByUid: req.user.uid,
              processedAt: null,
              processedItemId: null,
            });
            newCount += 1;
            perProject[slug].new += 1;
          } catch (e: any) {
            if (e?.code === 6 || /already exists/i.test(String(e?.message))) {
              skippedCount += 1;
              perProject[slug].skipped += 1;
            } else {
              console.error(
                `[ingest/drive] file ${file.id} (${file.name}) failed:`,
                e?.message || e,
              );
              errors.push(`${file.id} (${file.name}): ${e?.message || 'unknown'}`);
            }
          }
        }
      }

      await configRef(db).set(
        { lastDriveIngestAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
      );

      res.json({ ok: true, new: newCount, skipped: skippedCount, perProject, errors });
    } catch (e: any) {
      console.error('[ingest/drive] failed:', e);
      res.status(500).json({ error: e?.message || 'unknown' });
    }
  });
}

async function listFilesRecursively(
  drive: any,
  rootFolderId: string,
  maxDepth: number,
  maxFiles: number,
): Promise<any[]> {
  const files: any[] = [];
  const queue: Array<{ folderId: string; depth: number; path: string }> = [
    { folderId: rootFolderId, depth: 0, path: '/' },
  ];

  while (queue.length > 0 && files.length < maxFiles) {
    const { folderId, depth, path } = queue.shift()!;
    let pageToken: string | undefined = undefined;
    do {
      const r: any = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields:
          'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)',
        pageSize: 100,
        pageToken,
      });
      for (const f of r.data.files || []) {
        f._pathBreadcrumb = path;
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (depth + 1 <= maxDepth) {
            queue.push({ folderId: f.id, depth: depth + 1, path: `${path}${f.name}/` });
          }
        } else {
          files.push(f);
          if (files.length >= maxFiles) break;
        }
      }
      pageToken = r.data.nextPageToken || undefined;
    } while (pageToken && files.length < maxFiles);
  }
  return files;
}

async function extractContent(
  drive: any,
  file: any,
): Promise<{ content: string; contentMime: string }> {
  const mime = file.mimeType || 'application/octet-stream';
  const size = file.size ? Number(file.size) : 0;

  // Google-native docs — export through Drive.
  if (mime === 'application/vnd.google-apps.document') {
    const r: any = await drive.files.export(
      { fileId: file.id, mimeType: 'text/plain' },
      { responseType: 'text' },
    );
    return { content: String(r.data || ''), contentMime: 'text/plain' };
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    const r: any = await drive.files.export(
      { fileId: file.id, mimeType: 'text/csv' },
      { responseType: 'text' },
    );
    return { content: String(r.data || ''), contentMime: 'text/csv' };
  }
  if (mime === 'application/vnd.google-apps.presentation') {
    const r: any = await drive.files.export(
      { fileId: file.id, mimeType: 'text/plain' },
      { responseType: 'text' },
    );
    return { content: String(r.data || ''), contentMime: 'text/plain' };
  }

  // Images — refs only this session (no OCR).
  if (mime.startsWith('image/')) {
    return {
      content: `[image: ${file.name}, ${mime}, ${size} bytes — ref only, no OCR this session]`,
      contentMime: 'text/plain',
    };
  }

  // Size cap before downloading bytes.
  if (size > MAX_DOWNLOAD_BYTES) {
    return {
      content: `[file too large to ingest: ${file.name}, ${size} bytes (limit ${MAX_DOWNLOAD_BYTES}) — skipped]`,
      contentMime: 'text/plain',
    };
  }

  // PDFs — extract text via pdf-parse v2.
  if (mime === 'application/pdf') {
    const r: any = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'arraybuffer' },
    );
    const buf = Buffer.from(r.data as ArrayBuffer);
    try {
      const parser = new PDFParse({ data: buf });
      const out = await parser.getText();
      await parser.destroy();
      return { content: String(out.text || ''), contentMime: 'text/plain' };
    } catch (e: any) {
      return {
        content: `[pdf parse failed for ${file.name}: ${e?.message || 'unknown'}]`,
        contentMime: 'text/plain',
      };
    }
  }

  // Plain text variants — download as text.
  if (mime.startsWith('text/')) {
    const r: any = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'text' },
    );
    return { content: String(r.data || ''), contentMime: mime };
  }

  // Anything else — store a ref-only marker.
  return {
    content: `[unsupported mime: ${mime} — ${file.name} stored as ref only]`,
    contentMime: 'text/plain',
  };
}

function urlSafe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}
