// pdfExtractor.ts — Deterministic PDF text extraction for AP invoices.
//
// Uses pdf-parse (text layer extraction — NO AI, NO vision API).
// Falls back to null values when text is not parseable so the caller
// can decide whether to escalate to Claude vision.
//
// Exported function:
//   extractInvoiceFromPdf(buffer, mimeType) → PdfExtraction | null

import type * as adminNS from 'firebase-admin';

// pdf-parse v2 API
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');

export interface PdfExtraction {
  vendor: string | null;
  amount: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  invoiceNumber: string | null;
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
  method: 'text-layer'; // always text-layer for this extractor
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanNum(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, '').trim());
  return isNaN(n) || n <= 0 ? null : n;
}

/** Parse date strings like 09/09/2026, Sep 9 2026, 2026-09-09, etc. */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  raw = raw.trim();

  // YYYY-MM-DD
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2,'0')}-${String(iso[3]).padStart(2,'0')}`;

  // MM/DD/YYYY or M/D/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${String(mdy[1]).padStart(2,'0')}-${String(mdy[2]).padStart(2,'0')}`;

  // Month DD, YYYY  or  DD Month YYYY
  const months: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };
  const longMdy = raw.match(/([A-Za-z]{3,9})\s+(\d{1,2})[,\s]+(\d{4})/);
  if (longMdy) {
    const m = months[longMdy[1].toLowerCase().slice(0,3)];
    if (m) return `${longMdy[3]}-${m}-${String(longMdy[2]).padStart(2,'0')}`;
  }
  const longDmy = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})[,\s]+(\d{4})/);
  if (longDmy) {
    const m = months[longDmy[2].toLowerCase().slice(0,3)];
    if (m) return `${longDmy[3]}-${m}-${String(longDmy[1]).padStart(2,'0')}`;
  }

  return null;
}

/**
 * Extract the largest plausible dollar amount from a text block.
 * Prefers labeled totals (Total Due, Balance Due, etc.) over raw dollar values.
 */
function extractAmount(text: string): number | null {
  // Priority 1: labelled total lines
  const totalLabels = [
    /(?:total\s+(?:amount\s+)?due|amount\s+due|balance\s+due|total\s+due|grand\s+total|invoice\s+total|total\s+owing|amount\s+owing|net\s+total|total\s+payable)[^\d$]*\$?\s*([\d,]+\.?\d{0,2})/gi,
    /(?:please\s+(?:pay|remit))[^\d$]*\$?\s*([\d,]+\.?\d{0,2})/gi,
    /(?:^|\n)\s*total\s*:?\s*\$?\s*([\d,]+\.\d{2})/gim,
  ];

  for (const re of totalLabels) {
    const matches = [...text.matchAll(re)];
    for (const m of matches) {
      const n = cleanNum(m[1]);
      if (n && n > 0.01 && n < 10_000_000) return n;
    }
  }

  // Priority 2: largest dollar amount on the page (avoids line-item noise)
  const allDollars = [...text.matchAll(/\$\s*([\d,]+\.\d{2})/g)]
    .map(m => cleanNum(m[1]))
    .filter((n): n is number => n !== null && n > 0.01 && n < 10_000_000);

  if (allDollars.length === 0) return null;
  // Return the largest single dollar value — usually the total
  return Math.max(...allDollars);
}

function extractVendor(text: string): string | null {
  // First non-empty line that isn't "INVOICE" / "Bill To" / numeric
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 8)) {
    if (/^invoice$/i.test(line)) continue;
    if (/^(bill\s*to|ship\s*to|from:|to:)/i.test(line)) continue;
    if (/^\d/.test(line)) continue;
    if (line.length < 3 || line.length > 80) continue;
    return line;
  }
  return null;
}

function extractDate(text: string, label: RegExp): string | null {
  const m = text.match(label);
  if (!m) return null;
  // Grab up to 20 chars after the label
  const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 25).trim();
  // Take first date-like token
  const token = after.match(/[\d\/\-]+[\s,]*[\d\w\/\-,]*/)?.[0] || after.split(/\s{2,}/)[0];
  return parseDate(token);
}

function extractInvoiceNumber(text: string): string | null {
  const m = text.match(/(?:invoice\s*(?:no\.?|number|#|num\.?))[:\s#]*([\w\-]+)/i);
  return m ? m[1].trim() : null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Extract invoice fields from a PDF buffer using the text layer only.
 * No AI calls. Returns null if the PDF has no usable text.
 */
export async function extractInvoiceFromPdf(
  buffer: Buffer,
  mimeType = 'application/pdf',
): Promise<PdfExtraction | null> {
  if (mimeType !== 'application/pdf') return null;

  let rawText = '';
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    rawText = (result.text || '').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }

  if (rawText.trim().length < 30) return null; // image-only PDF

  const amount      = extractAmount(rawText);
  const vendor      = extractVendor(rawText);
  const invoiceDate = extractDate(rawText, /(?:invoice\s*date|date\s*(?:of\s*invoice)?|issued)[:\s]*/i)
                   || extractDate(rawText, /(?:^|\n)\s*date[:\s]*/im);
  const dueDate     = extractDate(rawText, /(?:due\s*date|payment\s*due|pay\s*by|due\s*by)[:\s]*/i);
  const invoiceNo   = extractInvoiceNumber(rawText);

  // Confidence: high when we got amount + at least one date; medium when amount only; low otherwise
  const confidence: 'high' | 'medium' | 'low' =
    amount && (invoiceDate || dueDate) ? 'high'
    : amount ? 'medium'
    : 'low';

  return {
    vendor,
    amount,
    invoiceDate,
    dueDate,
    invoiceNumber: invoiceNo,
    rawText: rawText.slice(0, 2000),
    confidence,
    method: 'text-layer',
  };
}

/**
 * Download a file from Firebase Storage and extract invoice data.
 * Returns null if file is missing or is an image-only PDF.
 */
export async function extractInvoiceFromStoragePath(
  storagePath: string,
  storage: adminNS.storage.Storage,
): Promise<PdfExtraction | null> {
  try {
    const bucket = storage.bucket('skyelineos.firebasestorage.app');
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) return null;

    const [buffer] = await file.download();
    const [meta] = await file.getMetadata();
    const mime = (meta.contentType as string) || 'application/pdf';

    return extractInvoiceFromPdf(buffer, mime);
  } catch {
    return null;
  }
}
