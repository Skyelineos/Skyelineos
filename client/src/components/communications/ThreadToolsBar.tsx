// Staff-only tools that sit under a thread header: trade/vendor tagging, plus
// one-click capture of action items + client decisions from the conversation,
// with inline lists of what's already been captured. Hidden for portal users.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  setThreadTrades, loadTaggableVendors,
  type CommThread, type VendorOption,
} from '@/lib/communications/firestore';
import { listenActionItemsForThread, updateActionItem, type ActionItem } from '@/lib/communications/actionItems';
import { listenDecisionsForThread, type ClientDecision } from '@/lib/communications/decisions';
import {
  analyzeThread, summarizeThread, listenOpenExtractions, confirmExtraction, dismissExtraction,
  type AiExtraction,
} from '@/lib/communications/ai';
import { CreateActionItemModal } from './CreateActionItemModal';
import { CreateDecisionModal } from './CreateDecisionModal';
import { Hammer, CheckSquare, Gavel, Plus, X, Check, Sparkles, FileText, Loader2, Search } from 'lucide-react';

const ENTITY_LABEL: Record<string, string> = {
  action_item: 'Action', commitment: 'Commitment', decision_made: 'Decision',
  decision_needed: 'Decision needed', change_order_signal: 'Change order?',
  issue: 'Issue', schedule_change: 'Schedule', vendor_mention: 'Trade',
};

export function ThreadToolsBar({ thread }: { thread: CommThread }) {
  const { user } = useAuth();
  const role = (user as any)?.role;
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Staff';
  const isStaff = role === 'gc' || role === 'admin' || role === 'projectManager';

  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [showTrades, setShowTrades] = useState(false);
  const [tradeQuery, setTradeQuery] = useState('');
  const [tagged, setTagged] = useState<string[]>(thread.tradeIds || []);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [decisions, setDecisions] = useState<ClientDecision[]>([]);
  const [modal, setModal] = useState<null | 'action' | 'decision'>(null);
  // AI (Phase 3)
  const [suggestions, setSuggestions] = useState<AiExtraction[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [aiMsg, setAiMsg] = useState<string>('');

  useEffect(() => { setTagged(thread.tradeIds || []); }, [thread.id, thread.tradeIds]);
  useEffect(() => { setSummary(thread.aiSummary || ''); }, [thread.id, thread.aiSummary]);
  useEffect(() => { if (isStaff) loadTaggableVendors().then(setVendors).catch(() => {}); }, [isStaff]);
  useEffect(() => { if (!isStaff) return; return listenActionItemsForThread(thread.id, setItems); }, [thread.id, isStaff]);
  useEffect(() => { if (!isStaff) return; return listenDecisionsForThread(thread.id, setDecisions); }, [thread.id, isStaff]);
  useEffect(() => { if (!isStaff) return; return listenOpenExtractions(thread.id, setSuggestions); }, [thread.id, isStaff]);

  const vendorById = useMemo(() => Object.fromEntries(vendors.map(v => [v.id, v])), [vendors]);

  if (!isStaff) return null;

  const toggleTrade = async (id: string) => {
    const next = tagged.includes(id) ? tagged.filter(x => x !== id) : [...tagged, id];
    setTagged(next);
    await setThreadTrades(thread.id, next).catch(() => {});
  };

  const runAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true); setAiMsg('');
    try {
      const r = await analyzeThread(thread.id);
      setAiMsg(r.created > 0 ? `${r.created} suggestion${r.created === 1 ? '' : 's'} to review` : 'Nothing new to suggest');
    } catch (e: any) { setAiMsg(e?.message || 'Analyze failed'); }
    finally { setAnalyzing(false); }
  };

  const runSummarize = async () => {
    if (summarizing) return;
    setSummarizing(true); setAiMsg('');
    try { setSummary((await summarizeThread(thread.id)).summary || ''); }
    catch (e: any) { setAiMsg(e?.message || 'Summarize failed'); }
    finally { setSummarizing(false); }
  };

  return (
    <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/60 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Trade tags */}
        {tagged.map(id => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px]">
            <Hammer className="h-3 w-3" /> {vendorById[id]?.name || vendorById[id]?.trade || 'Trade'}
            <button onClick={() => toggleTrade(id)}><X className="h-3 w-3 hover:text-amber-900" /></button>
          </span>
        ))}
        <div className="relative">
          <button onClick={() => { setShowTrades(s => !s); setTradeQuery(''); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 text-[11px] hover:bg-white">
            <Plus className="h-3 w-3" /> Tag trade
          </button>
          {showTrades && (
            <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg">
              <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                <div className="relative">
                  <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={tradeQuery}
                    onChange={e => setTradeQuery(e.target.value)}
                    placeholder="Search trades / vendors…"
                    className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-auto">
                {(() => {
                  const q = tradeQuery.trim().toLowerCase();
                  const list = q
                    ? vendors.filter(v => v.name.toLowerCase().includes(q) || (v.trade || '').toLowerCase().includes(q) || (v.company || '').toLowerCase().includes(q))
                    : vendors;
                  if (vendors.length === 0) return <p className="px-3 py-2 text-xs text-gray-400">No vendors found.</p>;
                  if (list.length === 0) return <p className="px-3 py-2 text-xs text-gray-400">No match for “{tradeQuery}”.</p>;
                  return list.map(v => (
                    <button key={v.id} onClick={() => toggleTrade(v.id)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                      <span className="flex-1 truncate">{v.name}{v.trade ? <span className="text-gray-400"> · {v.trade}</span> : ''}</span>
                      {tagged.includes(v.id) && <Check className="h-3.5 w-3.5 text-[#C9A96E]" />}
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={runAnalyze} disabled={analyzing} title="Let AI suggest action items & decisions from this conversation"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-[#7a5c1e] bg-[#C9A96E]/15 hover:bg-[#C9A96E]/25 disabled:opacity-50">
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Analyze
          </button>
          <button onClick={runSummarize} disabled={summarizing}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-white border border-gray-200 disabled:opacity-50">
            {summarizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Summarize
          </button>
          <button onClick={() => setModal('action')}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-white border border-gray-200">
            <CheckSquare className="h-3.5 w-3.5" /> Action item
          </button>
          <button onClick={() => setModal('decision')}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-white border border-gray-200">
            <Gavel className="h-3.5 w-3.5" /> Decision
          </button>
        </div>
      </div>

      {aiMsg && <p className="text-[11px] text-gray-400">{aiMsg}</p>}

      {/* AI summary (internal-only) */}
      {summary && (
        <div className="rounded-md bg-[#C9A96E]/10 border border-[#C9A96E]/20 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7a5c1e] flex items-center gap-1 mb-0.5">
            <Sparkles className="h-3 w-3" /> AI summary · internal only
          </p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {/* AI suggestions — review queue (nothing is real until confirmed) */}
      {suggestions.length > 0 && (
        <div className="rounded-md border border-[#C9A96E]/30 bg-white">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7a5c1e] flex items-center gap-1 px-3 pt-2">
            <Sparkles className="h-3 w-3" /> AI suggestions — review before saving
          </p>
          <div className="divide-y divide-gray-100">
            {suggestions.map(s => (
              <div key={s.id} className="flex items-start gap-2 px-3 py-2">
                <span className="mt-0.5 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
                  {ENTITY_LABEL[s.entityType] || s.entityType}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700">{s.payload.summary}</p>
                  <p className="text-[10px] text-gray-400">
                    {s.payload.ownerName ? `→ ${s.payload.ownerName} ` : ''}
                    {s.payload.dueDate ? `· due ${s.payload.dueDate} ` : ''}
                    · {Math.round((s.confidence || 0) * 100)}% confident
                    {s.needsClarification ? ' · needs clarification' : ''}
                  </p>
                </div>
                <button onClick={() => confirmExtraction(thread, s, uid, myName).catch(() => {})}
                        title="Confirm — create the real action item / decision"
                        className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-[#C9A96E] text-white hover:bg-[#b8924a]">
                  <Check className="h-3 w-3" /> Confirm
                </button>
                <button onClick={() => dismissExtraction(thread.id, s.id, uid).catch(() => {})}
                        title="Dismiss"
                        className="flex-shrink-0 inline-flex items-center px-1.5 py-1 rounded text-gray-400 hover:bg-gray-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline captured items */}
      {(items.length > 0 || decisions.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {items.map(it => (
            <label key={it.id} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={it.status === 'done'}
                     onChange={e => updateActionItem(it.id, { status: e.target.checked ? 'done' : 'open' })}
                     className="accent-[#C9A96E]" />
              <CheckSquare className="h-3 w-3 text-gray-400" />
              <span className={it.status === 'done' ? 'line-through text-gray-400' : ''}>{it.title}</span>
              {it.assignedToName && <span className="text-gray-400">→ {it.assignedToName}</span>}
              {it.dueDate && <span className="text-gray-400">({it.dueDate})</span>}
            </label>
          ))}
          {decisions.map(d => (
            <span key={d.id} className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
              <Gavel className="h-3 w-3" /> {d.title}{d.relatedRoom ? <span className="text-gray-400"> · {d.relatedRoom}</span> : ''}
            </span>
          ))}
        </div>
      )}

      {modal === 'action' && <CreateActionItemModal thread={thread} onClose={() => setModal(null)} />}
      {modal === 'decision' && <CreateDecisionModal thread={thread} onClose={() => setModal(null)} />}
    </div>
  );
}
