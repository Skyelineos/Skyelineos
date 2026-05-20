// Per-line markup resolution + estimate roll-up math.
// Pure functions — no Firestore, no DOM. Safe to unit-test in isolation.

import type {
  CostCode, MarkupConfig, LineFinancials, EstimateRollup, TradeId,
} from './types';

const UNCATEGORIZED: TradeId = '__uncategorized__';

// Resolution order: per-line override → per-trade default → estimate default.
// Returns both the resolved % and the source so the UI can show a small hint
// ("inherited from trade default" vs "overridden").
export function resolveMarkupPct(
  line: Pick<CostCode, 'trade' | 'markupPctOverride'>,
  config: MarkupConfig,
): { pct: number; source: 'line' | 'trade' | 'default' } {
  if (typeof line.markupPctOverride === 'number' && !Number.isNaN(line.markupPctOverride)) {
    return { pct: line.markupPctOverride, source: 'line' };
  }
  if (line.trade && typeof config.byTrade[line.trade] === 'number') {
    return { pct: config.byTrade[line.trade], source: 'trade' };
  }
  return { pct: config.defaultPct, source: 'default' };
}

// Compute the financial view for a single line.
export function calculateLineFinancials(line: CostCode, config: MarkupConfig): LineFinancials {
  const cost = (line.qty || 0) * (line.unitCost || 0);
  const { pct, source } = resolveMarkupPct(line, config);
  const markupAmt = cost * (pct / 100);
  const price = cost + markupAmt;
  return {
    cost,
    markupPct: pct,
    markupAmt,
    price,
    profit: markupAmt,
    marginPct: price === 0 ? 0 : (markupAmt / price) * 100,
    markupSource: source,
  };
}

// Roll up an entire estimate. Used for the summary footer in the Costings tab
// AND for the budget snapshot at signing AND for the Finance dashboard's
// "target profit per project" widget.
export function rollupEstimate(
  lines: CostCode[] | undefined | null,
  config: MarkupConfig | undefined | null,
): EstimateRollup {
  let totalCost = 0;
  let totalMarkup = 0;
  let uncategorizedCost = 0;
  const byTrade: EstimateRollup['byTrade'] = {};

  // Defensive: caller may pass undefined when a budget hasn't been signed yet
  // or when migrating legacy estimates. Treat both as empty.
  const safeLines = Array.isArray(lines) ? lines : [];
  const safeConfig: MarkupConfig = config && typeof config === 'object'
    ? { defaultPct: config.defaultPct ?? 0, byTrade: config.byTrade ?? {} }
    : { defaultPct: 0, byTrade: {} };

  for (const line of safeLines) {
    const fin = calculateLineFinancials(line, safeConfig);
    totalCost += fin.cost;
    totalMarkup += fin.markupAmt;

    const tradeKey: TradeId = line.trade || UNCATEGORIZED;
    if (!byTrade[tradeKey]) {
      byTrade[tradeKey] = { cost: 0, markup: 0, price: 0, profit: 0, marginPct: 0, lineCount: 0 };
    }
    byTrade[tradeKey].cost += fin.cost;
    byTrade[tradeKey].markup += fin.markupAmt;
    byTrade[tradeKey].lineCount += 1;

    if (!line.trade) uncategorizedCost += fin.cost;
  }

  // Finalize derived fields on each trade bucket.
  for (const key of Object.keys(byTrade)) {
    const b = byTrade[key];
    b.price = b.cost + b.markup;
    b.profit = b.markup;
    b.marginPct = b.price === 0 ? 0 : (b.profit / b.price) * 100;
  }

  const totalPrice = totalCost + totalMarkup;
  return {
    totalCost,
    totalMarkup,
    totalPrice,
    totalProfit: totalMarkup,
    marginPct: totalPrice === 0 ? 0 : (totalMarkup / totalPrice) * 100,
    byTrade,
    uncategorizedCost,
  };
}

// Bridge for legacy estimates that only have `markupPct: number` and no
// `markupConfig` yet. Build a MarkupConfig with `defaultPct` set to the legacy
// value and an empty `byTrade` map so calculateLineFinancials still works.
export function configFromLegacyMarkup(markupPct: number): MarkupConfig {
  return { defaultPct: markupPct || 0, byTrade: {} };
}

// Default trade catalog used by EstimateCostingsTab's trade dropdown. Mirrors
// the list TakeoffStudio exports; eventually this should be replaced with a
// Firestore-backed `companySettings/trades` doc so Tyler can rename/add trades.
export const DEFAULT_TRADES: { id: TradeId; label: string }[] = [
  { id: 'general',         label: 'General Conditions' },
  { id: 'site',            label: 'Site Work' },
  { id: 'excavation',      label: 'Excavation' },
  { id: 'concrete',        label: 'Concrete / Foundation' },
  { id: 'framing',         label: 'Framing' },
  { id: 'roofing',         label: 'Roofing' },
  { id: 'electrical',      label: 'Electrical' },
  { id: 'plumbing',        label: 'Plumbing' },
  { id: 'hvac',            label: 'HVAC' },
  { id: 'insulation',      label: 'Insulation' },
  { id: 'drywall',         label: 'Sheetrock / Drywall' },
  { id: 'flooring',        label: 'Flooring' },
  { id: 'tile',            label: 'Tile' },
  { id: 'paint',           label: 'Paint' },
  { id: 'cabinets',        label: 'Cabinets / Millwork' },
  { id: 'exterior',        label: 'Exterior' },
  { id: 'landscaping',     label: 'Landscaping' },
  { id: 'finalInspection', label: 'Final Inspection' },
  { id: 'other',            label: 'Other' },
];

export const UNCATEGORIZED_TRADE_ID = UNCATEGORIZED;

// ─── Cross-system trade ID normalizer ─────────────────────────────────────────
// Schedule + Estimating must agree on trade IDs so the Finance dashboard can
// aggregate margin per trade across both systems. Older schedule data was
// saved with labels (e.g. "Framing", "Foundation") and older estimates with
// legacy keys. This function maps any of those to the canonical ID.
//
// Returns the original value if no mapping is found — never throws.

const LABEL_TO_ID_OVERRIDES: Record<string, TradeId> = {
  // Schedule legacy labels that don't directly match DEFAULT_TRADES labels:
  'Foundation':       'concrete',      // schedule used "Foundation" separately
  'Painting':         'paint',         // schedule used -ing form
  'Drywall':          'drywall',
  'Final Inspection': 'finalInspection',
};

export function normalizeTradeId(input: string | undefined | null): TradeId {
  if (!input) return '';
  // 1) Already a canonical ID — pass through.
  if (DEFAULT_TRADES.some(t => t.id === input)) return input;
  // 2) Override (schedule legacy / case variations).
  if (LABEL_TO_ID_OVERRIDES[input]) return LABEL_TO_ID_OVERRIDES[input];
  // 3) Match the canonical label (case-insensitive).
  const lower = input.trim().toLowerCase();
  const match = DEFAULT_TRADES.find(t => t.label.toLowerCase() === lower);
  if (match) return match.id;
  // 4) Last resort — return as-is so it still renders (best-effort backward compat).
  return input;
}

// Display label for a trade ID, falling back to the raw value when not in the
// canonical list (e.g. user-added trade not yet in DEFAULT_TRADES).
export function tradeLabel(id: string | undefined | null): string {
  if (!id) return '';
  const match = DEFAULT_TRADES.find(t => t.id === id);
  if (match) return match.label;
  return id;
}
