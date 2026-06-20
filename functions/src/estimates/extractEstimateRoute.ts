// Claude vision extraction for subcontractor estimates / quotes.
//
// Mirrors /api/analyze-bill (bills/analyzeBill.ts) — same Anthropic vision call,
// same secret (ANTHROPIC_API_KEY), same base64-encoded document flow. Just a
// different prompt + JSON schema tuned for subcontractor quotes.
//
// Routed through the api Express app (registered after `app.use('/api',
// authMiddleware)`) so callers need a valid Firebase ID token. Tyler's already
// signed in, so this just works.
//
// Schema returns per-row trade (so multi-trade quotes still group correctly in
// the EstimateBuilder), an optional materials/labor split when the quote shows
// it, and an optional markup_pct. The mapper on the client sums materials+labor
// for unitCost when both are present, falls back to unit_cost otherwise.

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
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [{
              type: 'text',
              text: `Extract estimate data from this email body into this exact JSON schema:\n\n${SCHEMA_HINT}\n\nEmail body:\n\n${text}\n\nReturn only the JSON.`,
            }],
          }],
        });
        const extraction = parseAndNormalize(response);
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
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const extraction = parseAndNormalize(response);
      return res.json({ extraction });
    } catch (e: any) {
      console.error('[extract-estimate] error:', e);
      // Even on parse failure return a usable shape so the client can attach
      // the PDF + add rows manually. Only hard-fail on infra errors.
      return res.status(500).json({ error: e.message || String(e) });
    }
  });
}

const SYSTEM_PROMPT = `You are extracting estimate / quote information from a subcontractor's quote document.

Rules:
- Return JSON matching the schema EXACTLY. Numbers only (no $, no commas, no units in number fields).
- vendor_name: the subcontractor / vendor issuing the quote, or null.
- default_trade: the document's primary trade (e.g. "Electrical", "Plumbing", "Framing", "HVAC", "Concrete", "Roofing", "Drywall", "Painting", "Flooring", "Cabinetry", "Tile", "Landscaping"). Use the cover/header trade. Null if unknown.
- notes: a one-line summary of anything important the contractor should see (exclusions, warranty, payment terms, valid-until date). Null if nothing notable.
- line_items: an array. ONLY include actual scope rows — skip subtotal, tax, discount, contingency, and total rows.
- For each line item:
  * trade: per-row trade label when the document is multi-trade (use the section header it appears under, e.g. a Plumbing section row has trade "Plumbing"). If the row matches the document's overall trade or the section is unclear, return null and the client will fall back to default_trade.
  * description: short scope summary for the row (string, required).
  * qty: quantity as a number, or null when lump-sum.
  * unit: unit of measure (sqft, lf, ea, hr, lump sum, etc.) or null.
  * unit_materials_cost: per-unit materials cost ONLY when the quote separates materials and labor for that row. Otherwise null.
  * unit_labor_cost: per-unit labor cost ONLY when the quote separates materials and labor for that row. Otherwise null.
  * unit_cost: per-unit total cost. Populate when materials/labor are NOT separately shown. If materials+labor split is shown, you may still populate unit_cost as their sum, but it is optional.
  * markup_pct: per-row markup percentage as a plain number (e.g. 20 for "20%", 20 for "1.20x"). Null when not shown — do not guess.
  * total: extended total for the row as a number. Prefer the document's printed total; if absent, leave null and the client will compute qty * unit_cost.
- If the document has no parseable line items at all, return line_items: [] and put a brief explanation in notes. Do not invent rows.
- Return ONLY valid JSON. No prose, no markdown fences.`;

const SCHEMA_HINT = `{
  "vendor_name": "string or null",
  "default_trade": "string or null",
  "notes": "string or null",
  "line_items": [
    {
      "trade": "string or null",
      "description": "string",
      "qty": "number or null",
      "unit": "string or null",
      "unit_materials_cost": "number or null",
      "unit_labor_cost": "number or null",
      "unit_cost": "number or null",
      "markup_pct": "number or null",
      "total": "number or null"
    }
  ]
}`;

// Parse Claude's response and normalize to the documented shape. On any parse
// failure return a safe placeholder so the client can still attach the PDF and
// let Tyler add rows manually — better than blowing up the import.
function parseAndNormalize(response: any): any {
  const fallback = {
    vendor_name: null,
    default_trade: null,
    notes: 'Could not parse rows automatically — please add manually',
    line_items: [],
  };

  try {
    const textBlock = response.content.find((b: any) => b.type === 'text');
    if (!textBlock) return fallback;

    let raw = String(textBlock.text || '').trim();
    if (raw.startsWith('```')) {
      raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);

    // Tolerate legacy `trade` key from the old schema.
    const default_trade =
      typeof parsed.default_trade === 'string' && parsed.default_trade.trim()
        ? parsed.default_trade.trim()
        : typeof parsed.trade === 'string' && parsed.trade.trim()
          ? parsed.trade.trim()
          : null;

    const vendor_name =
      typeof parsed.vendor_name === 'string' && parsed.vendor_name.trim()
        ? parsed.vendor_name.trim()
        : null;

    const notes =
      typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : null;

    const rawItems = Array.isArray(parsed.line_items) ? parsed.line_items : [];
    const line_items = rawItems
      .filter((it: any) => it && typeof it === 'object')
      .map((it: any) => ({
        trade:
          typeof it.trade === 'string' && it.trade.trim() ? it.trade.trim() : null,
        description:
          typeof it.description === 'string' ? it.description.trim() : '',
        qty: numOrNull(it.qty),
        unit: typeof it.unit === 'string' && it.unit.trim() ? it.unit.trim() : null,
        unit_materials_cost: numOrNull(it.unit_materials_cost),
        unit_labor_cost: numOrNull(it.unit_labor_cost),
        unit_cost: numOrNull(it.unit_cost),
        markup_pct: numOrNull(it.markup_pct),
        total: numOrNull(it.total),
      }))
      // A row with no description AND no money is useless — drop it.
      .filter(
        (it: any) =>
          it.description ||
          it.unit_cost != null ||
          it.unit_materials_cost != null ||
          it.unit_labor_cost != null ||
          it.total != null,
      );

    if (!line_items.length) {
      return {
        vendor_name,
        default_trade,
        notes: notes || 'Could not parse rows automatically — please add manually',
        line_items: [],
      };
    }

    return { vendor_name, default_trade, notes, line_items };
  } catch (err) {
    console.warn('[extract-estimate] parse failed, returning placeholder:', err);
    return fallback;
  }
}

function numOrNull(v: any): number | null {
  if (v == null || v === '') return null;
  // Strip $ and commas just in case the model slipped.
  const cleaned = typeof v === 'string' ? v.replace(/[$,\s]/g, '') : v;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
