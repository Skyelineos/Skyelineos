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
  total?: number;
  description?: string;
  // JACK-parity line status: 'inc' included, 'ex' excluded (show-only),
  // 'note' info-only, 'allow' allowance.
  lineStatus?: 'inc' | 'ex' | 'note' | 'allow';
}

export interface EstimateForSchedule {
  lineItems?: ScheduleLineInput[];
}

// One trade's slot in the schedule (a future task), with computed dates.
export interface ScheduledTrade {
  trade: string;
  phase: BuildPhase;
  amount: number;
  lineCount: number;
  startDate: string;   // ISO YYYY-MM-DD
  endDate: string;     // ISO YYYY-MM-DD
  durationDays: number;
}

export interface ScheduledPhase {
  phase: BuildPhase;
  startDate: string;
  endDate: string;
  durationDays: number;
  trades: ScheduledTrade[];
}

export interface GeneratedSchedule {
  startDate: string;       // ISO — the target start anchor
  endDate: string;         // ISO — projected substantial completion
  totalDays: number;       // calendar days start→end
  phases: ScheduledPhase[];
  tradeCount: number;      // distinct trades scheduled
}
