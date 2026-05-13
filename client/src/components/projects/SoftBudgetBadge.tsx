import { useEffect, useState } from 'react';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { computeBudgetReadiness, type BudgetReadiness } from '@/lib/projectBudgetMode';
import type { Contract } from '@/lib/contracts/types';

// Project-level badge showing whether the budget is soft or finalized.
// Click to see the specific blockers preventing finalization.
export function SoftBudgetBadge({ projectId, lastDesignChangeAt }: {
  projectId: string;
  lastDesignChangeAt?: string;
}) {
  const [readiness, setReadiness] = useState<BudgetReadiness | null>(null);

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'contracts'), where('projectId', '==', projectId)),
      snap => {
        const contracts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Contract[];
        setReadiness(computeBudgetReadiness({ projectId, contracts, lastDesignChangeAt }));
      },
    );
    return () => unsub();
  }, [projectId, lastDesignChangeAt]);

  if (!readiness) return null;

  const isSoft = readiness.mode === 'soft';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button>
          <Badge
            variant="outline"
            className={`text-xs gap-1 cursor-pointer ${
              isSoft
                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                : 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100'
            }`}
          >
            {isSoft ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            {isSoft ? 'Soft budget' : 'Budget finalized'}
            {isSoft && readiness.selectionsCompletePct < 100 && (
              <span className="ml-0.5 text-[10px] opacity-70">
                {readiness.selectionsCompletePct}%
              </span>
            )}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm">
        {isSoft ? (
          <div className="space-y-2">
            <p className="font-semibold text-amber-900">Budget still soft</p>
            <p className="text-xs text-gray-600">
              The budget locks in once design selections are 100% resolved and every
              sub has refreshed their estimate against the latest design.
            </p>
            <ul className="text-xs space-y-1 pt-2 border-t border-gray-100">
              {readiness.blockers.length === 0
                ? <li className="text-gray-400">No blockers, but finalization not yet flipped.</li>
                : readiness.blockers.map((b, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
            </ul>
            <div className="text-xs text-gray-500 pt-2 border-t border-gray-100">
              Selections complete: <strong>{readiness.selectionsCompletePct}%</strong>
              {readiness.unresolvedAllowances > 0 && ` · ${readiness.unresolvedAllowances} pending`}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="font-semibold text-green-900">Budget finalized</p>
            <p className="text-xs text-gray-600">
              All allowances resolved and every sub estimate is up to date.
              Profit calculations and draw schedules are locked against this budget.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
