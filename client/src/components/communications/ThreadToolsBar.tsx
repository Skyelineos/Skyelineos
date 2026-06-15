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
import { CreateActionItemModal } from './CreateActionItemModal';
import { CreateDecisionModal } from './CreateDecisionModal';
import { Hammer, CheckSquare, Gavel, Plus, X, Check } from 'lucide-react';

export function ThreadToolsBar({ thread }: { thread: CommThread }) {
  const { user } = useAuth();
  const role = (user as any)?.role;
  const isStaff = role === 'gc' || role === 'admin' || role === 'projectManager';

  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [showTrades, setShowTrades] = useState(false);
  const [tagged, setTagged] = useState<string[]>(thread.tradeIds || []);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [decisions, setDecisions] = useState<ClientDecision[]>([]);
  const [modal, setModal] = useState<null | 'action' | 'decision'>(null);

  useEffect(() => { setTagged(thread.tradeIds || []); }, [thread.id, thread.tradeIds]);
  useEffect(() => { if (isStaff) loadTaggableVendors().then(setVendors).catch(() => {}); }, [isStaff]);
  useEffect(() => { if (!isStaff) return; return listenActionItemsForThread(thread.id, setItems); }, [thread.id, isStaff]);
  useEffect(() => { if (!isStaff) return; return listenDecisionsForThread(thread.id, setDecisions); }, [thread.id, isStaff]);

  const vendorById = useMemo(() => Object.fromEntries(vendors.map(v => [v.id, v])), [vendors]);

  if (!isStaff) return null;

  const toggleTrade = async (id: string) => {
    const next = tagged.includes(id) ? tagged.filter(x => x !== id) : [...tagged, id];
    setTagged(next);
    await setThreadTrades(thread.id, next).catch(() => {});
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
          <button onClick={() => setShowTrades(s => !s)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-500 text-[11px] hover:bg-white">
            <Plus className="h-3 w-3" /> Tag trade
          </button>
          {showTrades && (
            <div className="absolute z-50 mt-1 w-60 max-h-60 overflow-auto bg-white border border-gray-200 rounded-md shadow-lg">
              {vendors.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">No vendors found.</p> : vendors.map(v => (
                <button key={v.id} onClick={() => toggleTrade(v.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                  <span className="flex-1 truncate">{v.name}{v.trade ? <span className="text-gray-400"> · {v.trade}</span> : ''}</span>
                  {tagged.includes(v.id) && <Check className="h-3.5 w-3.5 text-[#C9A96E]" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
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
