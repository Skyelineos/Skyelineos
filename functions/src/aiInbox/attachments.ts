// AI Inbox — attachment handling.
//
// Decodes base64 attachments forwarded from Gmail (invoice PDFs, receipt
// images), stores them to Cloud Storage so they're viewable in the portal, and
// returns the subset Claude can read (PDF + images) as content blocks.
//
// Storage path: ai_inbox/{itemId}/{filename}. We attach a Firebase download
// token so the admin UI can open the file with a stable URL. The AI Inbox page
// is admin-only and the token is unguessable; we deliberately don't make these
// public. Best-effort: if Storage write fails, ingestion still proceeds (Claude
// already got the bytes) — viewing is a nice-to-have, extraction is the point.

import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { ClaudeAttachment } from './extractionPrompt';

// Claude's practical limits — keep payloads sane.
const MAX_CLAUDE_PDF_BYTES = 25 * 1024 * 1024;   // 25 MB
const MAX_CLAUDE_IMAGE_BYTES = 5 * 1024 * 1024;  // 5 MB
const MAX_TOTAL_CLAUDE_BYTES = 28 * 1024 * 1024; // total across all attachments
const MAX_STORE_BYTES = 25 * 1024 * 1024;        // per-file cap for Storage
const MAX_ATTACHMENTS = 10;

const CLAUDE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export interface StoredAttachment {
  filename: string;
  mimeType: string;
  size: number;
  url: string | null;       // viewable download URL, or null if not stored
  sentToClaude: boolean;    // did the model actually read this one?
}

function safeName(name: string): string {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

function mimeOf(att: any, filename: string): string {
  const m = att.mimeType || att.contentType || att.type || '';
  if (m) return String(m).toLowerCase();
  // Infer from extension when the caller doesn't send a mime.
  const ext = filename.toLowerCase().split('.').pop() || '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'application/octet-stream';
}

// Process the raw attachments array from the request body. Returns the Claude-
// ready blocks plus per-file stored metadata to persist on the item.
export async function processAttachments(
  itemId: string,
  rawAttachments: any[],
): Promise<{ claudeAttachments: ClaudeAttachment[]; stored: StoredAttachment[] }> {
  const claudeAttachments: ClaudeAttachment[] = [];
  const stored: StoredAttachment[] = [];
  let claudeTotal = 0;

  const list = Array.isArray(rawAttachments) ? rawAttachments.slice(0, MAX_ATTACHMENTS) : [];

  for (const att of list) {
    const filename = safeName(att.filename || att.name || 'attachment');
    const mimeType = mimeOf(att, filename);
    const b64: string | undefined = att.content || att.data || att.base64;

    // No bytes (metadata only) — record it, nothing to store/read.
    if (!b64 || typeof b64 !== 'string') {
      stored.push({ filename, mimeType, size: Number(att.size) || 0, url: null, sentToClaude: false });
      continue;
    }

    let buffer: Buffer;
    try {
      // Tolerate a data: URI prefix if the caller includes one.
      const clean = b64.includes(',') && b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
      buffer = Buffer.from(clean, 'base64');
    } catch {
      stored.push({ filename, mimeType, size: 0, url: null, sentToClaude: false });
      continue;
    }
    const size = buffer.length;

    // Store to Cloud Storage (best-effort).
    let url: string | null = null;
    if (size > 0 && size <= MAX_STORE_BYTES) {
      try {
        url = await storeToBucket(itemId, filename, mimeType, buffer);
      } catch (e: any) {
        console.error('[ai-inbox/attachments] storage write failed:', e?.message || e);
      }
    }

    // Decide whether Claude reads it.
    let sentToClaude = false;
    const isPdf = mimeType === 'application/pdf';
    const isImg = CLAUDE_IMAGE_TYPES.has(mimeType);
    const perFileCap = isPdf ? MAX_CLAUDE_PDF_BYTES : MAX_CLAUDE_IMAGE_BYTES;
    if ((isPdf || isImg) && size > 0 && size <= perFileCap && claudeTotal + size <= MAX_TOTAL_CLAUDE_BYTES) {
      claudeAttachments.push({ filename, mediaType: mimeType, data: buffer.toString('base64') });
      claudeTotal += size;
      sentToClaude = true;
    }

    stored.push({ filename, mimeType, size, url, sentToClaude });
  }

  return { claudeAttachments, stored };
}

// Re-fetch already-stored PDF/image attachments from their Storage URLs so a
// /reprocess pass can re-feed them to Claude (the base64 isn't kept in
// Firestore — only the viewable URL is). Best-effort; skips anything it can't
// fetch or that's too large.
export async function rehydrateAttachments(stored: any[]): Promise<ClaudeAttachment[]> {
  const out: ClaudeAttachment[] = [];
  let total = 0;
  for (const a of Array.isArray(stored) ? stored : []) {
    const mime = String(a?.mimeType || '').toLowerCase();
    const isPdf = mime === 'application/pdf';
    const isImg = CLAUDE_IMAGE_TYPES.has(mime);
    if (!a?.url || (!isPdf && !isImg)) continue;
    try {
      const r = await fetch(a.url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const perCap = isPdf ? MAX_CLAUDE_PDF_BYTES : MAX_CLAUDE_IMAGE_BYTES;
      if (buf.length > perCap || total + buf.length > MAX_TOTAL_CLAUDE_BYTES) continue;
      out.push({ filename: String(a.filename || 'file'), mediaType: mime, data: buf.toString('base64') });
      total += buf.length;
    } catch {
      // skip unfetchable attachment
    }
  }
  return out;
}

async function storeToBucket(
  itemId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const bucket = admin.storage().bucket();
  const path = `ai_inbox/${itemId}/${filename}`;
  const file = bucket.file(path);
  const token = crypto.randomUUID();
  await file.save(buffer, {
    contentType: mimeType,
    resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
