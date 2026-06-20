// Communication Center — aggregated Action Items + Decision Log for one subject
// (project / client / lead). Phase 2 captured these per-thread; this is the
// roll-up view a GC actually needs: every open item and the full decision log in
// one place. Reuses listenActionItemsForSubject / listenDecisionsForSubject
// (indexes already deployed). Staff-only; additive — pushing an item to the
// Schedule writes a normal task via the existing `tasks` collection.

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import type { SubjectRef } from '@/lib/communications/firestore';
import {
  listenActionItemsForSubject, updateActionItem, pushActionItemToTasks,
  type ActionItem,
} from '@/lib/communications/actionItems';
import { listenDecisionsForSubject, type ClientDecision } from '@/lib/communications/decisions';
import { CheckSquare, Gavel, CalendarPlus, CheckCircle2, MessageSquare, Loader2 } from 'lucide-react';

export function CommDigest({ subjectRef }: { subjectRef: SubjectRef }) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const role = (user as any)?.role;
  const isStaff = role === 'gc' || role === 'admin' || role === 'projectManager';

  const [items, setItems] = useState<ActionItem[]>([]);
  const [decisions, setDecisions] = useState<ClientDecision[]>([]);
  const [pushing, setPushing] = useState<string>('');

  useEffect(() => { if (isStaff) return listenActionItemsForSubject(subjectRef, setItems); }, [subjectRef.type, subjectRef.id, isStaff]);
  useEffect(() => { if (isStaff) return listenDecisionsForSubject(subjectRef, setDecisions); }, [subjectRef.type, subjectRef.id, isStaff]);

  if (!isStaff) return null;

  const open = items.filter(i => i.status !== 'done' && i.status !== 'dismissed');
  const done = items.filter(i => i.status === 'done');

  const push = async (item: ActionItem) => {
    setPushing(item.id);
    try { await pushActionItemToTasks(item, uid); }
    catch (e: any) { alert(e?.message || 'Could not add to schedule'); }
    finally { setPushing(''); }
  };

  const threadLink = (threadId?: string) =>
    threadId ? <Link href={`/communications?thread=${threadId}`} className="text-gray-300 hover:text-[#C9A96E]" title="Open source conversation"><MessageSquare className="h-3.5 w-3.5" /></Link> : null;

  const row = (it: ActionItem) => (
    <div key={it.id} className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
      <input type="checkbox" checked={it.status === 'done'}
             onChange={e => updateActionItem(it.id, { status: e.target.checked ? 'done' : 'open' })}
             className="mt-0.5 accent-[#C9A96E]" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${it.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{it.title}</p>
        <p className="text-[11px] text-gray-400">
          {it.assignedToName ? `→ ${it.assignedToName} ` : ''}{it.dueDate ? `· due ${it.dueDate} ` : ''}
          {it.createdViaAi ? '· AI' : ''}
        </p>
      </div>
      {it.linkedTaskId
        ? <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> In schedule</span>
        : it.projectId
          ? <button onClick={() => push(it)} disabled={pushing === it.id}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#C9A96E] border border-gray-200 rounded px-1.5 py-0.5 disabled:opacity-50"
                    title="Add to the project schedule as a task">
              {pushing === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />} Schedule
            </button>
          : null}
      {threadLink(it.sourceThreadId)}
    </div>
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Action items */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
          <CheckSquare className="h-4 w-4 text-[#C9A96E]" />
          <span className="font-semibold text-sm text-[#141414]">Action Items</span>
          <span className="text-[11px] text-gray-400">{open.length} open</span>
        </div>
        {items.length === 0
          ? <p className="px-3 py-6 text-sm text-gray-400 text-center">No action items yet. Capture them from a conversation, or use ✨ Analyze.</p>
          : <div>{open.map(row)}{done.length > 0 && <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-gray-300">Done</div>}{done.map(row)}</div>}
      </div>

      {/* Decision log */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="px-3 py-2 border-b border-gray-200 flex items-center gap-2">
          <Gavel className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-sm text-[#141414]">Decision Log</span>
          <span className="text-[11px] text-gray-400">{decisions.length}</span>
        </div>
        {decisions.length === 0
          ? <p className="px-3 py-6 text-sm text-gray-400 text-center">No decisions logged yet.</p>
          : decisions.map(d => (
            <div key={d.id} className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-0">
              <Gavel className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{d.title}</p>
                <p className="text-[11px] text-gray-400">
                  {d.decidedOn ? `${d.decidedOn} ` : ''}{d.relatedRoom ? `· ${d.relatedRoom} ` : ''}{d.createdViaAi ? '· AI' : ''}
                </p>
              </div>
              {threadLink(d.sourceThreadId)}
            </div>
          ))}
      </div>
    </div>
  );
}
