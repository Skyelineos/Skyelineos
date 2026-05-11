import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  serverTimestamp, query, orderBy, where, getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { GmailBidImporter } from '@/components/estimates/GmailBidImporter';
import { EstimateCostingsTab } from '@/components/estimates/EstimateCostingsTab';
import {
  Plus, Search, MoreVertical, ChevronDown, ChevronRight,
  Trash2, Edit2, FileText, DollarSign, User, Send,
  CheckCircle2, XCircle, Clock, Copy, X, Building2, Mail,
  Hammer, Zap, Droplets, Paintbrush, Thermometer, Package,
  TreePine, Layers, Grid3X3, ShieldCheck, Ruler, Scissors,
  Palette, AlertCircle, SlidersHorizontal, Lock, Eye, TrendingUp,
} from 'lucide-react';
import { lazy, Suspense } from 'react';
import { MinimalSpinner } from '@/components/layout/MinimalSpinner';

const TakeoffStudio = lazy(() => import('@/components/takeoff/TakeoffStudio'));
const PortalBidsPanel = lazy(() =>
  import('@/components/bidding/PortalBidsPanel').then(m => ({ default: m.PortalBidsPanel })),
);

// ─── Types ────────────────────────────────────────────────────────────────────

type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'revised';
type PipelineStage = 'pending' | 'in_progress' | 'waiting_quotes' | 'internal_approval' | 'archived';

interface LineItem {
  id: string;
  trade: string;
  description: string;
  qty: number;
  unit: string;
  /** What the client sees per-unit on the estimate. Always client-facing. */
  unitCost: number;
  /** What the sub charges Skyeline per unit. Internal — never shown to client. */
  subCost?: number;
  total: number;
  subId?: string;
  subName?: string;
  notes?: string;
  fromEmail?: boolean;
  // Takeoff + selection fields
  takeoffMeasurementId?: string;
  needsSelection?: boolean;
  selectionStatus?: 'pending' | 'designer_selected' | 'client_approved';
  splitLaborMaterial?: boolean;
  laborPct?: number;   // 0-100, what % of unitCost is labor
}

interface Estimate {
  id: string;
  title: string;
  clientId?: string;
  clientName?: string;
  jobAddress?: string;
  projectId?: string;
  projectName?: string;
  status: EstimateStatus;
  pipelineStage?: PipelineStage;
  lineItems: LineItem[];
  subtotal: number;
  overhead: number;      // percent
  profit: number;        // percent
  totalAmount: number;
  markup?: number;       // percent — for JACK-style costings tab
  tax?: number;          // percent — for JACK-style costings tab
  notes?: string;
  validUntil?: string;
  sentAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

type EstimateTab = 'details' | 'costings' | 'bid_packages' | 'takeoffs';

interface CRMClient {
  id: string;
  name: string;
  email?: string;
  jobAddress?: string;
  city?: string;
  projectType?: string;
}

// ─── Trade Categories ─────────────────────────────────────────────────────────

const TRADES = [
  { key: 'general',     label: 'General Conditions',  icon: Building2 },
  { key: 'site',        label: 'Site Work',            icon: TreePine  },
  { key: 'concrete',    label: 'Concrete / Foundation',icon: Layers    },
  { key: 'framing',     label: 'Framing',              icon: Hammer    },
  { key: 'roofing',     label: 'Roofing',              icon: Grid3X3   },
  { key: 'electrical',  label: 'Electrical',           icon: Zap       },
  { key: 'plumbing',    label: 'Plumbing',             icon: Droplets  },
  { key: 'hvac',        label: 'HVAC',                 icon: Thermometer},
  { key: 'insulation',  label: 'Insulation',           icon: ShieldCheck},
  { key: 'drywall',     label: 'Drywall',              icon: Layers    },
  { key: 'flooring',    label: 'Flooring',             icon: Grid3X3   },
  { key: 'paint',       label: 'Paint',                icon: Paintbrush},
  { key: 'cabinets',    label: 'Cabinets / Millwork',  icon: Package   },
  { key: 'tile',        label: 'Tile',                 icon: Grid3X3   },
  { key: 'exterior',    label: 'Exterior Finishes',    icon: Building2 },
  { key: 'landscaping', label: 'Landscaping',          icon: TreePine  },
  { key: 'other',       label: 'Other',                icon: Package   },
];

const UNITS = ['lump sum', 'sq ft', 'lin ft', 'ea', 'hr', 'day', 'sq yd', 'cu yd'];

const STATUS_CONFIG: Record<EstimateStatus, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',         color: '#6b7280', bg: '#f3f4f6' },
  sent:     { label: 'Sent',          color: '#3b82f6', bg: '#eff6ff' },
  accepted: { label: 'Accepted',      color: '#10b981', bg: '#ecfdf5' },
  rejected: { label: 'Rejected',      color: '#ef4444', bg: '#fef2f2' },
  revised:  { label: 'Needs Revision',color: '#f59e0b', bg: '#fffbeb' },
};

// ─── Pipeline config ──────────────────────────────────────────────────────────

const PIPELINE_COLUMNS: { stage: PipelineStage; label: string; accent: string }[] = [
  { stage: 'pending',           label: 'Pending',            accent: '#3b82f6' },
  { stage: 'in_progress',       label: 'In Progress',        accent: '#ef4444' },
  { stage: 'waiting_quotes',    label: 'Waiting for Quotes', accent: '#f97316' },
  { stage: 'internal_approval', label: 'Internal Approval',  accent: '#111827' },
  { stage: 'archived',          label: 'Archived',           accent: '#f97316' },
];

function getPipelineStage(est: Estimate): PipelineStage {
  if (est.pipelineStage) return est.pipelineStage;
  const map: Record<EstimateStatus, PipelineStage> = {
    draft: 'pending', sent: 'in_progress',
    accepted: 'internal_approval', rejected: 'archived', revised: 'in_progress',
  };
  return map[est.status] ?? 'pending';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtFull(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function calcTotals(items: LineItem[], overhead: number, profit: number) {
  const subtotal = items.reduce((s, i) => s + (i.total ?? 0), 0);
  // Internal subtotal at sub costs (what Skyeline actually pays).
  const internalSubtotal = items.reduce((s, i) => s + (i.qty || 0) * (i.subCost ?? 0), 0);
  // Direct markup: difference between what the client pays per line and what
  // the sub charges Skyeline. This is "before-overhead" gross margin.
  const lineMarkup = Math.max(0, subtotal - internalSubtotal);
  const overheadAmt = subtotal * (overhead / 100);
  const profitAmt = (subtotal + overheadAmt) * (profit / 100);
  const total = subtotal + overheadAmt + profitAmt;
  // Total Skyeline keeps = line markup + overhead + profit % (overhead is also
  // typically Skyeline's pocket since subs don't charge a separate OH). Show
  // both honest line-level margin and the all-in profit once OH/profit % apply.
  const grossProfit = total - internalSubtotal;
  const grossMarginPct = total > 0 ? (grossProfit / total) * 100 : 0;
  return {
    subtotal,
    internalSubtotal,
    lineMarkup,
    overheadAmt,
    profitAmt,
    grossProfit,
    grossMarginPct,
    total,
  };
}

function newLineItem(trade = 'framing'): LineItem {
  return { id: crypto.randomUUID(), trade, description: '', qty: 1, unit: 'lump sum', unitCost: 0, subCost: 0, total: 0 };
}

// ─── Line Item Row ─────────────────────────────────────────────────────────────

const SELECTION_STATUS_LABEL: Record<string, string> = {
  pending:           'Needs Selection',
  designer_selected: 'Designer Selected',
  client_approved:   'Client Approved',
};
const SELECTION_STATUS_COLOR: Record<string, string> = {
  pending:           'bg-amber-100 text-amber-800',
  designer_selected: 'bg-blue-100 text-blue-800',
  client_approved:   'bg-green-100 text-green-800',
};

function LineItemRow({
  item, onChange, onDelete, onMeasure,
}: {
  item: LineItem;
  onChange: (id: string, field: string, value: any) => void;
  onDelete: (id: string) => void;
  onMeasure: (id: string) => void;
}) {
  const handleNum = (field: string, raw: string) => {
    const v = parseFloat(raw) || 0;
    if (field === 'qty' || field === 'unitCost') {
      const qty = field === 'qty' ? v : item.qty;
      const uc  = field === 'unitCost' ? v : item.unitCost;
      onChange(item.id, field, v);
      onChange(item.id, 'total', qty * uc);
    } else if (field === 'subCost') {
      onChange(item.id, field, v);
    } else {
      onChange(item.id, field, v);
    }
  };

  const laborAmt = item.splitLaborMaterial && item.laborPct != null
    ? item.total * (item.laborPct / 100)
    : null;
  const materialAmt = laborAmt != null ? item.total - laborAmt : null;

  // Per-line internal vs client math.
  const subCost      = item.subCost ?? 0;
  const clientUnit   = item.unitCost ?? 0;
  const qty          = item.qty ?? 0;
  const internalTotal = qty * subCost;
  const lineProfit   = item.total - internalTotal;
  const lineMarginPct = item.total > 0 ? (lineProfit / item.total) * 100 : 0;
  const markupPct    = subCost > 0 ? ((clientUnit - subCost) / subCost) * 100 : 0;

  // Color cue for the line profit pill.
  const profitColor =
    lineProfit < 0 ? 'bg-red-100 text-red-700 border-red-200'
    : lineMarginPct < 10 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-green-100 text-green-700 border-green-200';

  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      {/* Single row: trade · description · qty · unit · 📏 · sub $ · client $ · profit pill · total · X
          Sub cost sits next to client price (lock icon = internal) so the eye
          can see "what I pay → what client pays → my profit" left-to-right. */}
      <div className="grid gap-2 items-center"
        style={{ gridTemplateColumns: '1fr 2fr 60px 90px 30px 110px 110px 90px 90px 24px' }}>
        <Select value={item.trade} onValueChange={v => onChange(item.id, 'trade', v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TRADES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          className="h-8 text-xs"
          placeholder="Description of work..."
          value={item.description}
          onChange={e => onChange(item.id, 'description', e.target.value)}
        />

        <Input
          className="h-8 text-xs text-right"
          type="number"
          value={item.qty || ''}
          onChange={e => handleNum('qty', e.target.value)}
          placeholder="1"
        />

        <Select value={item.unit} onValueChange={v => onChange(item.id, 'unit', v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>

        <button
          title="Measure from plans"
          onClick={() => onMeasure(item.id)}
          className={`h-8 w-7 flex items-center justify-center rounded border transition-colors ${
            item.takeoffMeasurementId
              ? 'border-amber-400 bg-amber-50 text-amber-600'
              : 'border-gray-200 text-gray-400 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50'
          }`}
        >
          <Ruler className="h-3.5 w-3.5" />
        </button>

        {/* SUB COST — internal. Lock icon left of input is the only visual cue. */}
        <div className="relative">
          <Lock className="w-3 h-3 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            className="h-8 text-xs text-right pl-6 bg-gray-50 border-gray-200"
            type="number"
            value={item.subCost ?? ''}
            onChange={e => handleNum('subCost', e.target.value)}
            placeholder="Sub $"
            title="Internal — what the sub charges Skyeline per unit (hidden from client)"
          />
        </div>

        {/* CLIENT PRICE — what shows on the estimate. Blue tint = client-facing. */}
        <div className="relative">
          <Input
            className="h-8 text-xs text-right border-blue-200 bg-blue-50/30 focus-visible:ring-blue-300"
            type="number"
            value={item.unitCost || ''}
            onChange={e => handleNum('unitCost', e.target.value)}
            placeholder="Client $"
            title="Client price per unit — shown on the estimate"
          />
        </div>

        {/* Profit pill — $ profit + margin % per line */}
        <div className="flex justify-end">
          {(subCost > 0 || clientUnit > 0) ? (
            <span className={`inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-1 rounded border ${profitColor}`}>
              {lineProfit >= 0 ? '+' : ''}{fmt(lineProfit)}
              {item.total > 0 && (
                <span className="opacity-70">·{lineMarginPct.toFixed(0)}%</span>
              )}
            </span>
          ) : <span className="text-xs text-gray-300 text-right">—</span>}
        </div>

        <div className="h-8 flex items-center justify-end text-sm font-medium text-gray-800 pr-1">
          {fmt(item.total)}
        </div>

        <button onClick={() => onDelete(item.id)} className="h-8 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline markup + status badges (only when relevant) */}
      {(subCost > 0 && clientUnit > 0) || item.needsSelection || item.splitLaborMaterial ? (
        <div className="mt-1 ml-1 flex items-center gap-2 flex-wrap text-[11px]">
          {subCost > 0 && clientUnit > 0 && (
            <span className="text-gray-500">
              Markup <strong className={markupPct < 0 ? 'text-red-600' : 'text-gray-700'}>{fmt(clientUnit - subCost)}/{item.unit}</strong>
              <span className="text-gray-300 mx-1">·</span>
              {markupPct.toFixed(0)}% over sub cost
            </span>
          )}
          {item.needsSelection && item.selectionStatus && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${SELECTION_STATUS_COLOR[item.selectionStatus] || 'bg-gray-100 text-gray-600'}`}>
              <Palette className="w-3 h-3" />
              {SELECTION_STATUS_LABEL[item.selectionStatus] || item.selectionStatus}
            </span>
          )}
          {item.splitLaborMaterial && laborAmt != null && materialAmt != null && (
            <span className="inline-flex items-center gap-1.5 text-gray-500">
              <Scissors className="w-3 h-3 text-gray-400" />
              Labor <strong>{fmt(laborAmt)}</strong>
              <span className="text-gray-300">·</span>
              Material <strong className="text-amber-700">{fmt(materialAmt)}</strong>
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ est, onEdit, onDelete, onMoveTo }: {
  est: Estimate;
  onEdit: () => void;
  onDelete: () => void;
  onMoveTo: (stage: PipelineStage) => void;
}) {
  const currentStage = getPipelineStage(est);
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-gray-900 truncate leading-snug">{est.title}</p>
          {est.clientName && <p className="text-xs text-gray-500 truncate mt-0.5">{est.clientName}</p>}
          <p className="text-sm font-bold text-gray-800 mt-1.5">{fmtFull(est.totalAmount ?? 0)}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-gray-100 transition-colors shrink-0 -mr-1 -mt-0.5"
              onClick={e => e.stopPropagation()}>
              <MoreVertical className="h-4 w-4 text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52" onClick={e => e.stopPropagation()}>
            <DropdownMenuItem onClick={onEdit}><Edit2 className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            {PIPELINE_COLUMNS.filter(c => c.stage !== currentStage).map(col => (
              <DropdownMenuItem key={col.stage} onClick={() => onMoveTo(col.stage)}>
                <div className="w-2 h-2 rounded-full mr-2 shrink-0" style={{ backgroundColor: col.accent }} />
                Move to {col.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function KanbanColumn({ stage, label, accent, estimates, onEdit, onDelete, onMoveTo }: {
  stage: PipelineStage; label: string; accent: string; estimates: Estimate[];
  onEdit: (est: Estimate) => void; onDelete: (est: Estimate) => void;
  onMoveTo: (est: Estimate, stage: PipelineStage) => void;
}) {
  return (
    <div className="flex flex-col min-w-[220px] w-[220px] flex-shrink-0">
      <div className="mb-3">
        <div className="h-1 rounded-full mb-2" style={{ backgroundColor: accent }} />
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">{label}</span>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{estimates.length}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2 flex-1 min-h-[120px]">
        {estimates.map(est => (
          <KanbanCard key={est.id} est={est}
            onEdit={() => onEdit(est)} onDelete={() => onDelete(est)}
            onMoveTo={s => onMoveTo(est, s)} />
        ))}
        {estimates.length === 0 && (
          <div className="flex-1 border-2 border-dashed border-gray-100 rounded-lg flex items-center justify-center min-h-[80px]">
            <span className="text-xs text-gray-300">No estimates</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Estimate Modal (full editor) ─────────────────────────────────────────────

function EstimateModal({
  open, onClose, editing, clients, onSave, prefillProject,
}: {
  open: boolean;
  onClose: () => void;
  editing: Estimate | null;
  clients: CRMClient[];
  onSave: (data: Omit<Estimate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  prefillProject?: { id: string; name: string } | null;
}) {
  const defaultItems = () => TRADES.slice(0, 5).map(t => newLineItem(t.key));

  const [activeTab, setActiveTab]   = useState<EstimateTab>('details');
  const [title, setTitle]           = useState('');
  const [clientId, setClientId]     = useState('');
  const [jobAddress, setJobAddress] = useState('');
  const [projectId, setProjectId]   = useState('');
  const [status, setStatus]         = useState<EstimateStatus>('draft');
  const [overhead, setOverhead]     = useState(10);
  const [profit, setProfitPct]      = useState(15);
  const [markupPct, setMarkupPct]   = useState(10);
  const [taxPct, setTaxPct]         = useState(0);
  const [notes, setNotes]           = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems]           = useState<LineItem[]>(defaultItems());
  const [saving, setSaving]         = useState(false);
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set(TRADES.map(t => t.key)));

  // Takeoff + selection flow
  const [measuringItemId, setMeasuringItemId] = useState<string | null>(null);
  const [selectionPromptItemId, setSelectionPromptItemId] = useState<string | null>(null);
  const [splitItemId, setSplitItemId] = useState<string | null>(null);
  const [laborPctInput, setLaborPctInput] = useState(60);

  useEffect(() => {
    if (editing) {
      setTitle(editing.title ?? '');
      setClientId(editing.clientId ?? '');
      setJobAddress(editing.jobAddress ?? '');
      setProjectId(editing.projectId ?? '');
      setStatus(editing.status ?? 'draft');
      setOverhead(editing.overhead ?? 10);
      setProfitPct(editing.profit ?? 15);
      setMarkupPct(editing.markup ?? 10);
      setTaxPct(editing.tax ?? 0);
      setNotes(editing.notes ?? '');
      setValidUntil(editing.validUntil ?? '');
      setItems(editing.lineItems?.length ? editing.lineItems : defaultItems());
    } else {
      setTitle(prefillProject?.name ? `${prefillProject.name} — Estimate` : '');
      setClientId('');
      setJobAddress('');
      setProjectId(prefillProject?.id || '');
      setStatus('draft');
      setOverhead(10);
      setProfitPct(15);
      setMarkupPct(10);
      setTaxPct(0);
      setNotes('');
      setValidUntil('');
      setItems(defaultItems());
    }
    setActiveTab('details');
    setMeasuringItemId(null);
    setSelectionPromptItemId(null);
    setSplitItemId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open, prefillProject?.id]);

  // When client selected, auto-fill address
  useEffect(() => {
    if (!clientId) return;
    const c = clients.find(c => c.id === clientId);
    if (c) {
      if (!jobAddress) setJobAddress([c.jobAddress, c.city].filter(Boolean).join(', ') ?? '');
      if (!title) setTitle(`${c.name} — Estimate`);
    }
  }, [clientId]);

  const changeItem = (id: string, field: string, value: any) =>
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

  const deleteItem = (id: string) =>
    setItems(prev => prev.filter(i => i.id !== id));

  const addItem = (trade: string) =>
    setItems(prev => [...prev, newLineItem(trade)]);

  const totals = calcTotals(items, overhead, profit);

  const grouped = TRADES.map(t => ({
    trade: t,
    items: items.filter(i => i.trade === t.key),
  })).filter(g => g.items.length > 0);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const clientName = clients.find(c => c.id === clientId)?.name;
    await onSave({
      title: title.trim(),
      clientId: clientId || undefined,
      clientName,
      jobAddress: jobAddress.trim() || undefined,
      status,
      lineItems: items,
      subtotal: totals.subtotal,
      overhead,
      profit,
      markup: markupPct,
      tax: taxPct,
      totalAmount: totals.total,
      notes: notes.trim() || undefined,
      validUntil: validUntil || undefined,
    });
    setSaving(false);
    onClose();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className={
          editing && (activeTab === 'takeoffs' || activeTab === 'bid_packages')
            ? 'max-w-[96vw] w-full h-[92vh] max-h-[92vh] p-0 flex flex-col overflow-hidden'
            : 'max-w-5xl max-h-[95vh] overflow-y-auto p-0'
        }
      >
        <DialogHeader
          className={
            editing && (activeTab === 'takeoffs' || activeTab === 'bid_packages')
              ? 'px-6 py-4 border-b bg-white z-10 flex-shrink-0'
              : 'px-6 py-4 border-b sticky top-0 bg-white z-10'
          }
        >
          <DialogTitle className="font-heading text-xl">
            {editing ? 'Edit Estimate' : 'New Estimate'}
          </DialogTitle>
          {/* Tab bar — only shown when editing an existing estimate */}
          {editing && (
            <div className="flex gap-0 border-b border-gray-200 -mb-4 mt-2 overflow-x-auto">
              {(['details', 'costings', 'bid_packages', 'takeoffs'] as EstimateTab[]).map(tab => {
                const LABELS: Record<EstimateTab, string> = {
                  details: 'Details', costings: 'Costings',
                  bid_packages: 'Bid Packages', takeoffs: 'Takeoffs',
                };
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? 'border-[#C9A96E] text-[#C9A96E]'
                        : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                    }`}
                  >
                    {LABELS[tab]}
                  </button>
                );
              })}
            </div>
          )}
        </DialogHeader>

        {/* ── Costings tab (only when editing) ── */}
        {editing && activeTab === 'costings' && (
          <div className="overflow-y-auto flex-1">
            <EstimateCostingsTab
              estimateId={editing.id}
              markupPct={markupPct}
              taxPct={taxPct}
              onMarkupChange={async v => {
                setMarkupPct(v);
                await updateDoc(doc(db, 'estimates', editing.id), { markup: v });
              }}
              onTaxChange={async v => {
                setTaxPct(v);
                await updateDoc(doc(db, 'estimates', editing.id), { tax: v });
              }}
            />
          </div>
        )}

        {/* ── Bid Packages tab ── */}
        {editing && activeTab === 'bid_packages' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <Suspense fallback={<MinimalSpinner title="Loading bids..." />}>
              <PortalBidsPanel
                projectId={editing.projectId || 'default'}
                projectName={editing.title}
              />
            </Suspense>
          </div>
        )}

        {/* ── Takeoffs tab ── */}
        {editing && activeTab === 'takeoffs' && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<MinimalSpinner title="Loading Plans..." />}>
              <TakeoffStudio
                projectId={editing.projectId || 'default'}
                projectName={editing.title}
                onPushToEstimate={() => { setActiveTab('details'); }}
              />
            </Suspense>
          </div>
        )}

        {/* ── Details tab (or new estimate) ── */}
        {(!editing || activeTab === 'details') && (
        <div className="px-6 py-4 space-y-6">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Estimate Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Smith Custom Home — Estimate Rev 1" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as EstimateStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— No client —</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Job / Lot Address</Label>
              <Input value={jobAddress} onChange={e => setJobAddress(e.target.value)} placeholder="123 Main St, Draper, UT" />
            </div>
          </div>

          {/* Profit / margin summary — internal only, anchors the GC's view */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-blue-800 font-semibold">
                <Eye className="w-3 h-3" />
                Client Sees
              </div>
              <div className="text-lg font-bold text-gray-900 mt-0.5">{fmt(totals.total)}</div>
              <div className="text-[10px] text-gray-500">All-in price on the estimate</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-700 font-semibold">
                <Lock className="w-3 h-3" />
                Sub Costs
              </div>
              <div className="text-lg font-bold text-gray-900 mt-0.5">{fmt(totals.internalSubtotal)}</div>
              <div className="text-[10px] text-gray-500">What Skyeline pays subs</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-amber-800 font-semibold">
                <TrendingUp className="w-3 h-3" />
                Line Markup
              </div>
              <div className="text-lg font-bold text-gray-900 mt-0.5">{fmt(totals.lineMarkup)}</div>
              <div className="text-[10px] text-gray-500">Client price − sub cost (per row)</div>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-green-800 font-semibold">
                <DollarSign className="w-3 h-3" />
                Gross Profit
              </div>
              <div className="text-lg font-bold text-gray-900 mt-0.5">
                {fmt(totals.grossProfit)}
              </div>
              <div className="text-[10px] text-gray-500">
                {totals.grossMarginPct.toFixed(1)}% margin (markup + OH + profit %)
              </div>
            </div>
          </div>

          {/* Line items by trade */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-800">Scope of Work</h3>
              <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                <Eye className="w-3 h-3" /> Top row = client-facing
                <span className="text-gray-300 mx-1">·</span>
                <Lock className="w-3 h-3" /> Internal row = your costs / margin
              </span>
            </div>

            {/* Column headers */}
            <div className="hidden sm:grid text-xs text-gray-400 font-medium px-1 mb-1"
              style={{ gridTemplateColumns: '1fr 2fr 60px 90px 30px 110px 110px 90px 90px 24px' }}>
              <span>Trade</span>
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span>Unit</span>
              <span title="Measure from plans"><Ruler className="h-3 w-3 text-gray-300" /></span>
              <span className="text-right inline-flex items-center justify-end gap-1">
                <Lock className="w-3 h-3" /> Sub $
              </span>
              <span className="text-right text-blue-700">Client $</span>
              <span className="text-right">Profit</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {grouped.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">Add line items below to build the estimate.</p>
            )}

            <div className="space-y-1">
              {grouped.map(({ trade, items: tradeItems }) => (
                <div key={trade.key}>
                  <button
                    className="flex items-center gap-2 w-full text-left py-1.5 px-1 hover:bg-gray-50 rounded"
                    onClick={() => setExpandedTrades(prev => {
                      const next = new Set(prev);
                      next.has(trade.key) ? next.delete(trade.key) : next.add(trade.key);
                      return next;
                    })}
                  >
                    {expandedTrades.has(trade.key)
                      ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                      : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                    }
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{trade.label}</span>
                    <span className="text-xs text-gray-400 ml-auto">{fmt(tradeItems.reduce((s, i) => s + i.total, 0))}</span>
                  </button>
                  {expandedTrades.has(trade.key) && (
                    <div className="ml-5 border-l border-gray-100 pl-3">
                      {tradeItems.map(item => (
                        <LineItemRow key={item.id} item={item} onChange={changeItem} onDelete={deleteItem} onMeasure={setMeasuringItemId} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add line item buttons by trade */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2">Add line item:</p>
              <div className="flex flex-wrap gap-1.5">
                {TRADES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => addItem(t.key)}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
                  >
                    + {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium">{fmt(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span>Overhead</span>
                <input
                  type="number"
                  value={overhead}
                  onChange={e => setOverhead(parseFloat(e.target.value) || 0)}
                  className="w-14 h-6 text-xs text-center border border-gray-200 rounded px-1"
                />
                <span>%</span>
              </div>
              <span className="font-medium">{fmt(totals.overheadAmt)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span>Profit</span>
                <input
                  type="number"
                  value={profit}
                  onChange={e => setProfitPct(parseFloat(e.target.value) || 0)}
                  className="w-14 h-6 text-xs text-center border border-gray-200 rounded px-1"
                />
                <span>%</span>
              </div>
              <span className="font-medium">{fmt(totals.profitAmt)}</span>
            </div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200" style={{ color: '#141414' }}>
              <span>Total Estimate</span>
              <span>{fmt(totals.total)}</span>
            </div>
          </div>

          {/* Notes + valid until */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Notes / Terms</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Inclusions, exclusions, allowances..." />
            </div>
            <div className="space-y-1.5">
              <Label>Valid Until</Label>
              <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
            </div>
          </div>
        </div>
        )} {/* end details tab */}

        <DialogFooter className="px-6 py-4 border-t gap-2 sticky bottom-0 bg-white">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Estimate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* ── Takeoff Studio overlay ── */}
    <Dialog open={!!measuringItemId} onOpenChange={open => { if (!open) setMeasuringItemId(null); }}>
      <DialogContent
        className="max-w-[96vw] w-full max-h-[95vh] p-0 flex flex-col"
        // Lock the modal's touch behaviour so iOS pinch-zoom doesn't rescale
        // the entire dialog. Our own wheel/gesture handlers run inside.
        style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
      >
        <DialogHeader className="px-4 py-3 border-b flex-shrink-0 flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-amber-600" />
            Measure from Plans
            {measuringItemId && (() => {
              const item = items.find(i => i.id === measuringItemId);
              return item?.description ? <span className="text-sm font-normal text-gray-500 ml-1">— {item.description}</span> : null;
            })()}
          </DialogTitle>
          <p className="text-xs text-gray-500 mr-8">Use the measurement tools, then click "Push to Estimate" on any measurement to apply the qty.</p>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <Suspense fallback={<MinimalSpinner title="Loading Plans..." />}>
            <TakeoffStudio
              projectId={projectId || editing?.projectId || 'default'}
              projectName={title || 'Estimate'}
              onPushToEstimate={lineItemsFromTakeoff => {
                if (!measuringItemId || lineItemsFromTakeoff.length === 0) return;
                const first = lineItemsFromTakeoff[0];
                changeItem(measuringItemId, 'qty', first.qty);
                changeItem(measuringItemId, 'unit', first.unit);
                if (first.description && !items.find(i => i.id === measuringItemId)?.description) {
                  changeItem(measuringItemId, 'description', first.description);
                }
                changeItem(measuringItemId, 'takeoffMeasurementId', first.sourceMeasurementId);
                // Recalc total
                const item = items.find(i => i.id === measuringItemId);
                if (item) changeItem(measuringItemId, 'total', first.qty * item.unitCost);
                setMeasuringItemId(null);
                setSelectionPromptItemId(measuringItemId);
              }}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>

    {/* ── "Needs Selection?" prompt ── */}
    {selectionPromptItemId && (() => {
      const item = items.find(i => i.id === selectionPromptItemId);
      return (
        <Dialog open onOpenChange={() => setSelectionPromptItemId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-amber-600" />
                Material Selection
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-3">
              <p className="text-sm text-gray-700">
                Does <strong>{item?.description || 'this line item'}</strong> require a final material selection from the designer or client?
              </p>
              <p className="text-xs text-gray-500">If yes, it will be flagged as "Needs Selection" and appear in the designer and client portals for approval.</p>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSelectionPromptItemId(null)}
              >
                No, cost is set
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                onClick={() => {
                  changeItem(selectionPromptItemId, 'needsSelection', true);
                  changeItem(selectionPromptItemId, 'selectionStatus', 'pending');
                  setSelectionPromptItemId(null);
                  setSplitItemId(selectionPromptItemId);
                }}
              >
                <Palette className="w-4 h-4 mr-1.5" /> Yes — needs selection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    })()}

    {/* ── Labor / Material split prompt ── */}
    {splitItemId && (() => {
      const item = items.find(i => i.id === splitItemId);
      return (
        <Dialog open onOpenChange={() => setSplitItemId(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-gray-600" />
                Split Labor / Material
              </DialogTitle>
            </DialogHeader>
            <div className="py-3 space-y-4">
              <p className="text-sm text-gray-700">
                Split <strong>{item?.description || 'this item'}</strong> ({fmt(item?.total ?? 0)}) into labor and material portions?
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Labor %</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range" min={0} max={100} value={laborPctInput}
                      onChange={e => setLaborPctInput(Number(e.target.value))}
                      className="w-32 accent-amber-500"
                    />
                    <span className="w-10 text-right font-medium">{laborPctInput}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Labor</p>
                    <p className="font-semibold">{fmt((item?.total ?? 0) * laborPctInput / 100)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Material</p>
                    <p className="font-semibold text-amber-700">{fmt((item?.total ?? 0) * (100 - laborPctInput) / 100)}</p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => setSplitItemId(null)}>
                No split
              </Button>
              <Button
                className="flex-1"
                style={{ backgroundColor: '#C9A96E', color: '#141414', fontWeight: 600 }}
                onClick={() => {
                  changeItem(splitItemId, 'splitLaborMaterial', true);
                  changeItem(splitItemId, 'laborPct', laborPctInput);
                  setSplitItemId(null);
                }}
              >
                <Scissors className="w-4 h-4 mr-1.5" /> Apply Split
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    })()}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EstimateBuilder() {
  const { toast } = useToast();
  const [estimates, setEstimates]   = useState<Estimate[]>([]);
  const [clients, setClients]       = useState<CRMClient[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | 'all'>('all');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editing, setEditing]       = useState<Estimate | null>(null);
  const [gmailOpen, setGmailOpen]   = useState(false);
  const [importTarget, setImportTarget] = useState<Estimate | null>(null);
  const [viewMode, setViewMode]     = useState<'pipeline' | 'list'>('pipeline');

  // ── Load estimates ────────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'estimates'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setEstimates(snap.docs.map(d => ({ id: d.id, ...d.data() } as Estimate)));
      setLoading(false);
    });
  }, []);

  // ── Load CRM clients for dropdown ─────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('name'));
    return onSnapshot(q, snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as CRMClient)));
    });
  }, []);

  // ── Deep-link handlers (?openEstimate=<id> or ?newForProject=<id>) ────────
  // Project Overview's "Open Estimate" / "Create Estimate" buttons hand the
  // user off here with a query string. We auto-open the right dialog.
  const [pendingDeepLink, setPendingDeepLink] = useState<{
    openId?: string;
    newForProject?: { id: string; name: string };
  } | null>(null);
  // Lives across renders so EstimateModal can pre-fill project on a brand-new estimate.
  const [prefillProject, setPrefillProject] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const openId = params.get('openEstimate');
    const newForProject = params.get('newForProject');
    const projectName = params.get('projectName') || '';
    if (openId) setPendingDeepLink({ openId });
    else if (newForProject) setPendingDeepLink({ newForProject: { id: newForProject, name: projectName } });
  }, []);
  // When estimates load, resolve a pending openEstimate into the actual record.
  useEffect(() => {
    if (!pendingDeepLink) return;
    if (pendingDeepLink.openId) {
      const match = estimates.find(e => e.id === pendingDeepLink.openId);
      if (match) {
        setEditing(match);
        setModalOpen(true);
        setPendingDeepLink(null);
        window.history.replaceState({}, '', '/estimates');
      }
    } else if (pendingDeepLink.newForProject) {
      setPrefillProject(pendingDeepLink.newForProject);
      setEditing(null);
      setModalOpen(true);
      setPendingDeepLink(null);
      window.history.replaceState({}, '', '/estimates');
    }
  }, [pendingDeepLink, estimates]);

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const handleSave = async (data: Omit<Estimate, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (editing) {
      await updateDoc(doc(db, 'estimates', editing.id), { ...data, updatedAt: serverTimestamp() });
      toast({ title: 'Estimate updated' });
    } else {
      await addDoc(collection(db, 'estimates'), {
        ...data, pipelineStage: 'pending',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      toast({ title: 'Estimate created' });
    }
    setEditing(null);
  };

  const handleMoveTo = async (est: Estimate, stage: PipelineStage) => {
    await updateDoc(doc(db, 'estimates', est.id), { pipelineStage: stage, updatedAt: serverTimestamp() });
    const col = PIPELINE_COLUMNS.find(c => c.stage === stage);
    toast({ title: `Moved to ${col?.label}` });
  };

  const handleDelete = async (est: Estimate) => {
    if (!confirm(`Delete "${est.title}"?`)) return;
    await deleteDoc(doc(db, 'estimates', est.id));
    toast({ title: 'Deleted' });
  };

  const handleDuplicate = async (est: Estimate) => {
    const { id, createdAt, updatedAt, ...data } = est;
    await addDoc(collection(db, 'estimates'), {
      ...data,
      title: `${data.title} (Copy)`,
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    toast({ title: 'Duplicated', description: 'Draft copy created.' });
  };

  const GMAIL_TRADE_MAP: Record<string, string> = {
    'Concrete / Foundation': 'concrete', 'Framing / Rough Carpentry': 'framing',
    'Roofing': 'roofing', 'Electrical': 'electrical', 'Plumbing': 'plumbing',
    'HVAC / Mechanical': 'hvac', 'Insulation': 'insulation', 'Drywall': 'drywall',
    'Flooring': 'flooring', 'Tile': 'tile', 'Painting': 'paint',
    'Cabinets / Millwork': 'cabinets', 'Countertops': 'cabinets',
    'Windows & Doors': 'exterior', 'Exterior Finishes / Siding': 'exterior',
    'Masonry / Stonework': 'concrete', 'Landscaping / Site Work': 'landscaping',
    'Cleaning / Final': 'other', 'other': 'other',
  };

  const handleGmailImport = async (items: any[]) => {
    if (items.length === 0) return;
    const newItems: LineItem[] = items.map(item => ({
      id: crypto.randomUUID(),
      trade: GMAIL_TRADE_MAP[item.trade] ?? 'other',
      description: item.description,
      qty: 1,
      unit: 'lump sum',
      unitCost: item.amount,
      total: item.amount,
      subName: item.subName,
      notes: `From: ${item.subEmail} — ${item.notes?.slice(0, 120) ?? ''}`,
      fromEmail: true,
    }));

    const projectId: string | undefined = items[0]?.projectId;
    const projectName: string | undefined = items[0]?.projectName;

    if (importTarget) {
      const merged = [...(importTarget.lineItems ?? []), ...newItems];
      const subtotal = merged.reduce((s, i) => s + i.total, 0);
      const overheadAmt = subtotal * (importTarget.overhead / 100);
      const profitAmt = (subtotal + overheadAmt) * (importTarget.profit / 100);
      await updateDoc(doc(db, 'estimates', importTarget.id), {
        lineItems: merged,
        subtotal,
        totalAmount: subtotal + overheadAmt + profitAmt,
        ...(projectId ? { projectId, projectName } : {}),
        updatedAt: serverTimestamp(),
      });
      toast({ title: `${newItems.length} bids added to "${importTarget.title}"` });
    } else {
      const subtotal = newItems.reduce((s, i) => s + i.total, 0);
      const title = projectName
        ? `${projectName} — Estimate`
        : `Imported Bids — ${new Date().toLocaleDateString()}`;
      await addDoc(collection(db, 'estimates'), {
        title,
        status: 'draft',
        lineItems: newItems,
        subtotal,
        overhead: 10,
        profit: 15,
        totalAmount: subtotal * 1.265,
        ...(projectId ? { projectId, projectName } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: `New estimate created with ${newItems.length} bids${projectName ? ` for ${projectName}` : ''}` });
    }
    setImportTarget(null);
  };

  // ── Filtered ──────────────────────────────────────────────────────────────
  const filtered = estimates.filter(e => {
    const matchSearch = !search || [e.title, e.clientName, e.jobAddress]
      .filter(Boolean).some(v => v!.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* ── JACK-style header ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-heading font-semibold text-brand-black" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
            Estimates
          </h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="outline" onClick={() => { setImportTarget(null); setGmailOpen(true); }}
              className="hidden sm:flex items-center gap-2 border-gray-300">
              <Mail className="h-4 w-4 text-red-500" /> Import from Gmail
            </Button>
            {/* Pipeline / List toggle */}
            <div className="flex border border-gray-200 rounded-md overflow-hidden">
              <button onClick={() => setViewMode('pipeline')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  viewMode === 'pipeline' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>Pipeline</button>
              <button onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-sm font-medium border-l border-gray-200 transition-colors ${
                  viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>List</button>
            </div>
            <Button variant="outline" className="flex items-center gap-1.5 px-3">
              <SlidersHorizontal className="h-4 w-4" /> Filter
            </Button>
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2">
              <Plus className="h-4 w-4" /> Estimate
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>}

        {/* ── Pipeline view ── */}
        {!loading && viewMode === 'pipeline' && estimates.length > 0 && (
          <div className="overflow-x-auto pb-4 -mx-1 px-1">
            <div className="flex gap-4 min-w-max">
              {PIPELINE_COLUMNS.map(col => (
                <KanbanColumn key={col.stage} stage={col.stage} label={col.label} accent={col.accent}
                  estimates={estimates.filter(e => getPipelineStage(e) === col.stage)}
                  onEdit={est => { setEditing(est); setModalOpen(true); }}
                  onDelete={handleDelete}
                  onMoveTo={handleMoveTo} />
              ))}
            </div>
          </div>
        )}

        {!loading && viewMode === 'pipeline' && estimates.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No estimates yet</p>
            <p className="text-sm mt-1">Create your first estimate to get started.</p>
            <Button className="mt-4" onClick={() => { setEditing(null); setModalOpen(true); }}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
              <Plus className="h-4 w-4 mr-2" />New Estimate
            </Button>
          </div>
        )}

        {/* ── List view ── */}
        {!loading && viewMode === 'list' && (
          <div className="space-y-4">
            {/* Status filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              <button onClick={() => setStatusFilter('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${statusFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
                All ({estimates.length})
              </button>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => {
                const count = estimates.filter(e => e.status === k).length;
                return (
                  <button key={k} onClick={() => setStatusFilter(k as EstimateStatus)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${statusFilter === k ? 'text-white border-transparent' : 'bg-white border-gray-200 hover:border-gray-400'}`}
                    style={statusFilter === k ? { backgroundColor: v.color, borderColor: v.color } : { color: v.color }}>
                    {v.label} {count > 0 && `(${count})`}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search estimates..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-gray-400" /></button>}
            </div>

            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">No estimates found</p>
                <Button className="mt-4" onClick={() => { setEditing(null); setModalOpen(true); }}
                  style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
                  <Plus className="h-4 w-4 mr-2" />New Estimate
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {filtered.map(est => {
                const sc = STATUS_CONFIG[est.status];
                return (
                  <div key={est.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
                    <FileText className="h-8 w-8 text-gray-300 flex-shrink-0" />
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5">
                      <div>
                        <p className="font-semibold text-sm text-gray-900 truncate">{est.title}</p>
                        {est.clientName && (
                          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                            <User className="h-3 w-3" />{est.clientName}
                          </p>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 self-center truncate">{est.jobAddress}</div>
                      <div className="self-center">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-sm" style={{ color: '#141414' }}>{fmt(est.totalAmount)}</p>
                      <p className="text-xs text-gray-400">{est.lineItems?.length ?? 0} items</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditing(est); setModalOpen(true); }}>
                          <Edit2 className="h-4 w-4 mr-2" />Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setImportTarget(est); setGmailOpen(true); }}>
                          <Mail className="h-4 w-4 mr-2 text-red-500" />Add bids from Gmail
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(est)}>
                          <Copy className="h-4 w-4 mr-2" />Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDelete(est)} className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" />Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <EstimateModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); setPrefillProject(null); }}
        editing={editing}
        clients={clients}
        onSave={handleSave}
        prefillProject={prefillProject}
      />

      <GmailBidImporter
        open={gmailOpen}
        onClose={() => { setGmailOpen(false); setImportTarget(null); }}
        onImport={handleGmailImport}
      />
    </AppLayout>
  );
}
