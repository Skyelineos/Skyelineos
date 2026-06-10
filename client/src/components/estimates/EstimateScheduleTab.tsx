// Schedule tab for the estimate editor. Subscribes to the estimate, lets the GC
// pick a target start date (persisted on the estimate as `targetStartDate`), and
// renders the estimate-derived timeline. The same target date + generator drive
// the client's estimated schedule and the task seeding on signing.

import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { estimateToSchedule } from '@/lib/schedule/estimateToSchedule';
import type { ScheduleLineInput } from '@/lib/schedule/types';
import { ScheduleTimeline } from '@/components/schedule/ScheduleTimeline';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CalendarClock, Send } from 'lucide-react';

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function EstimateScheduleTab({ estimateId }: { estimateId: string }) {
  const { toast } = useToast();
  const [lineItems, setLineItems] = useState<ScheduleLineInput[]>([]);
  const [targetStart, setTargetStart] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [publishing, setPublishing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!estimateId) return;
    const unsub = onSnapshot(doc(db, 'estimates', estimateId), snap => {
      const d = snap.data() as any;
      setLineItems(Array.isArray(d?.lineItems) ? d.lineItems : []);
      setProjectId(d?.projectId || '');
      // Only seed local state from the doc on first load so typing isn't clobbered.
      setTargetStart(prev => prev || d?.targetStartDate || todayPlus(30));
      setLoaded(true);
    });
    return unsub;
  }, [estimateId]);

  const persistStart = (iso: string) => {
    setTargetStart(iso);
    if (iso) updateDoc(doc(db, 'estimates', estimateId), { targetStartDate: iso }).catch(() => {});
  };

  const schedule = useMemo(() => {
    if (!targetStart) return null;
    return estimateToSchedule({ lineItems }, { targetStart });
  }, [lineItems, targetStart]);

  const hasLines = lineItems.some(l => (l.lineStatus ?? 'inc') !== 'ex' && (l.lineStatus ?? 'inc') !== 'note');

  // Publish the generated schedule onto the linked project so the client sees it
  // in their portal. The schedule object holds only trade/phase/date/amount — no
  // internal cost or markup — so it's safe to expose to the homeowner.
  const publishToClient = async () => {
    if (!projectId || !schedule) return;
    setPublishing(true);
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        estimatedSchedule: schedule,
        estimatedScheduleStartDate: targetStart,
        estimatedSchedulePublishedAt: serverTimestamp(),
      });
      toast({
        title: 'Schedule published to client',
        description: 'It now appears in the client portal Schedule tab.',
      });
    } catch (e: any) {
      toast({ title: 'Could not publish', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="p-5 space-y-5">
      {/* Target start control */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1">
            <CalendarClock className="h-4 w-4 text-[#C9A96E]" />
            Target start date
          </label>
          <input
            type="date"
            value={targetStart}
            onChange={e => persistStart(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <p className="text-xs text-gray-500 max-w-sm pb-2">
          Generated from this estimate's line items, grouped by trade and laid out from the
          target start. Publish it so the client sees this timeline while reviewing.
        </p>
        <div className="pb-1.5">
          <Button
            onClick={publishToClient}
            disabled={publishing || !projectId || !schedule || !hasLines}
            title={!projectId ? 'Link this estimate to a project to publish its schedule' : undefined}
            className="bg-[#C9A96E] hover:bg-[#b8924a] text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {publishing ? 'Publishing…' : 'Publish to client'}
          </Button>
          {!projectId && (
            <p className="text-[11px] text-gray-400 mt-1">Estimate isn't linked to a project yet.</p>
          )}
        </div>
      </div>

      {!loaded ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : !hasLines ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Add line items to this estimate (tagged by trade) to generate a schedule.
        </div>
      ) : schedule ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <ScheduleTimeline schedule={schedule} />
        </div>
      ) : null}
    </div>
  );
}
