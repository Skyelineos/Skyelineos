// Communication Center — the unified hub (Phase 1). One place to see every
// conversation across leads, clients, and projects, filtered by category /
// visibility / subject and searchable by text. This is the GC-facing pillar;
// portals reuse the same `communications` store through scoped, visibility-gated
// views.
//
// Phase 1 search is a client-side filter over the most-recently-active threads
// and their previews — the foundation. A backend/full-text index is deferred
// (see docs/communication-center-schema.md "Search").

import { useEffect, useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  listenThreads, CATEGORY_LABELS, COMM_CATEGORIES,
  type CommThread, type CommCategory,
} from '@/lib/communications/firestore';
import { CommThreadView } from '@/components/communications/CommThreadView';
import { NewThreadModal } from '@/components/communications/NewThreadModal';
import { MessageSquarePlus, Search, Loader2, Filter } from 'lucide-react';

function fmtAgo(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const SUBJECT_DOT: Record<string, string> = {
  lead: 'bg-green-500', client: 'bg-blue-500', project: 'bg-[#C9A96E]',
};

export default function CommunicationCenter() {
  const searchStr = useSearch();
  const [threads, setThreads] = useState<CommThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CommCategory | 'all'>('all');
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    return listenThreads(rows => { setThreads(rows); setLoading(false); });
  }, []);

  // Deep-link support: /communications?thread=<id> (used by mention notifications).
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const t = params.get('thread');
    if (t) setActiveId(t);
  }, [searchStr]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return threads.filter(t => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!needle) return true;
      return (
        t.title?.toLowerCase().includes(needle) ||
        t.subjectLabel?.toLowerCase().includes(needle) ||
        t.lastMessageText?.toLowerCase().includes(needle) ||
        CATEGORY_LABELS[t.category]?.toLowerCase().includes(needle)
      );
    });
  }, [threads, q, cat]);

  useEffect(() => {
    if (!activeId && filtered.length) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  const active = useMemo(() => threads.find(t => t.id === activeId), [threads, activeId]);

  return (
    <AppLayout>
      <div className="h-full">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold font-heading text-brand-black">Communication Center</h1>
            <p className="text-brand-dark-gray-blue">Every conversation — lead to warranty — in one place.</p>
          </div>
          <button onClick={() => setShowNew(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#C9A96E] text-white rounded-md hover:bg-[#b8924a] text-sm font-medium">
            <MessageSquarePlus className="h-4 w-4" /> New conversation
          </button>
        </div>

        <div className="flex h-[640px] rounded-xl border border-gray-200 overflow-hidden bg-white">
          {/* Thread list */}
          <div className="w-80 border-r border-gray-200 flex flex-col flex-shrink-0">
            <div className="p-3 border-b border-gray-200 space-y-2">
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
              ) : filtered.map(t => (
                <button key={t.id} onClick={() => setActiveId(t.id)}
                        className={`w-full text-left px-3 py-2.5 border-b border-gray-100 ${t.id === activeId ? 'bg-[#C9A96E]/10' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full flex-shrink-0 ${SUBJECT_DOT[t.subjectRef?.type] || 'bg-gray-300'}`} />
                    <span className="font-medium text-sm text-[#141414] truncate flex-1">{t.title}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{fmtAgo(t.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 pl-4">
                    <span className="text-[10px] uppercase tracking-wide text-[#C9A96E] flex-shrink-0">{CATEGORY_LABELS[t.category]}</span>
                    {t.subjectLabel && <span className="text-[11px] text-gray-400 truncate">· {t.subjectLabel}</span>}
                  </div>
                  {t.lastMessageText && <p className="text-xs text-gray-500 truncate mt-0.5 pl-4">{t.lastMessageText}</p>}
                </button>
              ))}
            </div>
          </div>

          {/* Thread view */}
          <div className="flex-1 min-w-0">
            {active
              ? <CommThreadView thread={active} />
              : <div className="flex items-center justify-center h-full text-sm text-gray-400">Select a conversation, or start a new one.</div>}
          </div>
        </div>
      </div>

      {showNew && (
        <NewThreadModal
          onClose={() => setShowNew(false)}
          onCreated={id => { setShowNew(false); setActiveId(id); }}
        />
      )}
    </AppLayout>
  );
}
