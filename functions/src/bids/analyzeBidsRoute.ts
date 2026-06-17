// Bid Leveling & Scope Check — Claude-powered bid comparison for the Tools section.
//
// Mirrors /api/extract-estimate (estimates/extractEstimateRoute.ts) and
// /api/analyze-bill (bills/analyzeBill.ts): same Anthropic call, same secret
// (ANTHROPIC_API_KEY via process.env on the shared `api` function), same
// base64-encoded document flow. Two routes, registered onto the shared Express
// `api` app (org IAM blocks new standalone Cloud Run services, so we do NOT add
// new onCall/onRequest exports — same pattern as registerExtractEstimateRoute):
//
//   POST /api/bid-compare/extract-bid
//     body: { storagePath, mimeType? }
//     -> { bid: ExtractedBid }   (one subcontractor bid PDF -> structured scope + pricing)
//
//   POST /api/bid-compare/analyze
//     body: { trade?, bids: ExtractedBid[], planStoragePaths?: string[], planMimeTypes?: string[] }
//     -> { expectedScope: PlanScope | null, comparison: BidComparison }
//        (optionally reads the plan set to derive the scope that SHOULD be bid,
//         then levels every bid against it and recommends a winner)
//
// Designed so the SAME extraction can later be triggered automatically from a
// bid request: feed the submitted bid PDFs' storagePaths into extract-bid, then
// analyze. Nothing here is Tools-only.

import * as admin from 'firebase-admin';

const MODEL = 'claude-sonnet-4-6';

// Anthropic's PDF/document support + the image types we accept.
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Cap how many plan files we'll feed Claude in one analyze call — large plan
// sets blow the token budget and the api function's memory. The UI should
// upload only the trade-relevant sheets.
const MAX_PLAN_FILES = 6;

export function registerBidCompareRoutes(app: any, authMiddleware: any): void {
  // ── 1. Extract one subcontractor bid PDF into structured scope + pricing ──
  app.post('/api/bid-compare/extract-bid', authMiddleware, async (req: any, res: any) => {
    try {
      const { storagePath, mimeType } = req.body || {};
      if (!storagePath) return res.status(400).json({ error: 'storagePath required' });

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const { buffer, detectedMime } = await downloadFromStorage(storagePath, mimeType);
      const isPdf = detectedMime === 'application/pdf';
      const isImage = SUPPORTED_IMAGE_TYPES.includes(detectedMime);
      const isText = detectedMime === 'text/plain';

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      let userContent: any[];
      if (isText) {
        userContent = [{
          type: 'text',
          text: `Extract the subcontractor bid below into this exact JSON schema:\n\n${BID_SCHEMA_HINT}\n\nBid text:\n\n${buffer.toString('utf-8')}\n\nReturn only the JSON.`,
        }];
      } else if (isPdf || isImage) {
        userContent = [
          {
            type: 'text',
            text: `Extract the attached subcontractor bid into this exact JSON schema:\n\n${BID_SCHEMA_HINT}\n\nReturn only the JSON.`,
          },
          {
            type: isPdf ? 'document' : 'image',
            source: { type: 'base64', media_type: detectedMime, data: buffer.toString('base64') },
          },
        ];
      } else {
        return res.status(400).json({ error: `Unsupported mime type: ${detectedMime}` });
      }

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: BID_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const bid = normalizeBid(parseJson(response));
      return res.json({ bid });
    } catch (e: any) {
      console.error('[bid-compare/extract-bid] error:', e);
      return res.status(500).json({ error: e.message || String(e) });
    }
  });

  // ── 2. Level all bids against (optional) plan scope + recommend a winner ──
  app.post('/api/bid-compare/analyze', authMiddleware, async (req: any, res: any) => {
    try {
      const { trade, bids, planStoragePaths, planMimeTypes } = req.body || {};
      if (!Array.isArray(bids) || bids.length === 0) {
        return res.status(400).json({ error: 'bids[] required (extract each bid first)' });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      // 2a. Optional: derive the expected scope from the plan set.
      let expectedScope: any = null;
      if (Array.isArray(planStoragePaths) && planStoragePaths.length > 0) {
        try {
          expectedScope = await extractPlanScope(
            client,
            planStoragePaths.slice(0, MAX_PLAN_FILES),
            Array.isArray(planMimeTypes) ? planMimeTypes : [],
            trade,
          );
        } catch (planErr: any) {
          // Plans are a bonus, not a hard requirement — never fail the whole
          // analyze just because a plan PDF couldn't be read.
          console.warn('[bid-compare/analyze] plan scope extraction failed:', planErr?.message);
          expectedScope = null;
        }
      }

      // 2b. Level the bids and recommend.
      const levelingInput = {
        trade: trade || null,
        expectedScope,
        bids,
      };
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: LEVELING_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [{
            type: 'text',
            text:
              `Level these subcontractor bids and recommend a winner. Return ONLY JSON matching this schema:\n\n${COMPARISON_SCHEMA_HINT}\n\n` +
              `INPUT (expectedScope may be null if no plans were provided):\n\n${JSON.stringify(levelingInput)}`,
          }],
        }],
      });

      const comparison = normalizeComparison(parseJson(response), bids);
      return res.json({ expectedScope, comparison });
    } catch (e: any) {
      console.error('[bid-compare/analyze] error:', e);
      return res.status(500).json({ error: e.message || String(e) });
    }
  });
}

// ── Plan scope extraction ──────────────────────────────────────────────────
async function extractPlanScope(
  client: any,
  storagePaths: string[],
  mimeTypes: string[],
  trade?: string,
): Promise<any> {
  const docs: any[] = [];
  for (let i = 0; i < storagePaths.length; i++) {
    const { buffer, detectedMime } = await downloadFromStorage(storagePaths[i], mimeTypes[i]);
    const isPdf = detectedMime === 'application/pdf';
    const isImage = SUPPORTED_IMAGE_TYPES.includes(detectedMime);
    if (!isPdf && !isImage) continue;
    docs.push({
      type: isPdf ? 'document' : 'image',
      source: { type: 'base64', media_type: detectedMime, data: buffer.toString('base64') },
    });
  }
  if (docs.length === 0) return null;

  const tradeLine = trade
    ? `Focus on scope relevant to the "${trade}" trade.`
    : 'Cover all trades visible, but keep each scope item short.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: PLAN_SCOPE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `From the attached construction plans, list the scope of work that a complete bid SHOULD cover. ${tradeLine}\n\nReturn ONLY JSON matching this schema:\n\n${PLAN_SCOPE_SCHEMA_HINT}`,
        },
        ...docs,
      ],
    }],
  });

  const parsed = parseJson(response);
  const items = Array.isArray(parsed?.scope_items) ? parsed.scope_items : [];
  return {
    trade: typeof parsed?.trade === 'string' ? parsed.trade : trade || null,
    scope_items: items
      .map((it: any) => ({
        label: typeof it?.label === 'string' ? it.label.trim() : (typeof it === 'string' ? it.trim() : ''),
        detail: typeof it?.detail === 'string' ? it.detail.trim() : null,
      }))
      .filter((it: any) => it.label),
    notes: typeof parsed?.notes === 'string' ? parsed.notes.trim() : null,
  };
}

// ── Storage helper ──────────────────────────────────────────────────────────
async function downloadFromStorage(
  storagePath: string,
  mimeType?: string,
): Promise<{ buffer: Buffer; detectedMime: string }> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new Error(`File not found at ${storagePath}`);
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const detectedMime = mimeType || metadata.contentType || 'application/pdf';
  return { buffer, detectedMime };
}

// ── JSON parsing (tolerant of markdown fences) ──────────────────────────────
function parseJson(response: any): any {
  const textBlock = response?.content?.find((b: any) => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude');
  let raw = String(textBlock.text || '').trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  if (!raw) throw new Error('Empty response from Claude');
  return JSON.parse(raw);
}

function numOrNull(v: any): number | null {
  if (v == null || v === '') return null;
  const cleaned = typeof v === 'string' ? v.replace(/[$,\s]/g, '') : v;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: any): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function strArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x.trim() : String(x ?? ''))).filter(Boolean);
}

// ── Normalizers ─────────────────────────────────────────────────────────────
function normalizeBid(parsed: any): any {
  const fallback = {
    vendor_name: null,
    trade: null,
    base_bid_total: null,
    line_items: [],
    inclusions: [],
    exclusions: [],
    assumptions: [],
    allowances: [],
    alternates: [],
    unit_prices: [],
    bid_validity: null,
    payment_terms: null,
    lead_time: null,
    notes: 'Could not parse this bid automatically — review the PDF manually.',
    confidence: 'low',
  };
  if (!parsed || typeof parsed !== 'object') return fallback;

  const line_items = (Array.isArray(parsed.line_items) ? parsed.line_items : [])
    .filter((it: any) => it && typeof it === 'object')
    .map((it: any) => ({
      description: strOrNull(it.description) || '',
      qty: numOrNull(it.qty),
      unit: strOrNull(it.unit),
      unit_cost: numOrNull(it.unit_cost),
      total: numOrNull(it.total),
      category: strOrNull(it.category),
    }))
    .filter((it: any) => it.description || it.total != null || it.unit_cost != null);

  const allowances = (Array.isArray(parsed.allowances) ? parsed.allowances : [])
    .map((a: any) => ({ description: strOrNull(a?.description) || '', amount: numOrNull(a?.amount) }))
    .filter((a: any) => a.description || a.amount != null);

  const alternates = (Array.isArray(parsed.alternates) ? parsed.alternates : [])
    .map((a: any) => ({ description: strOrNull(a?.description) || '', amount: numOrNull(a?.amount) }))
    .filter((a: any) => a.description || a.amount != null);

  const unit_prices = (Array.isArray(parsed.unit_prices) ? parsed.unit_prices : [])
    .map((u: any) => ({
      description: strOrNull(u?.description) || '',
      unit: strOrNull(u?.unit),
      price: numOrNull(u?.price),
    }))
    .filter((u: any) => u.description || u.price != null);

  const conf = strOrNull(parsed.confidence);
  return {
    vendor_name: strOrNull(parsed.vendor_name),
    trade: strOrNull(parsed.trade),
    base_bid_total: numOrNull(parsed.base_bid_total),
    line_items,
    inclusions: strArray(parsed.inclusions),
    exclusions: strArray(parsed.exclusions),
    assumptions: strArray(parsed.assumptions),
    allowances,
    alternates,
    unit_prices,
    bid_validity: strOrNull(parsed.bid_validity),
    payment_terms: strOrNull(parsed.payment_terms),
    lead_time: strOrNull(parsed.lead_time),
    notes: strOrNull(parsed.notes),
    confidence: conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'medium',
  };
}

function normalizeComparison(parsed: any, bids: any[]): any {
  const vendorNames = bids.map(
    (b, i) => strOrNull(b?.vendor_name) || `Bid ${i + 1}`,
  );
  const fallback = {
    trade: null,
    scope_items: [],
    matrix: [],
    bids_summary: vendorNames.map((v, i) => ({
      vendor: v,
      base_bid_total: numOrNull(bids[i]?.base_bid_total),
      adjusted_total: numOrNull(bids[i]?.base_bid_total),
      missing_count: 0,
      exclusions_count: Array.isArray(bids[i]?.exclusions) ? bids[i].exclusions.length : 0,
    })),
    differences: [],
    gaps: [],
    recommendation: {
      winner: null,
      runner_up: null,
      rationale: 'Automatic leveling did not return a usable result. Compare the bid cards above manually.',
      risks: [],
      price_note: null,
    },
  };
  if (!parsed || typeof parsed !== 'object') return fallback;

  const scope_items = (Array.isArray(parsed.scope_items) ? parsed.scope_items : [])
    .map((s: any) => ({
      id: strOrNull(s?.id) || strOrNull(s?.label) || '',
      label: strOrNull(s?.label) || strOrNull(s?.id) || '',
      source: ['plan', 'bid', 'both'].includes(s?.source) ? s.source : 'bid',
    }))
    .filter((s: any) => s.label);

  const matrix = (Array.isArray(parsed.matrix) ? parsed.matrix : [])
    .map((row: any) => ({
      scope_item: strOrNull(row?.scope_item) || '',
      cells: (Array.isArray(row?.cells) ? row.cells : []).map((c: any) => ({
        vendor: strOrNull(c?.vendor) || '',
        status: ['included', 'missing', 'unclear', 'excluded'].includes(c?.status) ? c.status : 'unclear',
        amount: numOrNull(c?.amount),
        note: strOrNull(c?.note),
      })),
    }))
    .filter((row: any) => row.scope_item);

  const bids_summary = (Array.isArray(parsed.bids_summary) && parsed.bids_summary.length
    ? parsed.bids_summary
    : fallback.bids_summary
  ).map((b: any) => ({
    vendor: strOrNull(b?.vendor) || '',
    base_bid_total: numOrNull(b?.base_bid_total),
    adjusted_total: numOrNull(b?.adjusted_total),
    missing_count: numOrNull(b?.missing_count) ?? 0,
    exclusions_count: numOrNull(b?.exclusions_count) ?? 0,
  }));

  const gaps = (Array.isArray(parsed.gaps) ? parsed.gaps : [])
    .map((g: any) => ({ vendor: strOrNull(g?.vendor) || '', missing: strArray(g?.missing) }))
    .filter((g: any) => g.vendor);

  const rec = parsed.recommendation || {};
  return {
    trade: strOrNull(parsed.trade),
    scope_items,
    matrix,
    bids_summary,
    differences: strArray(parsed.differences),
    gaps,
    recommendation: {
      winner: strOrNull(rec.winner),
      runner_up: strOrNull(rec.runner_up),
      rationale: strOrNull(rec.rationale) || fallback.recommendation.rationale,
      risks: strArray(rec.risks),
      price_note: strOrNull(rec.price_note),
    },
  };
}

// ── Prompts + schema hints ──────────────────────────────────────────────────
const BID_SYSTEM_PROMPT = `You are an expert construction estimator extracting a subcontractor's bid/quote into structured data so it can be leveled against competing bids.

Rules:
- Return JSON matching the schema EXACTLY. Numbers only in number fields (no $, no commas, no units).
- vendor_name: the subcontractor/company issuing the bid, or null.
- trade: the primary trade of this bid (e.g. "Electrical", "Plumbing", "Framing", "HVAC", "Concrete", "Roofing", "Drywall", "Painting", "Flooring", "Cabinetry", "Tile", "Excavation", "Landscaping"). Null if unclear.
- base_bid_total: the headline lump-sum / total bid price as a number. Null if not stated.
- line_items: ONLY real scope rows. Skip subtotal, tax, and total rows. Each: description (required), qty, unit, unit_cost, total, category.
- inclusions: bullet list of what is explicitly INCLUDED in the scope.
- exclusions: bullet list of what is explicitly EXCLUDED / "by others" / "not in contract". This is critical for leveling — capture every exclusion you see.
- assumptions: clarifications/assumptions/qualifications the bidder noted.
- allowances: {description, amount} for any stated allowances.
- alternates: {description, amount} for add/deduct alternates or options.
- unit_prices: {description, unit, price} for any unit-price schedule.
- bid_validity: how long the bid is good for / expiration (e.g. "30 days", "valid until 2026-07-01"), or null.
- payment_terms, lead_time: as stated, or null.
- notes: one short line of anything else important.
- confidence: "high" if the document is clear, "medium" if partial, "low" if hard to read.
- If you cannot find line items, return [] and explain in notes. Do not invent rows.
- Return ONLY valid JSON. No prose, no markdown fences.`;

const BID_SCHEMA_HINT = `{
  "vendor_name": "string or null",
  "trade": "string or null",
  "base_bid_total": "number or null",
  "line_items": [{"description":"string","qty":"number or null","unit":"string or null","unit_cost":"number or null","total":"number or null","category":"string or null"}],
  "inclusions": ["string"],
  "exclusions": ["string"],
  "assumptions": ["string"],
  "allowances": [{"description":"string","amount":"number or null"}],
  "alternates": [{"description":"string","amount":"number or null"}],
  "unit_prices": [{"description":"string","unit":"string or null","price":"number or null"}],
  "bid_validity": "string or null",
  "payment_terms": "string or null",
  "lead_time": "string or null",
  "notes": "string or null",
  "confidence": "high|medium|low"
}`;

const PLAN_SCOPE_SYSTEM_PROMPT = `You are a senior construction estimator reading architectural / structural / MEP plans. Your job is to list the scope of work a COMPLETE subcontractor bid should cover for the requested trade, so we can check each bid for missing scope.

Rules:
- Produce a concise checklist of discrete scope items implied by the plans (e.g. for Electrical: "Rough-in for all receptacles/switches per plan", "Panel + service per electrical schedule", "Recessed cans in kitchen/great room", "Exterior GFCI + soffit outlets", "Low-voltage/data rough-in if shown").
- Each item: a short label, plus optional detail (the sheet/area/quantity hint that justifies it).
- Only include items the plans actually support. Do not invent code-required items the plans don't show.
- Keep it to the most decision-relevant 8-25 items.
- Return ONLY valid JSON. No prose, no markdown fences.`;

const PLAN_SCOPE_SCHEMA_HINT = `{
  "trade": "string or null",
  "scope_items": [{"label":"string","detail":"string or null"}],
  "notes": "string or null"
}`;

const LEVELING_SYSTEM_PROMPT = `You are a general contractor leveling subcontractor bids for a custom home. You are given each bid already extracted into structured JSON, and optionally an "expectedScope" checklist derived from the plans.

Do an apples-to-apples comparison:
1. Build a unified scope_items list. If expectedScope is present, start from it (mark source "plan"); add any scope item that appears in one or more bids (source "bid"); mark "both" when it is in plans AND bids.
2. For every scope item, build a matrix row with one cell per bid: status is "included" (clearly in that bid), "missing" (should be there but isn't — especially vs the plan scope), "excluded" (the bid explicitly excludes it), or "unclear". Put the line amount in "amount" when the bid prices that item, and a short "note" when useful.
3. bids_summary: per bid, base_bid_total, an adjusted_total that makes bids comparable (start from base_bid_total and, when one bid excludes/omits scope another includes, note it — only add a number if you can reasonably estimate it from the other bids' pricing, otherwise leave adjusted_total equal to base_bid_total and rely on missing_count), missing_count, exclusions_count.
4. differences: plain-English bullets of the most important scope/price differences a GC must know ("Bid A excludes the panel upgrade that Bids B and C include (~$2,400)").
5. gaps: per bid, the scope items it is missing relative to the plans/expected scope.
6. recommendation: winner (vendor name), runner_up, rationale (2-4 sentences weighing price AND completeness AND risk — the lowest number is NOT automatically the winner if it excludes scope), risks (things to confirm before awarding), price_note (the true comparable cost picture).
- Use the exact vendor_name from each bid (fall back to "Bid 1", "Bid 2"… in input order if a name is missing), and be consistent across the whole output.
- Return ONLY valid JSON. No prose, no markdown fences.`;

const COMPARISON_SCHEMA_HINT = `{
  "trade": "string or null",
  "scope_items": [{"id":"string","label":"string","source":"plan|bid|both"}],
  "matrix": [{"scope_item":"string","cells":[{"vendor":"string","status":"included|missing|excluded|unclear","amount":"number or null","note":"string or null"}]}],
  "bids_summary": [{"vendor":"string","base_bid_total":"number or null","adjusted_total":"number or null","missing_count":"number","exclusions_count":"number"}],
  "differences": ["string"],
  "gaps": [{"vendor":"string","missing":["string"]}],
  "recommendation": {"winner":"string or null","runner_up":"string or null","rationale":"string","risks":["string"],"price_note":"string or null"}
}`;
