// Estimating types — used by the Costings tab and (downstream) the Finance
// dashboard. These supplement the existing inline CostCode/CostGroup interfaces
// in EstimateCostingsTab.tsx; we declare them once here so the math lib and
// future budget-snapshot code stay aligned.

export type TradeId = string; // e.g. 'framing' | 'tile' | 'plumbing' | …

// Per-line cost entry inside a cost group on an estimate.
// Mirrors the inline interface in EstimateCostingsTab.tsx and adds the
// trade tag + per-line markup override that Tyler asked for (per-project +
// per-trade markup, with line-level override for outliers).
export interface CostCode {
  id: string;
  groupId: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;        // = qty * unitCost (builder cost only, no markup)
  order: number;
  // NEW
  trade?: TradeId;                // empty = "uncategorized" for analytics
  markupPctOverride?: number;     // when set, beats trade + estimate defaults
}

export interface CostGroup {
  id: string;
  name: string;
  order: number;
  isDefault?: boolean;
}

// Per-estimate markup configuration. Lives on the estimate doc as
// `markupConfig`. When absent, the estimate falls back to its legacy
// `markupPct` (a single number) for backward compatibility.
export interface MarkupConfig {
  defaultPct: number;                       // estimate-wide fallback
  byTrade: Record<TradeId, number>;          // per-trade overrides
  history?: MarkupHistoryEntry[];           // audit trail
}

export interface MarkupHistoryEntry {
  changedAt: string;            // ISO timestamp
  changedBy: string;            // user id / email
  field: 'defaultPct' | `byTrade.${string}`;
  before: number | undefined;
  after: number | undefined;
}

// Resolved-per-line financials. Pure function output — never stored.
export interface LineFinancials {
  cost: number;                 // qty * unitCost
  markupPct: number;            // the resolved rate (line > trade > default)
  markupAmt: number;            // cost * markupPct / 100
  price: number;                // cost + markupAmt
  profit: number;               // === markupAmt (kept named for clarity)
  marginPct: number;            // profit / price * 100
  markupSource: 'line' | 'trade' | 'default'; // for UI hints
}

// Roll-up across all cost codes in an estimate.
export interface EstimateRollup {
  totalCost: number;
  totalMarkup: number;
  totalPrice: number;            // == contract total at signing
  totalProfit: number;           // == totalMarkup
  marginPct: number;
  byTrade: Record<TradeId, {
    cost: number;
    markup: number;
    price: number;
    profit: number;
    marginPct: number;
    lineCount: number;
  }>;
  uncategorizedCost: number;     // cost from lines without a trade — flag in UI
}

// Frozen snapshot written to `projects/{id}.budget` when a contract is signed.
// The estimate stays mutable for "current state"; the budget is the immutable
// "what we promised when we signed" baseline for variance calculations.
export interface BudgetSnapshot {
  signedAt: string;
  signedBy: string;
  sourceEstimateId: string;
  contractTotal: number;         // owner price at signing (incl. markup)
  targetProfit: number;
  targetMarginPct: number;
  lineItems: Array<CostCode & { groupName: string }>;
  markupConfig: MarkupConfig;
  taxPct: number;
}
