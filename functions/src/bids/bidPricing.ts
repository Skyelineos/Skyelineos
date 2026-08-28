// Authoritative server-side bid pricing build-up.
//
// This is the trusted recompute of what a sub sees in the portal. The client
// (client/src/lib/bidPricing.ts) renders a live preview, but the submitted
// total is whatever THIS file computes from the persisted line items — a sub
// can't POST a total that doesn't match their line items + declared markup.
//
// Build-up order:
//   baseSubtotal = Σ (qty × unitCost)
//   overheadAmt  = baseSubtotal × overhead%
//   markupAmt    = (base + overhead) × markup%
//   preTax       = base + overhead + markup
//   taxAmt       = preTax × tax%
//   total        = preTax + taxAmt
//
// ⚠️  KEEP IN SYNC with client/src/lib/bidPricing.ts.

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
