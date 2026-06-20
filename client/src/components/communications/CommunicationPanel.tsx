// Reusable Communication Center panel: thread list (filter + search) on the left,
// thread view on the right. Used by the global hub (no subject filter) and the
// per-project / per-client / per-lead surfaces (scoped to one subjectRef) so
// there is ONE communication UI everywhere instead of duplicated views.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  listenThreads, listenThreadsForSubject, CATEGORY_LABELS, COMM_CATEGORIES,
  type CommThread, type CommCategory, type SubjectRef,
} from '@/lib/communications/firestore';
import { summarizeProject } from '@/lib/communications/ai';
import { CommThreadView } from './CommThreadView';
import { NewThreadModal } from './NewThreadModal';
import { LogPhoneCallModal, LogMeetingModal } from './LogActivityModals';
import { MessageSquarePlus, Search, Loader2, Filter, Phone, Video, Sparkles, X } from 'lucide-react';

function fmtAgo(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const SUBJECT_DOT: Record<string, string> = { lead: 'bg-green-500', client: 'bg-blue-500', project: 'bg-[#C9A96E]' };
const KIND_GLYPH: Record<string, any> = { phone_call: Phone, meeting: Video };

export function CommunicationPanel({ subjectFilter, initialThreadId, height = 'h-[640px]' }: {
  subjectFilter?: SubjectRef;
  subjectLabel?: string;
  initialThreadId?: string;
  height?: string;
}) {
  const { user } = useAuth();
  const role = (user as any)?.role;
  const isStaff = role === 'gc' || role === 'admin' || role === 'projectManager';

  const [threads, setThreads] = useState<CommThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(initialThreadId || '');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CommCategory | 'all'>('all');
  const [modal, setModal] = useState<null | 'new' | 'call' | 'meeting'>(null);
  const isProject = subjectFilter?.type === 'project';
  const [projSummary, setProjSummary] = useState('');
  const [projSummarizing, setProjSummarizing] = useState(false);

  const runProjectSummary = async () => {
    if (!isProject || projSummarizing) return;
    setProjSummarizing(true);
    try { setProjSummary((await summarizeProject(subjectFilter!.id)).summary || 'No communication to summarize yet.'); }
    catch (e: any) { setProjSummary(e?.message || 'Summarize failed'); }
    finally { setProjSummarizing(false); }
  };

  useEffect(() => {
    setLoading(true);
    const cb = (rows: CommThread[]) => { setThreads(rows); setLoading(false); };
    return subjectFilter ? listenThreadsForSubject(subjectFilter, cb) : listenThreads(cb);
  }, [subjectFilter?.type, subjectFilter?.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return threads.filter(t => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!needle) return true;
      return (
        t.title?.toLowerCase().includes(needle) ||
        t.subjectLabel?.toLowerCase().includes(needle) ||
        t.lastMessageText?.toLowerCase().includes(needle) ||
        t.summary?.toLowerCase().includes(needle) ||
        CATEGORY_LABELS[t.category]?.toLowerCase().includes(needle)
      );
    });
  }, [threads, q, cat]);

  useEffect(() => { if (!activeId && filtered.length) setActiveId(filtered[0].id); }, [filtered, activeId]);
  const active = useMemo(() => threads.find(t => t.id === activeId), [threads, activeId]);

  return (
    <div className="space-y-3">
    {/* Project-level AI summary (staff only, internal) */}
    {isProject && isStaff && (
      <div>
        {!projSummary ? (
          <button onClick={runProjectSummary} disabled={projSummarizing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[#7a5c1e] bg-[#C9A96E]/15 hover:bg-[#C9A96E]/25 disabled:opacity-50">
            {projSummarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Summarize this project's communication
          </button>
        ) : (
          <div className="rounded-md bg-[#C9A96E]/10 border border-[#C9A96E]/20 px-3 py-2 relative">
            <button onClick={() => setProjSummary('')} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7a5c1e] flex items-center gap-1 mb-0.5">
              <Sparkles className="h-3 w-3" /> AI project summary · internal only
            </p>
            <p className="text-xs text-gray-700 whitespace-pre-wrap pr-5">{projSummary}</p>
          </div>
        )}
      </div>
    )}
    <div className={`flex ${height} rounded-xl border border-gray-200 overflow-hidden bg-white`}>
      {/* Thread list */}
      <div className="w-80 border-r border-gray-200 flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-gray-200 space-y-2">
          {isStaff && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setModal('new')} title="New conversation"
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-[#C9A96E] text-white rounded-md hover:bg-[#b8924a] text-xs font-medium">
                <MessageSquarePlus className="h-3.5 w-3.5" /> New
              </button>
              <button onClick={() => setModal('call')} title="Log phone call"
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"><Phone className="h-3.5 w-3.5" /></button>
              <button onClick={() => setModal('meeting')} title="Meeting record"
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-50"><Video className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search conversations…"
                   className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <select value={cat} onChange={e => setCat(e.target.value as any)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white">
              <option value="all">All categories</option>
              {COMM_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-sm text-gray-400 text-center">No conversations{q || cat !== 'all' ? ' match' : ' yet'}.</p>
          ) : filtered.map(t => {
            const Glyph = KIND_GLYPH[t.kind];
            return (
              <button key={t.id} onClick={() => setActiveId(t.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-gray-100 ${t.id === activeId ? 'bg-[#C9A96E]/10' : 'hover:bg-gray-50'}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${SUBJECT_DOT[t.subjectRef?.type] || 'bg-gray-300'}`} />
                  {Glyph && <Glyph className="h-3 w-3 text-gray-400 flex-shrink-0" />}
                  <span className="font-medium text-sm text-[#141414] truncate flex-1">{t.title}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtAgo(t.lastMessageAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 pl-4">
                  <span className="text-[10px] uppercase tracking-wide text-[#C9A96E] flex-shrink-0">{CATEGORY_LABELS[t.category]}</span>
                  {!subjectFilter && t.subjectLabel && <span className="text-[11px] text-gray-400 truncate">· {t.subjectLabel}</span>}
                </div>
                {t.lastMessageText && <p className="text-xs text-gray-500 truncate mt-0.5 pl-4">{t.lastMessageText}</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread view */}
      <div className="flex-1 min-w-0">
        {active
          ? <CommThreadView thread={active} />
          : <div className="flex items-center justify-center h-full text-sm text-gray-400 px-6 text-center">
              {isStaff ? 'Select a conversation, or start a new one.' : 'No conversations yet.'}
            </div>}
      </div>

      {modal === 'new' && <NewThreadModal defaultSubject={subjectFilter} onClose={() => setModal(null)} onCreated={id => { setModal(null); setActiveId(id); }} />}
      {modal === 'call' && <LogPhoneCallModal defaultSubject={subjectFilter} onClose={() => setModal(null)} onCreated={id => { setModal(null); setActiveId(id); }} />}
      {modal === 'meeting' && <LogMeetingModal defaultSubject={subjectFilter} onClose={() => setModal(null)} onCreated={id => { setModal(null); setActiveId(id); }} />}
    </div>
    </div>
  );
}
