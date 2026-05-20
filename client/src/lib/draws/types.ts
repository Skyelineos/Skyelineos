// Draws — milestone payment requests sent to the client.
// Each draw is one slice of the project's contract total being billed.

import type { TradeId } from '@/lib/estimates/markup';

export type DrawStatus = 'draft' | 'pending' | 'submitted' | 'approved' | 'paid';

export interface Draw {
  id: string;
  projectId: string;
  trade?: TradeId;            // when the draw covers one trade's work (most common)
  // When the draw is a general milestone billing (e.g. 25% completion), leave trade undefined.
  name: string;
  amount: number;
  percentage?: number;        // optional — % of contract total
  milestone?: string;          // optional milestone label (e.g. "Drywall complete")
  status: DrawStatus;
  scheduledDate?: string;
  paidDate?: string;
  lienWaiverReceived?: boolean;
  notes?: string;
  createdAt?: any;
  createdBy?: string;
}

// Per-trade summary used by the TradeDrawsPanel.
export interface TradeProgress {
  trade: TradeId;
  tradeLabel: string;
  budgetAmount: number;        // sum of cost+markup for this trade from the snapshot
  budgetCost: number;          // raw cost portion
  budgetProfit: number;        // markup/profit portion
  drawsTotal: number;          // sum of approved + paid draws for this trade
  drawsPending: number;        // sum of draft + pending + submitted draws
  remaining: number;           // budgetAmount - drawsTotal - drawsPending
  drawCount: number;
}
