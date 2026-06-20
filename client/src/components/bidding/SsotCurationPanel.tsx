// GC-side SSOT curation — promote project documents / selections / approved
// mood boards into the Single Source of Truth (the curated set subs can see).
// Promotion is a flag (inSsot), never a copy. See docs/single-source-of-truth-design.md §3.

import { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, Image, ListChecks, Check, Lock } from 'lucide-react';
import {
  listCurationCandidates, setDocumentInSsot, setSelectionInSsot, setMoodBoardInSsot,
  type CurationCandidate,
} from '@/lib/ssot/ssotItems';
import type { SsotItemSource } from '@/lib/ssot/types';

const SOURCE_META: Record<SsotItemSource, { label: string; icon: typeof FileText }> = {
  document: { label: 'Documents', icon: FileText },
  moodBoard: { label: 'Design boards', icon: Image },
  selection: { label: 'Selections', icon: ListChecks },
};

export function SsotCurationPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<CurationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setCandidates(await listCurationCandidates(projectId));
    } catch (e) {
      console.warn('[ssot] curation load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [projectId]);

  const toggle = async (c: CurationCandidate) => {
    if (!c.promotable && !c.inSsot) return;
    setBusy(c.id);
    const next = !c.inSsot;
    try {
      if (c.source === 'document') await setDocumentInSsot(c.id, next);
      else if (c.source === 'selection') await setSelectionInSsot(projectId, c.id, next);
      else await setMoodBoardInSsot(projectId, c.id, next);
      setCandidates(prev => prev.map(x => (x.id === c.id ? { ...x, inSsot: next } : x)));
    } catch (e: any) {
      toast({ title: 'Could not update', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const groups = (Object.keys(SOURCE_META) as SsotItemSource[]).map(src => ({
    src,
    items: candidates.filter(c => c.source === src),
  }));
  const inCount = candidates.filter(c => c.inSsot).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Check className="w-4 h-4 text-[#C9A96E]" />
          Single Source of Truth — {inCount} item{inCount === 1 ? '' : 's'} shared
        </CardTitle>
        <CardDescription>
          Promote the plans, selections, and approved design that define this build. Only
          promoted items are visible to subs bidding the job.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-gray-400">No documents, selections, or design boards on this project yet.</p>
        ) : (
          groups.map(({ src, items }) => {
            if (items.length === 0) return null;
            const Meta = SOURCE_META[src];
            const Icon = Meta.icon;
            return (
              <div key={src}>
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
                  <Icon className="w-3.5 h-3.5" /> {Meta.label}
                </div>
                <div className="space-y-1.5">
                  {items.map(c => (
                    <div key={c.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-900 flex-1 truncate">{c.title}</span>
                      {c.note && <span className="text-[11px] text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" />{c.note}</span>}
                      <button
                        type="button"
                        disabled={busy === c.id || (!c.promotable && !c.inSsot)}
                        onClick={() => toggle(c)}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${
                          c.inSsot
                            ? 'bg-green-50 border-green-300 text-green-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-[#C9A96E]'
                        }`}
                      >
                        {c.inSsot ? (<span className="flex items-center gap-1"><Check className="w-3 h-3" /> In SSOT</span>) : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
