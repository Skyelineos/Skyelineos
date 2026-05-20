import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  writeBatch, query, orderBy, getDocs, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2, Check, X, Plus, TrendingUp, Settings2, FileSignature, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  DEFAULT_TRADES,
  rollupEstimate,
  configFromLegacyMarkup,
  calculateLineFinancials,
} from '@/lib/estimates/markup';
import type { MarkupConfig, BudgetSnapshot } from '@/lib/estimates/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CostGroup {
  id: string;
  name: string;
  order: number;
  isDefault?: boolean;
}

interface CostCode {
  id: string;
  groupId: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  total: number;
  order: number;
  trade?: string;              // links the line to a trade (framing / tile / …) for analytics + per-trade markup
  markupPctOverride?: number;  // optional per-line markup override (used in 0a.2; read-tolerant today)
}

export interface EstimateCostingsTabProps {
  estimateId: string;
  markupPct: number;
  taxPct: number;
  onMarkupChange: (v: number) => void;
  onTaxChange: (v: number) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_GROUPS = [
  'Pre-Build',
  'Site Management',
  'Excavation and Foundation',
  'Framing and Roofing',
  'Windows and Doors',
  'Plumbing / HVAC / Electrical / Gas',
  'Insulation and Drywall',
  'Exterior',
  'Flooring',
  'Interior Design',
  'Appliances and Furniture',
  'Specialty / Custom',
  'Final Steps',
];

const UNITS = ['each', 'sqft', 'linft', 'lump sum', 'hr'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

// ── CostCode row ───────────────────────────────────────────────────────────────

function CostCodeRow({
  code,
  markupConfig,
  onUpdate,
  onDelete,
}: {
  code: CostCode;
  markupConfig: MarkupConfig;
  onUpdate: (id: string, fields: Partial<CostCode>) => void;
  onDelete: (id: string) => void;
}) {
  const handleNum = (field: 'qty' | 'unitCost', raw: string) => {
    const v = parseFloat(raw) || 0;
    const qty = field === 'qty' ? v : code.qty;
    const uc = field === 'unitCost' ? v : code.unitCost;
    onUpdate(code.id, { [field]: v, total: qty * uc });
  };
  const handleMarkupOverride = (raw: string) => {
    // Empty input or NaN → null clears the override (line falls back to trade/default)
    const v = parseFloat(raw);
    onUpdate(code.id, { markupPctOverride: Number.isNaN(v) ? (null as any) : v });
  };

  const fin = calculateLineFinancials(code as any, markupConfig);
  const isOverridden = fin.markupSource === 'line';
  const isTradeRate  = fin.markupSource === 'trade';

  return (
    <div className="grid items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded text-sm"
      style={{ gridTemplateColumns: 'minmax(120px, 1fr) 110px 50px 70px 90px 80px 70px 80px 28px' }}>
      <Input
        className="h-7 text-xs border-transparent hover:border-gray-200 focus:border-gray-300 bg-transparent"
        value={code.description}
        placeholder="Description..."
        onChange={e => onUpdate(code.id, { description: e.target.value })}
        onBlur={e => onUpdate(code.id, { description: e.target.value })}
      />
      <Select value={code.trade || ''} onValueChange={v => onUpdate(code.id, { trade: v === '__unset__' ? '' : v })}>
        <SelectTrigger className="h-7 text-xs border-transparent hover:border-gray-200">
          <SelectValue placeholder="— trade —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unset__">— none —</SelectItem>
          {DEFAULT_TRADES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        className="h-7 text-xs text-right border-transparent hover:border-gray-200 focus:border-gray-300 bg-transparent"
        type="number"
        value={code.qty || ''}
        placeholder="1"
        onChange={e => handleNum('qty', e.target.value)}
        onFocus={e => e.target.select()}
      />
      <Select value={code.unit} onValueChange={v => onUpdate(code.id, { unit: v })}>
        <SelectTrigger className="h-7 text-xs border-transparent hover:border-gray-200">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input
        className="h-7 text-xs text-right border-transparent hover:border-gray-200 focus:border-gray-300 bg-transparent"
        type="number"
        value={code.unitCost || ''}
        placeholder="0.00"
        onChange={e => handleNum('unitCost', e.target.value)}
        onFocus={e => e.target.select()}
      />
      <div className="text-right text-xs font-medium text-gray-700 pr-1">
        {fmtCurrency(code.total)}
      </div>
      {/* Per-line markup % override. Empty = inherited from trade / default. */}
      <Input
        className={
          'h-7 text-xs text-right border-transparent hover:border-gray-200 focus:border-gray-300 bg-transparent ' +
          (isOverridden ? 'font-semibold' : '')
        }
        type="number"
        step={0.5}
        value={typeof code.markupPctOverride === 'number' ? code.markupPctOverride : ''}
        placeholder={String(fin.markupPct)}
        onFocus={e => e.target.select()}
        onChange={e => handleMarkupOverride(e.target.value)}
        title={
          isOverridden  ? 'Per-line override — overrides trade + default'
          : isTradeRate ? `Inherited from trade default (${fin.markupPct}%)`
          :               `Inherited from estimate default (${fin.markupPct}%)`
        }
      />
      {/* Per-line projected profit + margin */}
      <div className="text-right pr-1 leading-tight">
        <div className="text-xs font-medium" style={{ color: '#8B6F3F' }}>{fmtCurrency(fin.profit)}</div>
        <div className="text-[10px] text-gray-400">{fin.marginPct.toFixed(1)}%</div>
      </div>
      <button
        onClick={() => onDelete(code.id)}
        className="flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── CostGroup row ──────────────────────────────────────────────────────────────

function CostGroupRow({
  group,
  index,
  codes,
  markupConfig,
  expanded,
  onToggle,
  onRename,
  onDelete,
  onAddCode,
  onUpdateCode,
  onDeleteCode,
}: {
  group: CostGroup;
  index: number;
  codes: CostCode[];
  markupConfig: MarkupConfig;
  expanded: boolean;
  onToggle: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAddCode: (groupId: string) => void;
  onUpdateCode: (id: string, fields: Partial<CostCode>) => void;
  onDeleteCode: (groupId: string, codeId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const groupTotal = codes.reduce((s, c) => s + (c.total || 0), 0);

  const commitRename = () => {
    if (draft.trim() && draft.trim() !== group.name) {
      onRename(group.id, draft.trim());
    }
    setEditing(false);
  };

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Group header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
        <GripVertical className="w-4 h-4 text-gray-300 cursor-grab flex-shrink-0" />

        <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <span className="text-xs text-gray-400 font-medium w-5 flex-shrink-0">{index + 1}.</span>
          {editing ? (
            <Input
              className="h-6 text-sm font-semibold flex-1"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') { setDraft(group.name); setEditing(false); }
              }}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm font-semibold text-[#C9A96E] flex-1 truncate">{group.name}</span>
          )}
        </button>

        {/* Rename/confirm buttons */}
        {editing ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={commitRename} className="p-1 rounded hover:bg-green-100">
              <Check className="w-3.5 h-3.5 text-green-600" />
            </button>
            <button onClick={() => { setDraft(group.name); setEditing(false); }} className="p-1 rounded hover:bg-gray-200">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); setEditing(true); }}
            className="p-1 rounded hover:bg-gray-200 flex-shrink-0"
          >
            <Pencil className="w-3 h-3 text-gray-400" />
          </button>
        )}

        <span className="text-sm font-semibold text-gray-700 flex-shrink-0 min-w-[100px] text-right">
          {fmtCurrency(groupTotal)}
        </span>

        <button onClick={onToggle} className="flex-shrink-0 ml-1">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-gray-400" />
            : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
      </div>

      {/* Expanded: cost codes */}
      {expanded && (
        <div className="ml-6 border-l border-gray-100">
          {/* Column headers */}
          <div className="grid items-center gap-2 px-2 py-1 text-xs text-gray-400 font-medium"
            style={{ gridTemplateColumns: 'minmax(120px, 1fr) 110px 50px 70px 90px 80px 70px 80px 28px' }}>
            <span>Description</span>
            <span>Trade</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit Cost</span>
            <span className="text-right">Total</span>
            <span className="text-right" title="Per-line markup override. Empty = inherited from trade / default.">Markup %</span>
            <span className="text-right" title="Projected profit on this line · margin %">Profit</span>
            <span />
          </div>

          {codes.length === 0 && (
            <p className="text-xs text-gray-400 px-3 py-2">No cost codes yet.</p>
          )}

          {codes.map(c => (
            <CostCodeRow
              key={c.id}
              code={c}
              markupConfig={markupConfig}
              onUpdate={onUpdateCode}
              onDelete={id => onDeleteCode(group.id, id)}
            />
          ))}

          <button
            onClick={() => onAddCode(group.id)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#C9A96E] px-3 py-2 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add cost code
          </button>
        </div>
      )}
    </div>
  );
}

// ── Markup Config Panel ────────────────────────────────────────────────────────
// Per-trade markup overrides for this estimate. The default % is edited inline
// in the formula bar (existing UI). Adding trade-specific overrides here lets
// Tyler model his in-house trades (framing, tile, sheetrock, etc.) at higher
// margins than the default.

function MarkupConfigPanel({
  config, open, onToggle, onChangeTrade,
}: {
  config: MarkupConfig;
  open: boolean;
  onToggle: () => void;
  onChangeTrade: (trade: string, pct: number | undefined) => void;
}) {
  const [addingTrade, setAddingTrade] = useState<string>('');
  const [addingPct, setAddingPct] = useState<string>('');

  const overrideEntries = Object.entries(config.byTrade ?? {});
  const overrideCount = overrideEntries.length;
  // Trades not yet overridden (available to add)
  const availableTrades = DEFAULT_TRADES.filter(t => !(t.id in (config.byTrade ?? {})));
  const tradeLabel = (id: string) => DEFAULT_TRADES.find(t => t.id === id)?.label ?? id;

  const commitAdd = () => {
    const pct = parseFloat(addingPct);
    if (!addingTrade || Number.isNaN(pct)) return;
    onChangeTrade(addingTrade, pct);
    setAddingTrade('');
    setAddingPct('');
  };

  return (
    <div className="border-b border-gray-200 bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Markup defaults</span>
          <span className="text-xs text-gray-500">
            · Default <span className="font-mono">{config.defaultPct}%</span>
            {overrideCount > 0 && <> · <span className="font-mono">{overrideCount}</span> trade override{overrideCount === 1 ? '' : 's'}</>}
          </span>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs text-gray-500">
            Per-trade markup overrides. Lines tagged with a listed trade use that trade's %. Lines without an override use the default markup (above).
          </p>

          {/* Existing overrides */}
          {overrideEntries.length > 0 && (
            <div className="space-y-1.5">
              {overrideEntries
                .sort(([a], [b]) => tradeLabel(a).localeCompare(tradeLabel(b)))
                .map(([trade, pct]) => (
                  <div key={trade} className="flex items-center gap-2 text-sm">
                    <span className="w-44 text-gray-700">{tradeLabel(trade)}</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={pct}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        onChangeTrade(trade, Number.isNaN(v) ? undefined : v);
                      }}
                      className="h-7 w-20 text-sm"
                    />
                    <span className="text-xs text-gray-400">%</span>
                    <button
                      onClick={() => onChangeTrade(trade, undefined)}
                      className="text-gray-300 hover:text-red-400 transition-colors p-1"
                      title="Remove override (falls back to default)"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* Add new override */}
          {availableTrades.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <Select value={addingTrade} onValueChange={setAddingTrade}>
                <SelectTrigger className="h-7 w-44 text-sm">
                  <SelectValue placeholder="Add trade…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTrades.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={addingPct}
                onChange={e => setAddingPct(e.target.value)}
                placeholder={String(config.defaultPct)}
                className="h-7 w-20 text-sm"
                disabled={!addingTrade}
              />
              <span className="text-xs text-gray-400">%</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={!addingTrade || !addingPct}
                onClick={commitAdd}
              >
                <Plus className="w-3 h-3 mr-1" /> Add
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function EstimateCostingsTab({
  estimateId, markupPct, taxPct, onMarkupChange, onTaxChange,
}: EstimateCostingsTabProps) {
  const [groups, setGroups] = useState<CostGroup[]>([]);
  const [codesByGroup, setCodesByGroup] = useState<Record<string, CostCode[]>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [editingMarkup, setEditingMarkup] = useState(false);
  const [editingTax, setEditingTax] = useState(false);
  const [markupDraft, setMarkupDraft] = useState(String(markupPct));
  const [taxDraft, setTaxDraft] = useState(String(taxPct));
  const [markupConfig, setMarkupConfig] = useState<MarkupConfig>(() => configFromLegacyMarkup(markupPct));
  const [markupPanelOpen, setMarkupPanelOpen] = useState(false);
  const [estimateMeta, setEstimateMeta] = useState<{ projectId?: string; title?: string; signedAt?: string; signedBy?: string }>({});
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signing, setSigning] = useState(false);
  // Pre-sign review state — populated when Sign Contract is clicked AND the
  // estimate has any line items marked Excluded ('ex') or Note ('note').
  // Forces the user to confirm before signing so the client doesn't think
  // they're getting work that's actually not included in the price.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<Array<{ id: string; description: string; status: 'ex' | 'note'; trade?: string; total?: number }>>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  // unsubscribe refs for cost code listeners
  const codeUnsubRefs = useState<Record<string, () => void>>({})[0];

  // ── Subscribe to estimate doc for markupConfig + metadata (live updates) ────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'estimates', estimateId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.markupConfig && typeof data.markupConfig === 'object') {
        setMarkupConfig(data.markupConfig as MarkupConfig);
      } else if (typeof data.markupPct === 'number') {
        // Legacy estimate — derive from flat markupPct; per-trade map empty.
        setMarkupConfig(configFromLegacyMarkup(data.markupPct));
      }
      setEstimateMeta({
        projectId: data.projectId,
        title: data.title,
        signedAt: data.signedAt,
        signedBy: data.signedBy,
      });
    });
    return () => unsub();
  }, [estimateId]);

  // Save handler — writes new markupConfig + keeps legacy markupPct in sync
  // for backward compat with the parent (EstimateBuilder still reads markupPct).
  const saveMarkupConfig = async (next: MarkupConfig) => {
    await updateDoc(doc(db, 'estimates', estimateId), {
      markupConfig: next,
      markupPct: next.defaultPct,
    });
    setMarkupConfig(next);
    if (next.defaultPct !== markupPct) onMarkupChange(next.defaultPct);
  };

  // ── Load groups ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const groupsCol = collection(db, 'estimates', estimateId, 'costGroups');
    const q = query(groupsCol, orderBy('order', 'asc'));

    const unsub = onSnapshot(q, async snap => {
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() } as CostGroup));
      setGroups(loaded);

      // Seed defaults if empty
      if (loaded.length === 0 && !seeded) {
        setSeeded(true);
        const batch = writeBatch(db);
        DEFAULT_GROUPS.forEach((name, i) => {
          const ref = doc(groupsCol);
          batch.set(ref, { name, order: i, isDefault: true, createdAt: serverTimestamp() });
        });
        await batch.commit();
      }
    });

    return () => unsub();
  }, [estimateId]);

  // ── Subscribe to cost codes for each group ───────────────────────────────────
  useEffect(() => {
    const newUnsubs: Record<string, () => void> = {};

    groups.forEach(g => {
      if (codeUnsubRefs[g.id]) return; // already subscribed

      const codesCol = collection(db, 'estimates', estimateId, 'costGroups', g.id, 'costCodes');
      const q = query(codesCol, orderBy('order', 'asc'));
      const unsub = onSnapshot(q, snap => {
        const codes = snap.docs.map(d => ({ id: d.id, groupId: g.id, ...d.data() } as CostCode));
        setCodesByGroup(prev => ({ ...prev, [g.id]: codes }));
      });
      codeUnsubRefs[g.id] = unsub;
      newUnsubs[g.id] = unsub;
    });

    return () => {
      Object.values(newUnsubs).forEach(u => u());
      Object.keys(newUnsubs).forEach(k => { delete codeUnsubRefs[k]; });
    };
  }, [groups, estimateId]);

  // ── Derived totals ────────────────────────────────────────────────────────────
  // Rollup uses markupConfig — per-trade overrides + line-level overrides
  // resolve correctly. Backward compatible: a legacy estimate without
  // markupConfig falls through to configFromLegacyMarkup(markupPct).
  const allCodes = Object.values(codesByGroup).flat();
  const rollup = rollupEstimate(allCodes as any, markupConfig);
  const builderCost = rollup.totalCost;
  const markupAmt = rollup.totalMarkup;
  const totalCost = rollup.totalPrice;
  const taxAmt = totalCost * (taxPct / 100);
  const ownerPrice = totalCost + taxAmt;
  const projectedProfit = rollup.totalProfit;       // === markupAmt (named for clarity)
  const marginPct = rollup.marginPct;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const toggleGroup = (id: string) => setExpandedGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const renameGroup = async (id: string, name: string) => {
    await updateDoc(doc(db, 'estimates', estimateId, 'costGroups', id), { name });
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this cost group and all its cost codes?')) return;
    // delete subcollection codes first
    const codesSnap = await getDocs(
      collection(db, 'estimates', estimateId, 'costGroups', id, 'costCodes')
    );
    const batch = writeBatch(db);
    codesSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(doc(db, 'estimates', estimateId, 'costGroups', id));
    await batch.commit();
  };

  const addGroup = async () => {
    const order = groups.length;
    await addDoc(collection(db, 'estimates', estimateId, 'costGroups'), {
      name: 'New Group',
      order,
      isDefault: false,
      createdAt: serverTimestamp(),
    });
  };

  const addCode = async (groupId: string) => {
    const existing = codesByGroup[groupId] || [];
    await addDoc(
      collection(db, 'estimates', estimateId, 'costGroups', groupId, 'costCodes'),
      { description: '', qty: 1, unit: 'each', unitCost: 0, total: 0, order: existing.length, trade: '', createdAt: serverTimestamp() }
    );
    setExpandedGroups(prev => new Set([...prev, groupId]));
  };

  const updateCode = useCallback(async (groupId: string, codeId: string, fields: Partial<CostCode>) => {
    await updateDoc(
      doc(db, 'estimates', estimateId, 'costGroups', groupId, 'costCodes', codeId),
      fields
    );
  }, [estimateId]);

  // updateCode wrapper that takes just (id, fields) — groups found from codesByGroup
  const handleUpdateCode = useCallback((codeId: string, fields: Partial<CostCode>) => {
    const groupId = Object.keys(codesByGroup).find(gid =>
      codesByGroup[gid]?.some(c => c.id === codeId)
    );
    if (groupId) updateCode(groupId, codeId, fields);
  }, [codesByGroup, updateCode]);

  const deleteCode = async (groupId: string, codeId: string) => {
    await deleteDoc(doc(db, 'estimates', estimateId, 'costGroups', groupId, 'costCodes', codeId));
  };

  const commitMarkup = () => {
    const v = parseFloat(markupDraft) || 0;
    saveMarkupConfig({ ...markupConfig, defaultPct: v });
    setEditingMarkup(false);
  };

  // ── Sign Contract ─────────────────────────────────────────────────────────
  // Snapshots the current estimate as the immutable project budget baseline.
  // Subsequent estimate edits will not modify the budget — that's what change
  // orders are for. The Finance dashboard reads projects/{id}.budget for
  // target profit + variance calculations.
  // Open the Sign dialog after running the pre-sign review on Details-tab line
  // items. If there are Ex/Note items, surface them first so Tyler decides
  // whether to include them, remove them, or sign as-is.
  const handleClickSign = async () => {
    try {
      const estSnap = await getDoc(doc(db, 'estimates', estimateId));
      const lineItems = (estSnap.exists() ? (estSnap.data() as any).lineItems : []) as Array<any> || [];
      const flagged = lineItems
        .filter(li => li && (li.lineStatus === 'ex' || li.lineStatus === 'note'))
        .map(li => ({
          id: li.id,
          description: li.description || '(untitled)',
          status: li.lineStatus as 'ex' | 'note',
          trade: li.trade,
          total: typeof li.total === 'number' ? li.total : (li.qty || 0) * (li.unitCost || 0),
        }));
      if (flagged.length > 0) {
        setReviewItems(flagged);
        setReviewOpen(true);
        return;
      }
    } catch { /* if read fails, fall through and let the actual sign attempt surface the error */ }
    setSignDialogOpen(true);
  };

  // Apply a bulk resolution on flagged Ex/Note items before signing.
  // 'include' = set lineStatus to 'inc' (counts in total)
  // 'remove'  = delete those line items
  // 'keep'    = leave as-is (proceed despite)
  const applyReviewResolution = async (action: 'include' | 'remove' | 'keep') => {
    if (action !== 'keep') {
      try {
        const estSnap = await getDoc(doc(db, 'estimates', estimateId));
        if (estSnap.exists()) {
          const data = estSnap.data() as any;
          const lineItems: any[] = Array.isArray(data.lineItems) ? data.lineItems : [];
          const flaggedIds = new Set(reviewItems.map(r => r.id));
          let newLineItems: any[];
          if (action === 'remove') {
            newLineItems = lineItems.filter(li => !flaggedIds.has(li?.id));
          } else { // include
            newLineItems = lineItems.map(li => flaggedIds.has(li?.id) ? { ...li, lineStatus: 'inc' } : li);
          }
          await updateDoc(doc(db, 'estimates', estimateId), { lineItems: newLineItems });
        }
      } catch (e: any) {
        toast({ title: 'Could not apply resolution', description: e.message, variant: 'destructive' });
        return;
      }
    }
    setReviewOpen(false);
    setSignDialogOpen(true);
  };

  const handleSignContract = async () => {
    if (!estimateMeta.projectId) {
      toast({
        title: 'No project linked',
        description: 'Link this estimate to a project before signing the contract.',
        variant: 'destructive',
      });
      return;
    }
    setSigning(true);
    try {
      const flatLines = Object.values(codesByGroup).flat();
      const snapshot: BudgetSnapshot = {
        signedAt: new Date().toISOString(),
        signedBy: user?.id?.toString() || user?.email || 'unknown',
        sourceEstimateId: estimateId,
        contractTotal: totalCost,
        targetProfit: projectedProfit,
        targetMarginPct: marginPct,
        lineItems: flatLines.map(c => ({
          ...(c as any),
          groupName: groups.find(g => g.id === c.groupId)?.name ?? '',
        })),
        markupConfig,
        taxPct,
      };
      await updateDoc(doc(db, 'projects', estimateMeta.projectId), { budget: snapshot });
      await updateDoc(doc(db, 'estimates', estimateId), {
        status: 'accepted',
        signedAt: snapshot.signedAt,
        signedBy: snapshot.signedBy,
      });
      setSignDialogOpen(false);
      toast({
        title: 'Contract signed',
        description: `${fmtCurrency(snapshot.contractTotal)} locked as the project budget. Change orders from this point on.`,
      });
    } catch (e: any) {
      toast({ title: 'Sign failed', description: e.message, variant: 'destructive' });
    } finally {
      setSigning(false);
    }
  };

  const setTradeMarkup = (trade: string, pct: number | undefined) => {
    const next: MarkupConfig = {
      ...markupConfig,
      byTrade: { ...markupConfig.byTrade },
    };
    if (pct === undefined || Number.isNaN(pct)) {
      delete next.byTrade[trade];
    } else {
      next.byTrade[trade] = pct;
    }
    saveMarkupConfig(next);
  };

  const commitTax = () => {
    const v = parseFloat(taxDraft) || 0;
    onTaxChange(v);
    setEditingTax(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* Formula bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
        {/* Builder Cost */}
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-0.5">Builder Cost</p>
          <p className="font-semibold text-gray-900">{fmtCurrency(builderCost)}</p>
        </div>

        <span className="text-gray-400 font-bold">+</span>

        {/* Markup */}
        <div className="text-center">
          <div className="flex items-center gap-1 mb-0.5">
            <p className="text-xs text-gray-500">Markup</p>
            {editingMarkup ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="number"
                  value={markupDraft}
                  onChange={e => setMarkupDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitMarkup(); if (e.key === 'Escape') setEditingMarkup(false); }}
                  className="w-14 h-5 text-xs border border-gray-300 rounded px-1 text-center"
                />
                <span className="text-xs text-gray-400">%</span>
                <button onClick={commitMarkup} className="p-0.5 hover:bg-green-100 rounded">
                  <Check className="w-3 h-3 text-green-600" />
                </button>
              </div>
            ) : (
              <button onClick={() => { setMarkupDraft(String(markupPct)); setEditingMarkup(true); }}>
                <Pencil className="w-3 h-3 text-gray-400 hover:text-[#C9A96E]" />
              </button>
            )}
          </div>
          <p className="font-semibold text-gray-900">{fmtCurrency(markupAmt)}</p>
        </div>

        <span className="text-gray-400 font-bold">=</span>

        {/* Total Cost */}
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-0.5">Total Cost</p>
          <p className="font-semibold text-gray-900">{fmtCurrency(totalCost)}</p>
        </div>

        <span className="text-gray-400 font-bold">+</span>

        {/* Tax */}
        <div className="text-center">
          <div className="flex items-center gap-1 mb-0.5">
            <p className="text-xs text-gray-500">Tax</p>
            {editingTax ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="number"
                  value={taxDraft}
                  onChange={e => setTaxDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitTax(); if (e.key === 'Escape') setEditingTax(false); }}
                  className="w-14 h-5 text-xs border border-gray-300 rounded px-1 text-center"
                />
                <span className="text-xs text-gray-400">%</span>
                <button onClick={commitTax} className="p-0.5 hover:bg-green-100 rounded">
                  <Check className="w-3 h-3 text-green-600" />
                </button>
              </div>
            ) : (
              <button onClick={() => { setTaxDraft(String(taxPct)); setEditingTax(true); }}>
                <Pencil className="w-3 h-3 text-gray-400 hover:text-[#C9A96E]" />
              </button>
            )}
          </div>
          <p className="font-semibold text-gray-900">{fmtCurrency(taxAmt)}</p>
        </div>

        <span className="text-gray-400 font-bold">=</span>

        {/* Owner Price */}
        <div className="text-center bg-white border border-gray-200 rounded-lg px-3 py-1">
          <p className="text-xs text-gray-500 mb-0.5">Owner Price (Inc Tax)</p>
          <p className="font-bold text-gray-900 text-base">{fmtCurrency(ownerPrice)}</p>
        </div>

        {/* Projected Profit — Tyler's primary decision metric */}
        <div className="text-center rounded-lg px-3 py-1 border" style={{ backgroundColor: 'rgba(201,169,110,0.10)', borderColor: 'rgba(201,169,110,0.5)' }}>
          <p className="text-xs text-gray-600 mb-0.5 flex items-center gap-1 justify-center">
            <TrendingUp className="w-3 h-3" style={{ color: '#C9A96E' }} />
            Projected Profit
          </p>
          <p className="font-bold text-base" style={{ color: '#141414' }}>
            {fmtCurrency(projectedProfit)}
            <span className="text-xs font-medium ml-1.5 text-gray-600">· {marginPct.toFixed(1)}%</span>
          </p>
        </div>
      </div>

      {/* Per-trade markup config panel */}
      <MarkupConfigPanel
        config={markupConfig}
        open={markupPanelOpen}
        onToggle={() => setMarkupPanelOpen(v => !v)}
        onChangeTrade={setTradeMarkup}
      />

      {/* Cost groups list */}
      <div className="divide-y divide-gray-100">
        {groups.map((g, i) => (
          <CostGroupRow
            key={g.id}
            group={g}
            index={i}
            codes={codesByGroup[g.id] || []}
            markupConfig={markupConfig}
            expanded={expandedGroups.has(g.id)}
            onToggle={() => toggleGroup(g.id)}
            onRename={renameGroup}
            onDelete={deleteGroup}
            onAddCode={addCode}
            onUpdateCode={handleUpdateCode}
            onDeleteCode={deleteCode}
          />
        ))}
      </div>

      {groups.length === 0 && (
        <div className="text-center py-10 text-gray-400 text-sm">Loading cost groups…</div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => {
              const lastGroup = groups[groups.length - 1];
              if (lastGroup) addCode(lastGroup.id);
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Cost Code
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={addGroup}
          >
            <Plus className="w-3.5 h-3.5" /> Cost Group
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {estimateMeta.signedAt ? (
            <div className="flex items-center gap-1.5 text-sm text-green-700">
              <Check className="w-4 h-4" />
              <span className="font-medium">
                Contract signed {new Date(estimateMeta.signedAt).toLocaleDateString()}
              </span>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={handleClickSign}
              disabled={builderCost === 0}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              className="gap-1.5 text-xs hover:opacity-90"
              title={builderCost === 0 ? 'Add cost codes before signing' : 'Lock this estimate as the project budget'}
            >
              <FileSignature className="w-3.5 h-3.5" /> Sign Contract
            </Button>
          )}
        </div>
      </div>

      {/* Sign Contract confirmation dialog */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="w-5 h-5" style={{ color: '#C9A96E' }} />
              Sign Contract
            </DialogTitle>
            <DialogDescription>
              Signing snapshots the current estimate as <strong>{estimateMeta.title || 'this project'}</strong>'s budget baseline.
              Estimate edits after this point won't change the budget — use <strong>change orders</strong> instead.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <div className="bg-gray-50 rounded-md p-3 space-y-1.5">
              <SignSummaryRow label="Builder cost"        value={fmtCurrency(builderCost)} />
              <SignSummaryRow label="Markup ($)"          value={fmtCurrency(markupAmt)} />
              <SignSummaryRow label="Contract total"      value={fmtCurrency(totalCost)} bold />
              <div className="h-px bg-gray-200 my-1" />
              <SignSummaryRow label="Projected profit"    value={fmtCurrency(projectedProfit)} accent />
              <SignSummaryRow label="Projected margin"    value={`${marginPct.toFixed(1)}%`} accent />
            </div>
            {!estimateMeta.projectId && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-xs text-amber-900">
                ⚠️ This estimate isn't linked to a project. Link it first — Sign Contract writes the budget to the project doc.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialogOpen(false)} disabled={signing}>
              Cancel
            </Button>
            <Button
              onClick={handleSignContract}
              disabled={!estimateMeta.projectId || signing}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              className="hover:opacity-90"
            >
              {signing ? 'Signing…' : 'Sign Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pre-sign review — surfaces any line items marked Excluded or Note
          before the contract is signed. Forces an explicit decision so the
          client doesn't think excluded items are part of the price. */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              {reviewItems.length} item{reviewItems.length === 1 ? '' : 's'} not in price
            </DialogTitle>
            <DialogDescription>
              These line items are marked <strong>Excluded</strong> or <strong>Note only</strong>, so they don't count toward the owner price. Decide before signing — once locked, scope changes go through change orders.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto border rounded-md divide-y" style={{ borderColor: '#E5E7EB' }}>
            {reviewItems.map(it => (
              <div key={it.id} className="px-3 py-2 flex items-start gap-2 text-sm">
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
                  style={it.status === 'ex'
                    ? { backgroundColor: 'rgba(220,38,38,0.12)', color: '#B91C1C' }
                    : { backgroundColor: 'rgba(59,130,246,0.12)', color: '#1D4ED8' }}
                >
                  {it.status === 'ex' ? 'EX' : 'NOTE'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" style={{ color: '#141414' }}>{it.description}</p>
                  {it.trade && <p className="text-[11px] text-gray-500">{it.trade}{it.total ? ` · ${fmtCurrency(it.total)}` : ''}</p>}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex-wrap gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Back to editing</Button>
            <Button variant="outline" onClick={() => applyReviewResolution('remove')}>
              Remove all from estimate
            </Button>
            <Button
              onClick={() => applyReviewResolution('include')}
              style={{ backgroundColor: '#0F6F40', color: 'white' }}
              className="hover:opacity-90"
            >
              Include all in price
            </Button>
            <Button
              variant="outline"
              onClick={() => applyReviewResolution('keep')}
              className="text-amber-700 border-amber-300"
            >
              Sign anyway (keep as not-in-price)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignSummaryRow({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={accent ? 'text-gray-600' : 'text-gray-600'}>{label}</span>
      <span
        className={[bold ? 'font-bold' : 'font-medium'].join(' ')}
        style={accent ? { color: '#8B6F3F' } : { color: '#141414' }}
      >
        {value}
      </span>
    </div>
  );
}
