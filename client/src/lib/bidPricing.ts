// Bid pricing build-up — the single math a sub uses to turn raw line-item
// costs into their submitted bid number.
//
// Build-up order (standard construction estimating):
//   baseSubtotal  = Σ (qty × unitCost)          — raw cost of the work
//   overheadAmt   = baseSubtotal × overhead%     — the sub's operating overhead
//   markupAmt     = (base + overhead) × markup%  — the sub's profit
//   preTax        = base + overhead + markup
//   taxAmt        = preTax × tax%                — sales/use tax where it applies
//   total         = preTax + taxAmt              — the bid the GC sees
//
// All three percentages default to 0, so a sub who just wants to type a
// number in still gets total === baseSubtotal (backward compatible with the
// original raw-pricing behavior).
//
// ⚠️  KEEP IN SYNC with functions/src/bids/bidPricing.ts — the server
// recomputes this authoritatively at submit time. The two files can't share
// an import because `functions/` compiles only its own `src` (no @shared alias).

export interface BidPricingConfig {
  markupPct: number;
  overheadPct: number;
  taxPct: number;
}

export interface BidPricingSnapshot extends BidPricingConfig {
  baseSubtotal: number;
  overheadAmt: number;
  markupAmt: number;
  preTax: number;
  taxAmt: number;
  total: number;
}

interface PricedLine {
  qty?: number;
  unitCost?: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Clamp a percentage to a sane [0, 1000] range and coerce NaN → 0. */
const pct = (n: unknown): number => {
  const v = typeof n === 'number' && isFinite(n) ? n : 0;
  return Math.min(Math.max(v, 0), 1000);
};

export function computeBidPricing(
  lines: PricedLine[],
  config: Partial<BidPricingConfig> | undefined,
): BidPricingSnapshot {
  const markupPct = pct(config?.markupPct);
  const overheadPct = pct(config?.overheadPct);
  const taxPct = pct(config?.taxPct);

  const baseSubtotal = round2(
    (lines || []).reduce(
      (s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0),
      0,
    ),
  );
  const overheadAmt = round2(baseSubtotal * (overheadPct / 100));
  const markupAmt = round2((baseSubtotal + overheadAmt) * (markupPct / 100));
  const preTax = round2(baseSubtotal + overheadAmt + markupAmt);
  const taxAmt = round2(preTax * (taxPct / 100));
  const total = round2(preTax + taxAmt);

  return {
    markupPct,
    overheadPct,
    taxPct,
    baseSubtotal,
    overheadAmt,
    markupAmt,
    preTax,
    taxAmt,
    total,
  };
}
