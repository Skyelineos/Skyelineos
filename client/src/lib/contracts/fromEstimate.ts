// Estimate → Contract mapping. The first link in the lifecycle "spine": an
// approved estimate becomes a pre-filled client-build contract draft so the
// line items, allowances, and a starter draw schedule carry over instead of
// being re-typed by hand.
//
// Pure + structural: it accepts a minimal estimate shape (so it doesn't depend
// on EstimateBuilder's local interface) and returns the exact input
// createContract() expects.

import type {
  Contract, BidLineItem, AllowanceItem, DrawMilestone,
} from './types';

// Minimal estimate shape this mapper needs. EstimateBuilder's `Estimate`
// satisfies it structurally.
export interface EstimateForContract {
  id: string;
  title?: string;
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  jobAddress?: string;
  projectId?: string;
  projectName?: string;
  totalAmount?: number;
  lineItems?: Array<{
    id: string;
    trade?: string;
    description?: string;
    total?: number;
    // JACK-parity line status: 'inc' included, 'ex' excluded (show-only),
    // 'note' info-only, 'allow' allowance subject to client selection.
    lineStatus?: 'inc' | 'ex' | 'note' | 'allow';
  }>;
}

const rid = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`);

// Standard residential progress-draw template (percent of contract). The user
// can adjust labels/percentages in the contract editor afterward; this just
// means a new contract isn't born with an empty payment schedule.
const DEFAULT_DRAW_TEMPLATE: Array<{ label: string; pct: number }> = [
  { label: 'Deposit / Mobilization',          pct: 10 },
  { label: 'Foundation Complete',             pct: 15 },
  { label: 'Framing Complete',                pct: 20 },
  { label: 'Dry-in (Roof & Windows)',         pct: 15 },
  { label: 'Rough-ins Complete (MEP)',        pct: 15 },
  { label: 'Drywall & Insulation',            pct: 10 },
  { label: 'Finishes',                        pct: 10 },
  { label: 'Final / Certificate of Occupancy', pct: 5 },
];

export interface ContractFromEstimateOptions {
  createdBy: string;
  gcName?: string;
}

/**
 * Map an estimate into the createContract() input for a client-build contract
 * draft. Returns null if the estimate has nothing to contract on.
 */
export function estimateToContractInput(
  est: EstimateForContract,
  opts: ContractFromEstimateOptions,
): (Omit<Contract, 'id' | 'createdAt'> & { createdBy: string }) | null {
  const lines = est.lineItems ?? [];

  // Roll included (non-allowance) lines up by trade → one bid line item each.
  // 'ex' and 'note' lines carry no money and are skipped.
  const byTrade = new Map<string, number>();
  for (const l of lines) {
    const status = l.lineStatus ?? 'inc';
    if (status !== 'inc') continue; // allowances + excluded/notes handled elsewhere
    const category = (l.trade && l.trade.trim()) || 'General';
    byTrade.set(category, (byTrade.get(category) ?? 0) + (l.total ?? 0));
  }
  const lineItems: BidLineItem[] = Array.from(byTrade.entries())
    .filter(([, amount]) => amount !== 0)
    .map(([category, amount]) => ({ id: rid(), category, amount }));

  // Allowance lines → allowance buckets the client resolves via selections.
  const allowances: AllowanceItem[] = lines
    .filter(l => l.lineStatus === 'allow')
    .map(l => ({
      id: rid(),
      category: (l.trade && l.trade.trim()) || 'Allowance',
      description: l.description || 'Allowance',
      amount: l.total ?? 0,
      resolved: false,
    }));

  const lineSum = lineItems.reduce((s, li) => s + li.amount, 0)
    + allowances.reduce((s, a) => s + a.amount, 0);
  const contractAmount = est.totalAmount && est.totalAmount > 0 ? est.totalAmount : lineSum;

  if (lineItems.length === 0 && allowances.length === 0 && contractAmount === 0) {
    return null; // nothing to base a contract on
  }

  const drawSchedule: DrawMilestone[] = DEFAULT_DRAW_TEMPLATE.map(d => ({
    id: rid(),
    label: d.label,
    pctOfContract: d.pct,
    status: 'upcoming',
  }));

  // Build with conditional fields so we never write `undefined` (Firestore rejects it).
  const input: Omit<Contract, 'id' | 'createdAt'> & { createdBy: string } = {
    type: 'client_build',
    status: 'draft',
    budgetMode: 'soft',
    sourceEstimateId: est.id,
    gc: { name: opts.gcName || 'Skyeline Homes', role: 'gc' },
    other: {
      name: est.clientName || 'Client',
      role: 'client',
      ...(est.clientId ? { contactId: est.clientId } : {}),
      ...(est.clientEmail ? { email: est.clientEmail } : {}),
    },
    contractAmount,
    lineItems,
    allowances,
    drawSchedule,
    changeOrders: [],
    createdBy: opts.createdBy,
    ...(est.projectId ? { projectId: est.projectId } : {}),
    ...(est.projectName || est.jobAddress ? { projectName: est.projectName || est.jobAddress } : {}),
  };

  return input;
}
