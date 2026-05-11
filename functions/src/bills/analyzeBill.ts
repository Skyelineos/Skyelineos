// AI Bill OCR — uses Claude Sonnet vision to extract vendor invoice data.
// Callable function: client passes a Firebase Storage path; function downloads
// the file, sends it to Claude, returns structured JSON the frontend uses to
// pre-fill a bill review form.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';

if (!admin.apps.length) admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

interface AnalyzeBillRequest {
  storagePath: string;   // e.g. "bills/2026-05/invoice-1234.jpg"
  mimeType?: string;     // 'image/jpeg' | 'image/png' | 'application/pdf'
}

interface BillExtraction {
  vendor: string | null;
  vendorAddress: string | null;
  vendorPhone: string | null;
  invoiceNumber: string | null;
  billDate: string | null;       // YYYY-MM-DD
  dueDate: string | null;        // YYYY-MM-DD
  amount: number | null;
  subtotal: number | null;
  tax: number | null;
  description: string | null;    // 1-line summary of what the bill is for
  category: string | null;       // 'materials' | 'labor' | 'equipment' | 'fees' | 'subcontractor' | 'other'
  projectReference: string | null; // any visible project name / PO / job name
  lineItems: Array<{ description: string; qty?: number; unitCost?: number; amount: number }>;
  paymentTerms: string | null;   // e.g. "Net 30", "Due on receipt"
  rawText: string;               // raw OCR text for fallback display
  confidence: 'high' | 'medium' | 'low';
}

const SYSTEM_PROMPT = `You are an expert at extracting structured data from construction industry vendor bills, invoices, and receipts.

You will receive an image (photo or scan) of a bill. Extract the data into the provided JSON schema.

Rules:
- For dates, return YYYY-MM-DD format. If the year isn't visible, infer the most likely year based on context (current year if ambiguous).
- For amounts, return numbers only (no $ or commas). Decimals OK.
- For category, pick the closest match from: materials, labor, equipment, fees, subcontractor, other.
- For projectReference, look for any "P.O. Number", "Job", "Project", "Reference" field, or addressed-to line that names a project.
- If a field isn't visible or ambiguous, return null. Don't guess.
- For lineItems, only include rows with a clear description and amount. Skip subtotals, tax, total rows.
- For confidence: "high" if image is clear and most fields confident; "medium" if some ambiguity; "low" if image is blurry or partially obscured.
- Return ONLY valid JSON matching the schema. No prose, no markdown.`;

const SCHEMA_HINT = `{
  "vendor": "string or null",
  "vendorAddress": "string or null",
  "vendorPhone": "string or null",
  "invoiceNumber": "string or null",
  "billDate": "YYYY-MM-DD or null",
  "dueDate": "YYYY-MM-DD or null",
  "amount": "number or null",
  "subtotal": "number or null",
  "tax": "number or null",
  "description": "string or null",
  "category": "materials|labor|equipment|fees|subcontractor|other or null",
  "projectReference": "string or null",
  "lineItems": [{"description": "string", "qty": "number or null", "unitCost": "number or null", "amount": "number"}],
  "paymentTerms": "string or null",
  "rawText": "string (raw OCR text)",
  "confidence": "high|medium|low"
}`;

export const analyzeBill = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    cors: true,
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async (request): Promise<{ extraction: BillExtraction }> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in');
    }

    const { storagePath, mimeType } = request.data as AnalyzeBillRequest;
    if (!storagePath) {
      throw new HttpsError('invalid-argument', 'storagePath is required');
    }

    // Download the file from Firebase Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('not-found', `File not found at ${storagePath}`);
    }
    const [buffer] = await file.download();
    const [metadata] = await file.getMetadata();
    const detectedMime = mimeType || metadata.contentType || 'image/jpeg';

    // Anthropic vision currently supports image/jpeg, image/png, image/gif, image/webp,
    // and application/pdf (multimodal documents). Convert mime type if needed.
    const supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const isPdf = detectedMime === 'application/pdf';
    const isImage = supportedImageTypes.includes(detectedMime);
    if (!isPdf && !isImage) {
      throw new HttpsError('invalid-argument', `Unsupported mime type: ${detectedMime}`);
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    // Build the message with the document attached
    const userContent: any[] = [
      {
        type: 'text',
        text: `Extract the bill data from the attached document into this exact JSON schema:\n\n${SCHEMA_HINT}\n\nReturn only the JSON, nothing else.`,
      },
      {
        type: isPdf ? 'document' : 'image',
        source: {
          type: 'base64',
          media_type: detectedMime,
          data: buffer.toString('base64'),
        },
      },
    ];

    let extraction: BillExtraction;
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const textBlock = response.content.find((b: any) => b.type === 'text') as any;
      if (!textBlock) throw new Error('No text response from Claude');

      // Strip markdown fences if Claude added them
      let raw = textBlock.text.trim();
      if (raw.startsWith('```')) {
        raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      extraction = JSON.parse(raw);
    } catch (e: any) {
      console.error('[analyzeBill] extraction error:', e);
      throw new HttpsError('internal', `OCR extraction failed: ${e.message}`);
    }

    // Sanity: ensure required shape
    if (typeof extraction !== 'object' || extraction === null) {
      throw new HttpsError('internal', 'Claude returned non-object');
    }
    if (!Array.isArray(extraction.lineItems)) extraction.lineItems = [];

    return { extraction };
  },
);
