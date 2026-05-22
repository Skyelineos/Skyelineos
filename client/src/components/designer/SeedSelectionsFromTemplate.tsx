import { useState, useMemo } from 'react';
import { collection, getDocs, writeBatch, doc, serverTimestamp, query as fsQuery, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  SELECTIONS_TEMPLATE,
  TEMPLATE_VERSION,
  PHASES,
  groupByPhase,
  type SelectionTemplateItem,
  type BuildPhase,
} from '@/data/selectionsTemplate';

interface Props {
  projectId: string;
  projectName: string;
  designerId: string;
  onSeeded?: (count: number) => void;
}

/**
 * One-click seeder: clones the 1,195-item standard selections template into
 * a project's `selections` subcollection. Idempotent — skips items already
 * present (matched by templateItemId). Lets the designer scope the seed by
 * phase and category so they can seed in stages.
 */
export default function SeedSelectionsFromTemplate({ projectId, projectName, designerId, onSeeded }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedPhases, setSelectedPhases] = useState<Set<BuildPhase>>(new Set(PHASES));
  const [skipExisting, setSkipExisting] = useState(true);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);

  const grouped = useMemo(() => groupByPhase(), []);
  const itemsToSeed = useMemo(
    () => SELECTIONS_TEMPLATE.filter(i => selectedPhases.has(i.phase as BuildPhase)),
    [selectedPhases]
  );

  const togglePhase = (phase: BuildPhase) => {
    const next = new Set(selectedPhases);
    next.has(phase) ? next.delete(phase) : next.add(phase);
    setSelectedPhases(next);
  };

  const seed = async () => {
    setBusy(true);
    setResult(null);
    try {
      // Get existing templateItemIds so we don't duplicate
      const existingIds = new Set<string>();
      if (skipExisting) {
        const snap = await getDocs(collection(db, 'projects', projectId, 'selections'));
        snap.forEach(d => {
          const t = d.data().templateItemId;
          if (t) existingIds.add(t);
        });
      }

      const toAdd = itemsToSeed.filter(i => !existingIds.has(i.id));
      // Firestore batch limit is 500
      const CHUNK = 450;
      let added = 0;
      for (let i = 0; i < toAdd.length; i += CHUNK) {
        const batch = writeBatch(db);
        const slice = toAdd.slice(i, i + CHUNK);
        slice.forEach((it: SelectionTemplateItem) => {
          const ref = doc(collection(db, 'projects', projectId, 'selections'));
          batch.set(ref, {
            // Template metadata
            templateItemId: it.id,
            templateVersion: TEMPLATE_VERSION,
            // Selection content (matches the existing Selection model where possible)
            category: it.category,
            subcategory: it.subcategory,
            room: it.room,
            item: it.item,
            phase: it.phase,
            decisionOwner: it.owner,
            // Status fields
            status: 'Not Started',           // Not Started | In Discussion | Selected | Ordered | Received | Installed
            clientApprovalStatus: 'Pending Options',
            orderStatus: 'Not Ordered',
            // Pricing — designer fills in
            allowanceAmount: null,
            actualCost: null,
            // Curation — designer fills in
            items: [],
            designerFiles: [],
            notes: '',
            // Audit
            seededBy: designerId,
            seededAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
        added += slice.length;
      }
      const skipped = itemsToSeed.length - toAdd.length;
      setResult({ added, skipped });
      toast({ title: `Seeded ${added} selections`, description: skipped ? `${skipped} already existed and were skipped.` : 'Project is ready for design curation.' });
      onSeeded?.(added);
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Seed failed', description: e.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="default" size="sm" data-testid="btn-seed-selections">
        <Sparkles className="w-4 h-4 mr-2" /> Seed standard selections
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seed selections for {projectName}</DialogTitle>
            <DialogDescription>
              Add the Skyeline standard {SELECTIONS_TEMPLATE.length}-item selection list to this project so nothing slips through. Designer fills in allowances, curates options, and gets client approval per item.
            </DialogDescription>
          </DialogHeader>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Phases to include</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {PHASES.map(p => (
                <label key={p} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <Checkbox checked={selectedPhases.has(p)} onCheckedChange={() => togglePhase(p)} />
                    <span className="text-sm font-medium">{p}</span>
                  </span>
                  <Badge variant="outline">{(grouped[p] || []).length} items</Badge>
                </label>
              ))}
              <label className="flex items-center gap-2 pt-2 border-t mt-2 cursor-pointer">
                <Checkbox checked={skipExisting} onCheckedChange={(v) => setSkipExisting(!!v)} />
                <span className="text-sm">Skip items already seeded (idempotent re-runs)</span>
              </label>
            </CardContent>
          </Card>

          {result && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 text-green-900">
              <CheckCircle2 className="w-4 h-4" /> Added {result.added}, skipped {result.skipped}.
            </div>
          )}

          {selectedPhases.size === 0 && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 text-amber-900">
              <AlertTriangle className="w-4 h-4" /> Pick at least one phase.
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Close</Button>
            <Button onClick={seed} disabled={busy || itemsToSeed.length === 0}>
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Seeding…</> : `Seed ${itemsToSeed.length} items`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
