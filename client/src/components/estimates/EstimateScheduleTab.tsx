// Schedule tab for the estimate editor. The GC picks a target start date and a
// SOURCE for the schedule — either this estimate's line items (grouped by trade)
// or one of the saved schedule templates (House Build, etc., re-anchored to the
// start). Publishing writes the resulting timeline onto the linked project so the
// client sees it and the commencement endpoint seeds tasks from it on signing.

import { useEffect, useMemo, useState } from 'react';
import {
  doc, onSnapshot, updateDoc, serverTimestamp, getDoc, getDocs, collection, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { estimateToSchedule } from '@/lib/schedule/estimateToSchedule';
import { templateToSchedule, type TemplateTask } from '@/lib/schedule/templateToSchedule';
import { clientSafeSchedule } from '@/lib/schedule/scheduleFinancials';
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

const ESTIMATE_SOURCE = 'estimate';

export function EstimateScheduleTab({ estimateId }: { estimateId: string }) {
  const { toast } = useToast();
  const [lineItems, setLineItems] = useState<ScheduleLineInput[]>([]);
  const [totalRevenue, setTotalRevenue] = useState<number>(0);  // estimate client total
  const [targetStart, setTargetStart] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [publishing, setPublishing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Schedule source: 'estimate' (line items) or a scheduleTemplates doc id.
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [sourceId, setSourceId] = useState<string>(ESTIMATE_SOURCE);
  const [templateTasks, setTemplateTasks] = useState<TemplateTask[]>([]);

  useEffect(() => {
    if (!estimateId) return;
    const unsub = onSnapshot(doc(db, 'estimates', estimateId), snap => {
      const d = snap.data() as any;
      setLineItems(Array.isArray(d?.lineItems) ? d.lineItems : []);
      setTotalRevenue(typeof d?.totalAmount === 'number' ? d.totalAmount : 0);
      setProjectId(d?.projectId || '');
      setTargetStart(prev => prev || d?.targetStartDate || todayPlus(30));
      setSourceId(prev => (prev !== ESTIMATE_SOURCE ? prev : d?.scheduleSourceId || ESTIMATE_SOURCE));
      setLoaded(true);
    });
    return unsub;
  }, [estimateId]);

  // Load the list of saved schedule templates for the source picker.
  useEffect(() => {
    getDocs(query(collection(db, 'scheduleTemplates'), orderBy('createdAt', 'desc')))
      .then(snap => setTemplates(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Untitled' }))))
      .catch(() => {});
  }, []);

  // When a template is chosen, load its tasks.
  useEffect(() => {
    if (sourceId === ESTIMATE_SOURCE) { setTemplateTasks([]); return; }
    let cancelled = false;
    getDoc(doc(db, 'scheduleTemplates', sourceId)).then(snap => {
      if (cancelled) return;
      const d = snap.data() as any;
      setTemplateTasks(Array.isArray(d?.tasks) ? d.tasks : []);
    }).catch(() => { if (!cancelled) setTemplateTasks([]); });
    return () => { cancelled = true; };
  }, [sourceId]);

  const persistStart = (iso: string) => {
    setTargetStart(iso);
    if (iso) updateDoc(doc(db, 'estimates', estimateId), { targetStartDate: iso }).catch(() => {});
  };

  const pickSource = (id: string) => {
    setSourceId(id);
    updateDoc(doc(db, 'estimates', estimateId), { scheduleSourceId: id }).catch(() => {});
  };

  const usingTemplate = sourceId !== ESTIMATE_SOURCE;

  // Internal cost basis for the profit forecast (Σ qty × subCost across lines).
  const totalCost = useMemo(
    () => lineItems.reduce((s, l) => s + (l.qty ?? 0) * (l.subCost ?? 0), 0),
    [lineItems],
  );

  const schedule = useMemo(() => {
    if (!targetStart) return null;
    return usingTemplate
      ? templateToSchedule(templateTasks, targetStart, {
          totalRevenue: totalRevenue || undefined,
          totalCost: totalCost || undefined,
        })
      : estimateToSchedule({ lineItems }, { targetStart, totalRevenue: totalRevenue || undefined });
  }, [usingTemplate, templateTasks, lineItems, targetStart, totalRevenue, totalCost]);

  const ready = usingTemplate ? templateTasks.length > 0 : lineItems.some(
    l => (l.lineStatus ?? 'inc') !== 'ex' && (l.lineStatus ?? 'inc') !== 'note');

  const publishToClient = async () => {
    if (!projectId || !schedule) return;
    setPublishing(true);
    try {
      await updateDoc(doc(db, 'projects', projectId), {
        // Client-safe: strip GC-only cost/profit; keep the revenue draw schedule.
        estimatedSchedule: clientSafeSchedule(schedule),
        estimatedScheduleStartDate: targetStart,
        estimatedScheduleSource: usingTemplate
          ? (templates.find(t => t.id === sourceId)?.name || 'Template')
          : 'Estimate line items',
        estimatedSchedulePublishedAt: serverTimestamp(),
      });
      toast({
        title: 'Schedule published to client',
        description: 'It now appears in the client portal Schedule tab and seeds tasks on signing.',
      });
    } catch (e: any) {
      toast({ title: 'Could not publish', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="p-5 space-y-5">
      {/* Source + start controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Schedule source</label>
          <select
            value={sourceId}
            onChange={e => pickSource(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm min-w-[200px] bg-white"
          >
            <option value={ESTIMATE_SOURCE}>Estimate line items (by trade)</option>
            {templates.length > 0 && (
              <optgroup label="Schedule templates">
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
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
        <div className="pb-1.5">
          <Button
            onClick={publishToClient}
            disabled={publishing || !projectId || !schedule || !ready}
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

      <p className="text-xs text-gray-500 max-w-2xl">
        {usingTemplate
          ? 'Generated from the selected schedule template, re-anchored to the target start. ◆ marks decision/selection steps. Publish so the client sees it and signing seeds the task list.'
          : "Generated from this estimate's line items, grouped by trade. Publish so the client sees this timeline while reviewing."}
      </p>

      {!loaded ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : !ready ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {usingTemplate
            ? 'This template has no dated tasks yet — open it in Templates → Schedule to build it out.'
            : 'Add line items to this estimate (tagged by trade) to generate a schedule.'}
        </div>
      ) : schedule ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {/* GC view — show the revenue/profit forecast. The client portal renders
              the same component without showProfit (and reads a cost-stripped copy). */}
          <ScheduleTimeline schedule={schedule} showProfit />
        </div>
      ) : null}
    </div>
  );
}
