import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  writeBatch, query, orderBy, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, GripVertical, Pencil, Trash2, Check, X, Plus } from 'lucide-react';

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
  onUpdate,
  onDelete,
}: {
  code: CostCode;
  onUpdate: (id: string, fields: Partial<CostCode>) => void;
  onDelete: (id: string) => void;
}) {
  const handleNum = (field: 'qty' | 'unitCost', raw: string) => {
    const v = parseFloat(raw) || 0;
    const qty = field === 'qty' ? v : code.qty;
    const uc = field === 'unitCost' ? v : code.unitCost;
    onUpdate(code.id, { [field]: v, total: qty * uc });
  };

  return (
    <div className="grid items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded text-sm"
      style={{ gridTemplateColumns: '1fr 64px 100px 110px 100px 28px' }}>
      <Input
        className="h-7 text-xs border-transparent hover:border-gray-200 focus:border-gray-300 bg-transparent"
        value={code.description}
        placeholder="Description..."
        onChange={e => onUpdate(code.id, { description: e.target.value })}
        onBlur={e => onUpdate(code.id, { description: e.target.value })}
      />
      <Input
        className="h-7 text-xs text-right border-transparent hover:border-gray-200 focus:border-gray-300 bg-transparent"
        type="number"
        value={code.qty || ''}
        placeholder="1"
        onChange={e => handleNum('qty', e.target.value)}
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
      />
      <div className="text-right text-sm font-medium text-gray-700 pr-1">
        {fmtCurrency(code.total)}
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
            style={{ gridTemplateColumns: '1fr 64px 100px 110px 100px 28px' }}>
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span>Unit</span>
            <span className="text-right">Unit Cost</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {codes.length === 0 && (
            <p className="text-xs text-gray-400 px-3 py-2">No cost codes yet.</p>
          )}

          {codes.map(c => (
            <CostCodeRow
              key={c.id}
              code={c}
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
  // unsubscribe refs for cost code listeners
  const codeUnsubRefs = useState<Record<string, () => void>>({})[0];

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
  const builderCost = Object.values(codesByGroup)
    .flat()
    .reduce((s, c) => s + (c.total || 0), 0);
  const markupAmt = builderCost * (markupPct / 100);
  const totalCost = builderCost + markupAmt;
  const taxAmt = totalCost * (taxPct / 100);
  const ownerPrice = totalCost + taxAmt;

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
      { description: '', qty: 1, unit: 'each', unitCost: 0, total: 0, order: existing.length, createdAt: serverTimestamp() }
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
    onMarkupChange(v);
    setEditingMarkup(false);
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
      </div>

      {/* Cost groups list */}
      <div className="divide-y divide-gray-100">
        {groups.map((g, i) => (
          <CostGroupRow
            key={g.id}
            group={g}
            index={i}
            codes={codesByGroup[g.id] || []}
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
      <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3">
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
    </div>
  );
}
