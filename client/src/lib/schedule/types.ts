// Estimate-derived schedule types. The schedule is generated from an estimate's
// line items (each tagged with a trade) so the client sees a timeline built from
// their actual scope, and the same projection seeds real tasks on signing.

export type BuildPhase =
  | 'Pre-Construction'
  | 'Foundation'
  | 'Framing'
  | 'Rough-In'
  | 'Pre-Drywall'
  | 'Finish'
  | 'Closeout';

// Minimal estimate line shape the generator needs. EstimateBuilder's LineItem
// satisfies this structurally.
export interface ScheduleLineInput {
  trade?: string;
  total?: number;       // client-facing line total (revenue weight)
  qty?: number;         // for internal cost = qty × subCost
  subCost?: number;     // what the sub charges Skyeline (internal cost basis)
  description?: string;
  // JACK-parity line status: 'inc' included, 'ex' excluded (show-only),
  // 'note' info-only, 'allow' allowance.
  lineStatus?: 'inc' | 'ex' | 'note' | 'allow';
}

export interface EstimateForSchedule {
  lineItems?: ScheduleLineInput[];
}

// One trade/step slot in the schedule (a future task), with computed dates.
// `phase` is a free string so it works for both estimate-derived phases
// (BuildPhase values) and arbitrary template phase names (e.g. "Gunite").
export interface ScheduledTrade {
  trade: string;
  phase: string;
  amount: number;
  lineCount: number;
  startDate: string;   // ISO YYYY-MM-DD
  endDate: string;     // ISO YYYY-MM-DD
  durationDays: number;
  decision?: boolean;  // a client/owner decision step (selection) — surfaced in UI
}

export interface ScheduledPhase {
  phase: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  trades: ScheduledTrade[];
  // Money (optional). `revenue` = the draw due by this phase (client-safe).
  // `cost`/`profit` are GC-only — strip before exposing to a client.
  revenue?: number;
  cost?: number;
  profit?: number;
}

export interface GeneratedSchedule {
  startDate: string;       // ISO — the target start anchor
  endDate: string;         // ISO — projected substantial completion
  totalDays: number;       // calendar days start→end
  phases: ScheduledPhase[];
  tradeCount: number;      // distinct trades scheduled
  // Roll-up money (optional). revenue is client-safe; cost/profit GC-only.
  revenue?: number;
  cost?: number;
  profit?: number;
  marginPct?: number;
}
