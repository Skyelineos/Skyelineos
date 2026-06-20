// Map the JSON shape returned by /api/extract-estimate (Claude vision) into the
// canonical LineItem rows used by EstimateBuilder's Scope of Work table.
//
// The extracted shape is intentionally flexible (per-row trade is optional and
// falls back to the document-level default_trade; materials/labor are optional
// and only present when the quote actually separates them). This helper does
// the safe coercions, defaults, and total computation so the caller can just
// append the result to its `lineItems` state.
//
// Defaults are tuned for the dominant case: these come from subcontractor
// quotes, so kind defaults to 'subcontractor' and lineStatus to 'inc'. Tyler
// can flip any field after the fact — the goal is to save retyping, not to
// guess perfectly.

// Re-declared here (instead of imported from EstimateBuilder.tsx) so this
// helper stays a leaf-level utility and never pulls the page into a non-page
// import graph. The shape is the public LineItem contract for the table.
export interface LineItem {
  id: string;
  trade: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  subCost?: number;
  total: number;
  subId?: string;
  subName?: string;
  notes?: string;
  fromEmail?: boolean;
  takeoffMeasurementId?: string;
  needsSelection?: boolean;
  selectionStatus?: 'pending' | 'designer_selected' | 'client_approved';
  splitLaborMaterial?: boolean;
  laborPct?: number;
  kind?: 'material' | 'labor' | 'equipment' | 'subcontractor' | 'both';
  lineStatus?: 'inc' | 'ex' | 'note' | 'allow';
  totalQty?: number;
  taxable?: boolean;
  markupPctLine?: number;
  assignedSubIds?: string[];
  awardedBidId?: string;
}

export interface ExtractedLineItem {
  trade: string | null;
  description: string;
  qty: number | null;
  unit: string | null;
  unit_materials_cost: number | null;
  unit_labor_cost: number | null;
  unit_cost: number | null;
  markup_pct: number | null;
  total: number | null;
}

export interface ExtractedEstimate {
  vendor_name?: string | null;
  default_trade?: string | null;
  notes?: string | null;
  line_items?: ExtractedLineItem[] | null;
}

export interface MapOptions {
  /** Vendor name from the extraction — applied as subName on every row so the
   *  user can see which sub the row came from at a glance. */
  vendorName?: string | null;
  /** Defaults the row's `kind` field. Subcontractor quotes are the common case. */
  defaultKind?: 'material' | 'labor' | 'subcontractor';
  /** Trade label to use when both per-row trade and default_trade are missing. */
  defaultTradeFallback?: string;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Blank-but-valid row, used when extraction returns nothing. */
function blankRow(trade: string): LineItem {
  return {
    id: newId(),
    trade,
    description: '',
    qty: 1,
    unit: 'lump sum',
    unitCost: 0,
    subCost: 0,
    total: 0,
    kind: 'subcontractor',
    lineStatus: 'inc',
  };
}

function num(v: number | null | undefined, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Convert the extractor's output to LineItem[] suitable for append into
 * EstimateBuilder's `items` state.
 *
 * Edge cases handled:
 *  - Missing/empty extraction → returns one blank row so Tyler can type into it.
 *  - Per-row trade missing → falls back to default_trade → fallback constant.
 *  - Both materials + labor present → unitCost = sum; subCost mirrors initially
 *    (Tyler can split sub-vs-client later).
 *  - Only unit_cost present → unitCost = unit_cost; subCost mirrors.
 *  - No cost at all → 0; row still appears so the description survives.
 *  - Missing total → computed as qty * unitCost.
 *  - markup_pct present → set markupPctLine so per-line override beats global.
 */
export function mapExtractedToLineItems(
  extraction: ExtractedEstimate | null | undefined,
  options: MapOptions = {},
): LineItem[] {
  const defaultKind = options.defaultKind ?? 'subcontractor';
  const fallbackTrade = options.defaultTradeFallback ?? 'General Conditions';
  const docTrade =
    (extraction?.default_trade && extraction.default_trade.trim()) || fallbackTrade;

  const rows = Array.isArray(extraction?.line_items) ? extraction!.line_items! : [];
  if (!rows.length) {
    return [blankRow(docTrade)];
  }

  return rows.map(raw => {
    const trade =
      (raw.trade && typeof raw.trade === 'string' && raw.trade.trim()) || docTrade;
    const qty = num(raw.qty, 1);
    const unit = (raw.unit && raw.unit.trim()) || 'lump sum';

    // Prefer materials+labor split when both present; else unit_cost; else 0.
    let unitCost = 0;
    const mat = raw.unit_materials_cost;
    const lab = raw.unit_labor_cost;
    if (mat != null && lab != null) {
      unitCost = num(mat) + num(lab);
    } else if (mat != null || lab != null) {
      // Only one side shown — sum the present one with whatever unit_cost adds.
      unitCost = num(mat) + num(lab) + (raw.unit_cost == null ? 0 : num(raw.unit_cost));
      if (unitCost === 0) unitCost = num(raw.unit_cost);
    } else {
      unitCost = num(raw.unit_cost);
    }

    const total =
      raw.total != null && Number.isFinite(raw.total) ? num(raw.total) : qty * unitCost;

    const row: LineItem = {
      id: newId(),
      trade,
      description: (raw.description || '').trim(),
      qty,
      unit,
      unitCost,
      // Sub cost starts equal to unit cost — Tyler edits the client-facing
      // unitCost (with markup) afterward. Keeps the imported number auditable.
      subCost: unitCost,
      total,
      kind: defaultKind,
      lineStatus: 'inc',
    };

    if (options.vendorName) row.subName = options.vendorName;
    if (raw.markup_pct != null && Number.isFinite(raw.markup_pct)) {
      row.markupPctLine = num(raw.markup_pct);
    }

    // If we split materials/labor, flag the row so the UI can show the breakdown
    // and seed laborPct from the labor share — best-effort, not load-bearing.
    if (mat != null && lab != null) {
      const total = num(mat) + num(lab);
      if (total > 0) {
        row.splitLaborMaterial = true;
        row.laborPct = Math.round((num(lab) / total) * 100);
      }
    }

    return row;
  });
}
