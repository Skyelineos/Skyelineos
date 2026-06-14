// Step 2 of Design Style Discovery — pairwise "which feels more like you?"
// Refines the client's direction and stores each result for future AI scoring.
// (Scoring isn't built yet; this captures the comparison data + UX structure.)

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { heroImageUrl, type StyleOption } from '@/data/standardStyleQuiz';
import { StyleImagePlaceholder } from '@/components/style/StyleImagePlaceholder';
import { generateComparisonPairs, saveComparison, type StyleComparison } from '@/lib/styleDiscovery';

interface Props {
  projectId: string;
  clientId?: string;
  styleOptions: StyleOption[];
  selectedIds: string[];
  onDone: (comparisons: StyleComparison[]) => void;
}

export function StylePairwise({ projectId, clientId, styleOptions, selectedIds, onDone }: Props) {
  const pairs = useMemo(() => generateComparisonPairs(selectedIds, styleOptions), [selectedIds, styleOptions]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<StyleComparison[]>([]);
  const [busy, setBusy] = useState(false);

  if (pairs.length === 0) { onDone([]); return null; }

  const [a, b] = pairs[idx];

  const record = async (selectedOptionId: string | null, skipped: boolean) => {
    setBusy(true);
    const base = { projectId, clientId: clientId ?? null, optionAId: a.id, optionBId: b.id, selectedOptionId, skipped };
    let id = 'local';
    try { id = await saveComparison(projectId, base); } catch { /* keep local result even if write fails */ }
    const all = [...results, { ...base, comparisonId: id }];
    setResults(all);
    setBusy(false);
    if (idx >= pairs.length - 1) onDone(all);
    else setIdx(i => i + 1);
  };

  const Card = ({ o }: { o: StyleOption }) => {
    const hero = heroImageUrl(o);
    return (
      <button disabled={busy} onClick={() => record(o.id, false)}
        className="flex-1 rounded-xl border border-gray-200 overflow-hidden text-left transition-all hover:shadow-md hover:border-[#C9A96E] disabled:opacity-60">
        <div className="aspect-[4/3] overflow-hidden">
          {hero ? <img src={hero} alt={o.label} className="w-full h-full object-cover" />
                : <StyleImagePlaceholder label={o.label} slotTitle="Hero View" imageType="hero" />}
        </div>
        <div className="p-3">
          <p className="text-sm font-bold text-gray-900">{o.label}</p>
          {o.description && <p className="text-xs text-gray-500 mt-0.5">{o.description}</p>}
        </div>
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: '#8a6a3a' }}>Refine your style</span>
        <span className="text-xs text-gray-400">{idx + 1} of {pairs.length}</span>
      </div>
      <h3 className="text-lg font-bold text-gray-900">Which feels more like you?</h3>
      <p className="text-sm text-gray-500 mb-4">Tap the one you’re drawn to.</p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Card o={a} />
        <div className="self-center text-xs font-semibold text-gray-300">OR</div>
        <Card o={b} />
      </div>

      <div className="mt-4">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => record(null, true)} className="text-gray-500">
          Skip this one
        </Button>
      </div>
    </div>
  );
}
