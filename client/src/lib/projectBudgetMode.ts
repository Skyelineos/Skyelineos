import { doc, getDocs, collection, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Contract } from '@/lib/contracts/types';

// Project-level budget state. A project's overall budget is "soft" until
// every client_build contract on the project is finalized AND every sub
// contract's estimate has been refreshed since the last design change.
export type ProjectBudgetMode = 'soft' | 'finalized';

export interface BudgetReadiness {
  mode: ProjectBudgetMode;
  selectionsCompletePct: number;     // 0..100 — how many allowances resolved
  unresolvedAllowances: number;
  subEstimatesAllRefreshed: boolean; // every sub contract has been touched since last design change
  blockers: string[];                 // human-readable reasons it's still soft
}

// Compute the budget readiness for a project based on its contracts.
// Pure function — fed contracts from outside.
export function computeBudgetReadiness(opts: {
  projectId: string;
  contracts: Contract[];
  lastDesignChangeAt?: string;        // ISO — when did the latest design selection change?
}): BudgetReadiness {
  const ofProject = opts.contracts.filter(c => c.projectId === opts.projectId);
  const client = ofProject.filter(c => c.type === 'client_build');
  const subs = ofProject.filter(c => c.type === 'subcontractor');

  let resolved = 0;
  let totalAllowances = 0;
  for (const c of client) {
    for (const a of (c.allowances || [])) {
      totalAllowances += 1;
      if (a.resolved) resolved += 1;
    }
  }
  const selectionsCompletePct = totalAllowances === 0
    ? 100
    : Math.round((resolved / totalAllowances) * 100);
  const unresolvedAllowances = totalAllowances - resolved;

  // Subs are "fresh" if their `updatedAt` is newer than the latest design
  // change. If no design change date is provided, treat as fresh.
  const lastChange = opts.lastDesignChangeAt ? new Date(opts.lastDesignChangeAt).getTime() : 0;
  const subEstimatesAllRefreshed = subs.length === 0 || subs.every(s => {
    const u = s.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    return !lastChange || u >= lastChange;
  });

  const allClientFinalized = client.length > 0 && client.every(c => c.budgetMode === 'finalized');

  const blockers: string[] = [];
  if (unresolvedAllowances > 0) blockers.push(`${unresolvedAllowances} allowance${unresolvedAllowances === 1 ? '' : 's'} pending selection`);
  if (!subEstimatesAllRefreshed) blockers.push('Some sub estimates haven\'t been refreshed since the last design change');
  if (client.length === 0) blockers.push('No client build agreement yet');
  if (!allClientFinalized && client.length > 0) blockers.push('Client build agreement still marked soft');

  const mode: ProjectBudgetMode =
    allClientFinalized && unresolvedAllowances === 0 && subEstimatesAllRefreshed
      ? 'finalized'
      : 'soft';

  return { mode, selectionsCompletePct, unresolvedAllowances, subEstimatesAllRefreshed, blockers };
}

// Convenience: load all contracts for a project then compute readiness.
export async function getBudgetReadinessForProject(projectId: string, lastDesignChangeAt?: string): Promise<BudgetReadiness> {
  const snap = await getDocs(query(collection(db, 'contracts'), where('projectId', '==', projectId)));
  const contracts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Contract[];
  return computeBudgetReadiness({ projectId, contracts, lastDesignChangeAt });
}

// Project-level write-back: stamp the project doc with the latest derived mode.
export async function syncProjectBudgetMode(projectId: string, readiness: BudgetReadiness) {
  await updateDoc(doc(db, 'projects', projectId), {
    budgetMode: readiness.mode,
    budgetReadiness: {
      selectionsCompletePct: readiness.selectionsCompletePct,
      unresolvedAllowances: readiness.unresolvedAllowances,
      subEstimatesAllRefreshed: readiness.subEstimatesAllRefreshed,
      blockers: readiness.blockers,
      computedAt: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  } as any);
}
