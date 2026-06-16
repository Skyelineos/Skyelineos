// Claude vision extraction for subcontractor estimates / quotes.
//
// Mirrors /api/analyze-bill (bills/analyzeBill.ts) — same Anthropic vision call,
// same secret (ANTHROPIC_API_KEY), same base64-encoded document flow. Just a
// different prompt + JSON schema tuned for subcontractor quotes.
//
// Routed through the api Express app (registered after `app.use('/api',
// authMiddleware)`) so callers need a valid Firebase ID token. Tyler's already
// signed in, so this just works.

import * as admin from 'firebase-admin';

export function registerExtractEstimateRoute(app: any, authMiddleware: any): void {
  app.post('/api/extract-estimate', authMiddleware, async (req: any, res: any) => {
    try {
      const { storagePath, mimeType } = req.body || {};
      if (!storagePath) return res.status(400).json({ error: 'storagePath required' });

      const Anthropic = require('@anthropic-ai/sdk');
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) return res.status(404).json({ error: `File not found at ${storagePath}` });
      const [buffer] = await file.download();
      const [metadata] = await file.getMetadata();
      const detectedMime = mimeType || metadata.contentType || 'application/pdf';

      const supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const isPdf = detectedMime === 'application/pdf';
      const isImage = supportedImageTypes.includes(detectedMime);
      const isText = detectedMime === 'text/plain';

      // Text bodies: just parse from the raw text via a regular message.
      if (isText) {
        const text = buffer.toString('utf-8');
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [{
              type: 'text',
              text: `Extract estimate data from this email body into this exact JSON schema:\n\n${SCHEMA_HINT}\n\nEmail body:\n\n${text}\n\nReturn only the JSON.`,
            }],
          }],
        });
        const extraction = parseClaudeJson(response);
        return res.json({ extraction });
      }

      if (!isPdf && !isImage) {
        return res.status(400).json({ error: `Unsupported mime type: ${detectedMime}` });
      }

      const client = new Anthropic({ apiKey });
      const userContent: any[] = [
        {
          type: 'text',
          text: `Extract estimate data from the attached document into this exact JSON schema:\n\n${SCHEMA_HINT}\n\nReturn only the JSON.`,
        },
        {
          type: isPdf ? 'document' : 'image',
          source: { type: 'base64', media_type: detectedMime, data: buffer.toString('base64') },
        },
      ];

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const extraction = parseClaudeJson(response);
      return res.json({ extraction });
    } catch (e: any) {
      console.error('[extract-estimate] error:', e);
      return res.status(500).json({ error: e.message || String(e) });
    }
  });
}

const SYSTEM_PROMPT = `You are extracting estimate / quote information from a subcontractor's quote document.

Rules:
- Return JSON with: vendor_name (string|null), trade (string|null), total_amount (number|null), line_items (array of {description, qty, unit, unit_cost, total} | null), notes (string|null).
- If you cannot extract a field, return null. Do not fabricate values.
- For amounts, return numbers only (no $ or commas). Decimals OK.
- For trade, pick a plain English label like "Electrical", "Plumbing", "Framing", "HVAC", "Concrete", "Roofing", "Drywall", "Painting", "Flooring", "Cabinetry", "Tile", "Landscaping", etc. If unsure, return null.
- For total_amount, prefer the "grand total" / "final price" / "total due" — not subtotals.
- For line_items, only include rows with a clear description and amount. Skip subtotal/tax/total rows. qty / unit / unit_cost may be null when the quote is lump-sum.
- For notes, capture anything that would help the contractor (exclusions, warranty terms, payment terms, valid-until date). One-line summary preferred.
- Return ONLY valid JSON. No prose, no markdown.`;

const SCHEMA_HINT = `{
  "vendor_name": "string or null",
  "trade": "string or null",
  "total_amount": "number or null",
  "line_items": [{"description": "string", "qty": "number or null", "unit": "string or null", "unit_cost": "number or null", "total": "number or null"}] or null,
  "notes": "string or null"
}`;

function parseClaudeJson(response: any): any {
  const textBlock = response.content.find((b: any) => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude');
  let raw = textBlock.text.trim();
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  const extraction = JSON.parse(raw);
  if (extraction.line_items && !Array.isArray(extraction.line_items)) extraction.line_items = null;
  return extraction;
}
