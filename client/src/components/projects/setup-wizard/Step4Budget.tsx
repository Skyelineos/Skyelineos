import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, DollarSign } from 'lucide-react';
import {
  FINISH_TIER_SUGGESTIONS,
  DEFAULT_ALLOWANCE_CATEGORIES,
  type ProjectSetupDraft,
  type AllowancesMap,
} from '@/types/projectSetup';

/**
 * Step 4 — Budget & tier.
 *
 * Captures the financial frame everyone else works within:
 *   - Total estimated budget (informs every role's expectation)
 *   - Finish tier (free-text, no $/sqft anchor — user's cost structure
 *     is in flux). Suggested values surface as quick-pick chips.
 *   - Per-category allowances — editable list, defaults from
 *     DEFAULT_ALLOWANCE_CATEGORIES. Allowances drive the designer's
 *     curation budget and the client's "this is over allowance"
 *     warnings on the selection board.
 */

interface Props {
  draft: ProjectSetupDraft;
  onChange: (next: ProjectSetupDraft) => void;
}

export function Step4Budget({ draft, onChange }: Props) {
  const allowances: AllowancesMap = draft.allowances || {};
  const [newCategory, setNewCategory] = useState('');

  const patch = (p: Partial<ProjectSetupDraft>) => onChange({ ...draft, ...p });

  const setAllowance = (category: string, amount: number) => {
    const next = { ...allowances, [category]: amount };
    patch({ allowances: next });
  };

  const removeAllowance = (category: string) => {
    const next = { ...allowances };
    delete next[category];
    patch({ allowances: next });
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (allowances[name] !== undefined) return; // already exists
    patch({ allowances: { ...allowances, [name]: 0 } });
    setNewCategory('');
  };

  // Categories to show — union of defaults + anything already set + any
  // custom category that's been added. Order: defaults first, then
  // user-added in the order they were added.
  const shownCategories = Array.from(new Set([
    ...DEFAULT_ALLOWANCE_CATEGORIES,
    ...Object.keys(allowances),
  ]));

  const totalAllowances = Object.values(allowances).reduce((s, v) => s + (v || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-heading font-semibold text-[#141414]">Budget &amp; finish tier</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Frames every decision downstream — what the designer curates within, what the client expects to spend, and what subs anchor their bids to.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="proj-budget">Estimated total budget</Label>
          <div className="relative mt-1.5">
            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="proj-budget"
              type="number"
              min={0}
              step={1000}
              value={draft.estimatedBudget || ''}
              onChange={e => patch({ estimatedBudget: parseInt(e.target.value, 10) || 0 })}
              placeholder="e.g. 1250000"
              className="pl-8"
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Visible to the client in their portal — sets the expectation.
          </p>
        </div>

        <div>
          <Label htmlFor="proj-tier">Finish tier</Label>
          <Input
            id="proj-tier"
            value={draft.finishTier || ''}
            onChange={e => patch({ finishTier: e.target.value })}
            placeholder="e.g. Premium"
            className="mt-1.5"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {FINISH_TIER_SUGGESTIONS.map(tier => (
              <button
                key={tier}
                type="button"
                onClick={() => patch({ finishTier: tier })}
                className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                  draft.finishTier === tier
                    ? 'bg-[#141414] text-white border-[#141414]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#C9A96E]'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Drives how the designer curates options. Free text — rename anytime.
          </p>
        </div>
      </div>

      {/* Allowances list */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div>
            <Label className="text-sm font-semibold">Per-category allowances</Label>
            <p className="text-[11px] text-gray-500 mt-0.5">
              What you've earmarked per category. Drives the "over allowance" warnings on the client's selection board.
            </p>
          </div>
          {totalAllowances > 0 && (
            <Badge variant="outline" className="font-mono text-xs">
              Total: ${totalAllowances.toLocaleString()}
            </Badge>
          )}
        </div>

        <div className="border rounded-lg divide-y">
          {shownCategories.map(category => {
            const amount = allowances[category] || 0;
            const isCustom = !DEFAULT_ALLOWANCE_CATEGORIES.includes(category as any);
            return (
              <div key={category} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm text-gray-800">{category}</span>
                {isCustom && <Badge variant="secondary" className="text-[10px]">custom</Badge>}
                <div className="relative w-36">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    type="number"
                    min={0}
                    step={500}
                    value={amount || ''}
                    onChange={e => setAllowance(category, parseInt(e.target.value, 10) || 0)}
                    className="pl-7 h-8 text-sm text-right"
                    placeholder="0"
                  />
                </div>
                {(isCustom || amount > 0) && (
                  <button
                    type="button"
                    onClick={() => removeAllowance(category)}
                    className="text-gray-300 hover:text-red-500"
                    title="Remove this allowance"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add custom category */}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/50">
            <Input
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
              placeholder="Add a category — e.g. Smart home"
              className="flex-1 h-8 text-sm"
            />
            <Button size="sm" variant="outline" onClick={addCategory} disabled={!newCategory.trim()} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
