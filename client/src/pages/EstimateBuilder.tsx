import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
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
import { useConfirm } from '@/hooks/use-confirm';
import { GmailBidImporter } from '@/components/estimates/GmailBidImporter';
import { EstimateCostingsTab } from '@/components/estimates/EstimateCostingsTab';
import { LineDescriptionButton } from '@/components/estimates/LineDescriptionButton';
import { SubPickerButton } from '@/components/estimates/SubPickerButton';
import {
  Plus, Search, MoreVertical, ChevronDown, ChevronRight,
  Trash2, Edit2, FileText, DollarSign, User, Send,
  CheckCircle2, XCircle, Clock, Copy, X, Building2, Mail,
  Hammer, Zap, Droplets, Paintbrush, Thermometer, Package,
  TreePine, Layers, Grid3X3, ShieldCheck, Ruler, Scissors,
  Palette, AlertCircle, SlidersHorizontal, Lock, Eye, TrendingUp,
  Check,
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
  /** Line type — JACK-parity classification. Drives analytics + per-trade margin breakdown.
   *  - material:     pure material line (e.g. lumber, fixtures)
   *  - labor:        pure labor line (e.g. in-house framing crew hours)
   *  - equipment:    rentals, machinery, tool consumables
   *  - subcontractor: sub-issued scope (sub does material + labor, bills as one)
   *  Legacy 'both' values keep working — they're read but no longer selectable; the
   *  column is now labeled "Mat/Lab" so users understand each line is one type. */
  kind?: 'material' | 'labor' | 'equipment' | 'subcontractor' | 'both';
  /** JACK-parity line status. inc = included in price, ex = excluded (show only),
   *  note = info-only no $ impact, allow = allowance subject to selection. */
  lineStatus?: 'inc' | 'ex' | 'note' | 'allow';
  /** Total quantity with any waste multiplier applied (e.g., 850 sqft tile × 1.10 waste = 935).
   *  When unset, totalQty = qty. */
  totalQty?: number;
  /** Per-line tax flag — when true the row contributes to taxable subtotal. */
  taxable?: boolean;
  /** Per-line markup % override. When set, beats the estimate-level markup for this row only. */
  markupPctLine?: number;
  /** Assigned sub/supplier/vendor contact IDs. When a bid is uploaded for one of
   *  these subs and is part of the project's bid package, we cross-check the bid
   *  amount against this line's Builder Cost and flag discrepancies. */
  assignedSubIds?: string[];
  /** The bid (from this project's `bids` collection) whose total was last
   *  applied to this line's subCost. Cleared if the sub is unassigned. Lets
   *  us flag the chip as "Applied" and tie the cost back to a paper trail. */
  awardedBidId?: string;
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

// Legacy key→label map for line items created before Firestore trades were used.
const LEGACY_TRADE_LABELS: Record<string, string> = {
  general:     'General Conditions',
  site:        'Site Work',
  concrete:    'Concrete / Foundation',
  framing:     'Framing',
  roofing:     'Roofing',
  electrical:  'Electrical',
  plumbing:    'Plumbing',
  hvac:        'HVAC',
  insulation:  'Insulation',
  drywall:     'Drywall',
  flooring:    'Flooring',
  paint:       'Paint',
  cabinets:    'Cabinets / Millwork',
  tile:        'Tile',
  exterior:    'Exterior Finishes',
  landscaping: 'Landscaping',
  other:       'Other',
};

// Fallback trade list if Firestore hasn't loaded yet or is empty.
const FALLBACK_TRADES = Object.values(LEGACY_TRADE_LABELS);

// Resolve a stored trade value (legacy key or full name) to a display label.
function resolveTradeLabel(trade: string): string {
  return LEGACY_TRADE_LABELS[trade] ?? trade;
}

// Build the merged trade list: Firestore names + any legacy keys still in use
// that aren't already covered by a Firestore entry.
function buildTradeList(firestoreTrades: string[], itemTrade?: string): string[] {
  const list = firestoreTrades.length > 0 ? [...firestoreTrades] : [...FALLBACK_TRADES];
  // If the current item uses a legacy key not in the list, add its label.
  if (itemTrade) {
    const label = resolveTradeLabel(itemTrade);
    if (!list.includes(label) && !list.includes(itemTrade)) list.push(label);
  }
  return list;
}

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
  // Only Included + Allowance lines contribute to the contract price.
  // Excluded ('ex') = shown on estimate but explicitly NOT in total.
  // Note ('note')   = informational, never contributes.
  // Allowance ('allow') = counts at its placeholder price; trues up at selection.
  const countsInTotal = (i: LineItem) => {
    const s = i.lineStatus ?? 'inc';
    return s === 'inc' || s === 'allow';
  };
  const billable = items.filter(countsInTotal);
  const subtotal = billable.reduce((s, i) => s + (i.total ?? 0), 0);
  // Internal subtotal at sub costs (what Skyeline actually pays).
  const internalSubtotal = billable.reduce((s, i) => s + (i.qty || 0) * (i.subCost ?? 0), 0);
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

interface MatchableBid {
  id: string;
  trade?: string;
  totalAmount?: number;
  subContactId?: string;
  subId?: string;
  subName?: string;
  status?: string;
}

function LineItemRow({
  item, onChange, onDelete, onMeasure, tradeOptions, globalMarkupPct, projectBids,
}: {
  item: LineItem;
  onChange: (id: string, field: string, value: any) => void;
  onDelete: (id: string) => void;
  onMeasure: (id: string) => void;
  tradeOptions: string[];
  globalMarkupPct: number;
  projectBids?: MatchableBid[];
}) {
  // Effective markup for this row — per-line override beats the global default.
  const effectiveMarkup = typeof item.markupPctLine === 'number' ? item.markupPctLine : globalMarkupPct;

  // Bids on this project whose subContactId matches one of the assigned subs
  // AND whose trade matches the line's trade. Surfacing these lets the user
  // one-click apply the bid total as Builder Cost instead of re-typing it.
  const matchingBids = useMemo(() => {
    if (!projectBids?.length || !item.assignedSubIds?.length) return [];
    const tradeKey = (item.trade || '').toLowerCase().trim();
    return projectBids.filter(b => {
      const subKey = b.subContactId || b.subId;
      if (!subKey) return false;
      const matchesSub = item.assignedSubIds!.includes(subKey);
      const matchesTrade = !tradeKey || (b.trade || '').toLowerCase() === tradeKey;
      return matchesSub && matchesTrade;
    });
  }, [projectBids, item.assignedSubIds, item.trade]);

  const applyBid = (bid: MatchableBid) => {
    const total = bid.totalAmount || 0;
    const qtyDiv = item.qty && item.qty > 0 ? item.qty : 1;
    onChange(item.id, 'subCost', total / qtyDiv);
    onChange(item.id, 'awardedBidId', bid.id);
  };

  const clearAppliedBid = () => {
    onChange(item.id, 'awardedBidId', undefined);
  };

  // Cost / Sell are INDEPENDENT inputs (cost-plus pricing model):
  //   Cost / unit = Tyler's internal cost (sub invoice, material cost, etc.)
  //   Sell / unit = what the client sees as "Owner Price" base — Tyler's call
  //   Markup %    = the contractor fee rate applied on top of Owner Price
  // Total Cost = (qty × sell) + (qty × sell × markup/100). No auto-fill — Tyler
  // controls Sell so he can pass material savings to the client when he floats
  // purchase orders on his own credit lines (per his framing).
  const handleNum = (field: string, raw: string) => {
    const v = parseFloat(raw) || 0;
    if (field === 'qty') {
      onChange(item.id, 'qty', v);
      onChange(item.id, 'total', v * (item.unitCost ?? 0));
    } else if (field === 'unitCost') {
      onChange(item.id, 'unitCost', v);
      onChange(item.id, 'total', (item.qty ?? 0) * v);
    } else if (field === 'subCost') {
      onChange(item.id, 'subCost', v);
    } else {
      onChange(item.id, field, v);
    }
  };

  const handleMarkupChange = (raw: string) => {
    const v = parseFloat(raw);
    const markup = Number.isNaN(v) ? undefined : v;
    onChange(item.id, 'markupPctLine', markup);
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

  // Resolved display label — maps legacy keys to full names
  const tradeLabel = resolveTradeLabel(item.trade);
  // The value passed to Select must match an option; use the resolved label
  const tradeSelectValue = buildTradeList(tradeOptions, item.trade).includes(tradeLabel)
    ? tradeLabel
    : item.trade;

  // Default to 'material' for new rows. Legacy rows with 'both' still display
  // and store correctly, but the dropdown shows Material/Labor/Equipment/Sub —
  // no Mat/Lab selectable option per Tyler's spec.
  const kind: LineItem['kind'] = item.kind ?? 'material';
  const lineStatus: LineItem['lineStatus'] = item.lineStatus ?? 'inc';
  const totalQty = item.totalQty ?? qty;
  // De-emphasize non-billable rows so it's instantly visible that they don't
  // contribute to the owner price. Excluded gets faded + dashed, Note gets a
  // light blue tint, Allowance gets a soft amber tint.
  const rowClass = lineStatus === 'ex'    ? 'opacity-60'
                 : lineStatus === 'note'  ? 'italic'
                 : '';
  const rowStyle: React.CSSProperties = (
    lineStatus === 'ex'    ? { borderLeft: '3px dashed #B91C1C', paddingLeft: '8px' }
  : lineStatus === 'note'  ? { borderLeft: '3px solid #1D4ED8', paddingLeft: '8px', backgroundColor: 'rgba(59,130,246,0.03)' }
  : lineStatus === 'allow' ? { borderLeft: '3px solid #C9A96E', paddingLeft: '8px', backgroundColor: 'rgba(245,158,11,0.04)' }
  : {}
  );
  return (
    <div className={`py-1 border-b border-gray-100 last:border-0 space-y-0.5 ${rowClass}`} style={rowStyle}>
      {/* ── Row 1 column headers ── New order per Tyler:
            Status · Trade · Mat/Lab · Item · Qty · UOM · Cost/unit · Sell/unit · Measure.
            Total Qty is moved to Row 2 as a *displayed result* (no longer an editable input). */}
      <div className="grid gap-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 px-0.5"
        style={{ gridTemplateColumns: '100px 120px 100px 1fr 80px 90px 130px 130px 34px 34px' }}>
        <span>Status</span>
        <span>Trade</span>
        <span>Mat/Lab</span>
        <span>Item</span>
        <span className="text-right">Qty</span>
        <span>UOM</span>
        <span className="text-right">Cost / unit</span>
        <span className="text-right">Sell / unit</span>
        <span />
        <span />
      </div>
      {/* ── Row 1 inputs ── */}
      <div className="grid gap-2 items-center"
        style={{ gridTemplateColumns: '100px 120px 100px 1fr 80px 90px 130px 130px 34px 34px' }}>

        {/* Line status — Inc / Ex / Note / Allow. Drives whether the line counts
            toward owner price total and how it shows on the published estimate. */}
        <Select value={lineStatus} onValueChange={(v) => onChange(item.id, 'lineStatus', v)}>
          <SelectTrigger
            className="h-8 text-sm pr-7"
            style={(() => {
              const map: Record<string, { bg: string; fg: string }> = {
                inc:   { bg: 'rgba(16,185,129,0.15)', fg: '#047857' },
                ex:    { bg: 'rgba(220,38,38,0.12)',  fg: '#B91C1C' },
                note:  { bg: 'rgba(59,130,246,0.12)', fg: '#1D4ED8' },
                allow: { bg: 'rgba(245,158,11,0.15)', fg: '#92400e' },
              };
              return map[lineStatus] ?? { bg: 'white', fg: '#9CA3AF' };
            })()}
            title={
              lineStatus === 'inc'   ? 'Included — counts toward owner price total'
              : lineStatus === 'ex'  ? 'Excluded — visible on estimate but NOT in total'
              : lineStatus === 'note' ? 'Note only — informational, no $ impact'
              : lineStatus === 'allow' ? 'Allowance — included with placeholder price, trues up at selection'
              : ''
            }
          >
            <div className="flex-1 overflow-hidden text-left">
              <div className="truncate text-sm leading-tight font-medium">
                {lineStatus === 'inc' ? 'Included'
                 : lineStatus === 'ex' ? 'Excluded'
                 : lineStatus === 'note' ? 'Note'
                 : lineStatus === 'allow' ? 'Allowance'
                 : 'Included'}
              </div>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inc">Included</SelectItem>
            <SelectItem value="ex">Excluded</SelectItem>
            <SelectItem value="note">Note only</SelectItem>
            <SelectItem value="allow">Allowance</SelectItem>
          </SelectContent>
        </Select>

        {/* Trade — uses div child (not span) to bypass shadcn's [&>span]:line-clamp-1 */}
        <Select value={tradeSelectValue} onValueChange={v => onChange(item.id, 'trade', v)}>
          <SelectTrigger className="h-8 text-sm pr-7 pl-3">
            <div className="flex-1 overflow-hidden text-left">
              <div className="truncate text-sm leading-tight">{tradeLabel || 'Select trade…'}</div>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72 min-w-[200px]">
            {buildTradeList(tradeOptions, item.trade).map(t => (
              <SelectItem key={t} value={t} className="text-sm">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Type — JACK-parity dropdown: Material / Labor / Mat/Lab / Equipment / Subcontractor.
            Color-coded chip on the trigger keeps it scannable at a glance. */}
        <Select value={kind} onValueChange={(v) => onChange(item.id, 'kind', v)}>
          <SelectTrigger
            className="h-8 text-sm pr-7"
            style={(() => {
              const map: Record<string, { bg: string; fg: string }> = {
                material:     { bg: 'rgba(245,158,11,0.15)', fg: '#92400e' },
                labor:        { bg: 'rgba(59,130,246,0.15)', fg: '#1e40af' },
                both:         { bg: 'rgba(107,114,128,0.15)', fg: '#374151' },
                equipment:    { bg: 'rgba(168,85,247,0.15)', fg: '#6B21A8' },
                subcontractor:{ bg: 'rgba(16,185,129,0.15)', fg: '#047857' },
              };
              return map[kind] ?? { bg: 'white', fg: '#9CA3AF' };
            })()}
          >
            <div className="flex-1 overflow-hidden text-left">
              <div className="truncate text-sm leading-tight font-medium">
                {kind === 'material' ? 'Material'
                 : kind === 'labor' ? 'Labor'
                 : kind === 'both' ? 'Mat/Lab'
                 : kind === 'equipment' ? 'Equipment'
                 : kind === 'subcontractor' ? 'Subcontractor'
                 : 'Type…'}
              </div>
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="material">Material</SelectItem>
            <SelectItem value="labor">Labor</SelectItem>
            <SelectItem value="equipment">Equipment</SelectItem>
            <SelectItem value="subcontractor">Subcontractor</SelectItem>
          </SelectContent>
        </Select>

        <LineDescriptionButton
          value={item.description}
          trade={item.trade}
          onChange={next => onChange(item.id, 'description', next)}
        />

        <Input
          className="h-8 text-sm text-right"
          type="number"
          value={item.qty || ''}
          onChange={e => handleNum('qty', e.target.value)}
          onFocus={e => e.target.select()}
          placeholder="1"
          title="Quantity — the base quantity for this line"
        />

        {/* Unit (UOM) — same div trick to avoid chevron overlap */}
        <Select value={item.unit} onValueChange={v => onChange(item.id, 'unit', v)}>
          <SelectTrigger className="h-8 text-sm pr-7 pl-3">
            <div className="flex-1 overflow-hidden text-left">
              <div className="truncate text-sm leading-tight">{item.unit || 'unit'}</div>
            </div>
          </SelectTrigger>
          <SelectContent>
            {UNITS.map(u => <SelectItem key={u} value={u} className="text-sm">{u}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Cost per unit (moved up from Row 2 per Tyler's column order) */}
        <div className="relative">
          <Lock className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            className="h-8 text-sm text-right pl-6 bg-gray-50 border-gray-200 tabular-nums"
            type="number"
            value={item.subCost || ''}
            onChange={e => handleNum('subCost', e.target.value)}
            onFocus={e => e.target.select()}
            placeholder="0.00"
            title="Cost per unit — what it costs Skyeline per unit. Multiplies with Qty for row cost total."
          />
        </div>

        {/* Sell per unit */}
        <Input
          className="h-8 text-sm text-right border-blue-200 bg-blue-50/30 focus-visible:ring-blue-300 tabular-nums"
          type="number"
          value={item.unitCost || ''}
          onChange={e => handleNum('unitCost', e.target.value)}
          onFocus={e => e.target.select()}
          placeholder="0.00"
          title="Sell price per unit — what the client pays per unit. Multiplies with Qty for Owner Price."
        />

        <button
          title="Measure from plans"
          onClick={() => onMeasure(item.id)}
          className={`h-8 w-8 flex items-center justify-center rounded border transition-colors ${
            item.takeoffMeasurementId
              ? 'border-amber-400 bg-amber-50 text-amber-600'
              : 'border-gray-200 text-gray-400 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50'
          }`}
        >
          <Ruler className="h-4 w-4" />
        </button>

        <SubPickerButton
          assignedSubIds={item.assignedSubIds}
          trade={item.trade}
          onChange={ids => onChange(item.id, 'assignedSubIds', ids)}
        />
      </div>

      {/* ── Row 2: Sub $ | Client $ | Profit | Total | Delete ───────────────── */}
      {/* ── Row 2 column headers ── Derived values + line controls. Total Qty + Owner Price
          live here as DISPLAYED results (no longer editable inputs) per Tyler's spec. */}
      <div className="grid gap-2 text-[10px] font-medium uppercase tracking-wider text-gray-400 px-0.5 mt-1.5"
        style={{ gridTemplateColumns: '140px 100px 1fr 140px 140px 150px 34px' }}>
        <span className="text-right">Builder Cost</span>
        <span className="text-right">Markup %</span>
        <span className="text-center">Profit (internal)</span>
        <span className="text-right">Owner Price</span>
        <span className="text-right">Contractor Fee</span>
        <span className="text-right">Total Cost</span>
        <span />
      </div>
      <div className="grid gap-2 items-center"
        style={{ gridTemplateColumns: '140px 100px 1fr 140px 140px 150px 34px' }}>

        {/* Builder Cost — Tyler's internal cost (Qty × Cost/unit). NEVER shown to client. */}
        <div
          className="h-8 flex items-center justify-end text-sm font-semibold pr-2 rounded border bg-gray-50 border-gray-200 text-gray-800 tabular-nums"
          title={subCost > 0 ? `Builder Cost (internal) = ${qty} × ${fmt(subCost)} = ${fmt(qty * subCost)}` : 'Enter Cost / unit to see Builder Cost'}
        >
          {subCost > 0 && qty > 0 ? fmt(qty * subCost) : <span className="text-gray-300">—</span>}
        </div>

        {/* Markup % — editable. Defaults to the estimate's global markup; type a
            value to override on this line only. Changing it auto-fills the Sell
            price (Cost × (1 + markup/100)). Clear the field to revert to global. */}
        <div className="relative">
          <Input
            type="number"
            step={0.5}
            value={item.markupPctLine || ''}
            onChange={e => handleMarkupChange(e.target.value)}
            onFocus={e => e.target.select()}
            placeholder={String(globalMarkupPct)}
            className="h-8 text-xs text-right pr-5"
            title={
              typeof item.markupPctLine === 'number'
                ? `Per-line override: ${item.markupPctLine}%. Clear to revert to estimate default (${globalMarkupPct}%).`
                : `Inheriting estimate default (${globalMarkupPct}%). Type a value to override on this line only.`
            }
            style={typeof item.markupPctLine === 'number' ? { fontWeight: 600 } : {}}
          />
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">%</span>
        </div>

        {/* Profit pill — internal-only. Skyeline's actual profit = Total Cost − Builder Cost.
            Reflects both Tyler's price negotiation (Cost vs Sell delta) AND the contractor fee. */}
        <div className="flex items-center justify-center">
          {(subCost > 0 || clientUnit > 0) ? (() => {
            const builderCost = qty * subCost;
            const ownerPrice = qty * clientUnit;
            const contractorFee = ownerPrice * (effectiveMarkup / 100);
            const totalCost = ownerPrice + contractorFee;
            const profit = totalCost - builderCost;
            const margin = totalCost > 0 ? (profit / totalCost) * 100 : 0;
            const cls = profit < 0 ? 'bg-red-100 text-red-700 border-red-200'
                      : margin < 10 ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-green-100 text-green-700 border-green-200';
            return (
              <span className={`inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border whitespace-nowrap ${cls}`}>
                {profit >= 0 ? '+' : ''}{fmt(profit)}
                {totalCost > 0 && <span className="opacity-70"> · {margin.toFixed(0)}%</span>}
              </span>
            );
          })() : <span className="text-xs text-gray-300">—</span>}
        </div>

        {/* Owner Price — Qty × Sell/unit. CLIENT-VISIBLE — what the client pays for the work itself,
            before the contractor fee. Tyler controls Sell directly so he can pass material savings on. */}
        <div
          className="h-8 flex items-center justify-end text-sm font-semibold pr-2 rounded border bg-blue-50/40 border-blue-200 text-gray-900 tabular-nums"
          title={clientUnit > 0 ? `Owner Price = ${qty} × ${fmt(clientUnit)} = ${fmt(qty * clientUnit)} (client-visible base)` : 'Enter Sell / unit to see Owner Price'}
        >
          {clientUnit > 0 && qty > 0 ? fmt(qty * clientUnit) : <span className="text-gray-300">—</span>}
        </div>

        {/* Contractor Fee — Owner Price × Markup%. CLIENT-VISIBLE separately. */}
        <div
          className="h-8 flex items-center justify-end text-sm font-semibold pr-2 rounded border tabular-nums"
          style={{ borderColor: 'rgba(201,169,110,0.4)', backgroundColor: 'rgba(201,169,110,0.06)', color: '#8B6F3F' }}
          title={clientUnit > 0 && qty > 0 ? `Contractor Fee = Owner Price × ${effectiveMarkup}% = ${fmt(qty * clientUnit)} × ${effectiveMarkup}% = ${fmt(qty * clientUnit * (effectiveMarkup / 100))}` : 'Enter Sell + Markup to see fee'}
        >
          {clientUnit > 0 && qty > 0 ? fmt(qty * clientUnit * (effectiveMarkup / 100)) : <span className="text-gray-300">—</span>}
        </div>

        {/* Total Cost — Owner Price + Contractor Fee. What the client owes for this line. */}
        <div
          className="h-8 flex items-center justify-end text-sm font-bold pr-2 rounded border tabular-nums"
          style={{ borderColor: 'rgba(201,169,110,0.6)', backgroundColor: 'rgba(201,169,110,0.15)', color: '#141414' }}
          title={`Total Cost = Owner Price + Contractor Fee = ${fmt(qty * clientUnit)} + ${fmt(qty * clientUnit * (effectiveMarkup / 100))} = ${fmt(qty * clientUnit * (1 + effectiveMarkup / 100))}`}
        >
          {clientUnit > 0 && qty > 0 ? fmt(qty * clientUnit * (1 + effectiveMarkup / 100)) : <span className="text-gray-300">—</span>}
        </div>

        {/* Delete */}
        <button onClick={() => onDelete(item.id)} className="h-8 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Under-line (A+i inline strip): Owner Price − Sub charges = Potential profit.
          This is the explicit math Tyler asked for — top line total minus sub charges
          gives potential profit, with each component spelled out. */}
      {subCost > 0 || clientUnit > 0 || item.needsSelection || item.splitLaborMaterial ? (
        <div
          className="mt-1 ml-1 flex items-center gap-3 flex-wrap text-[11px] pl-2 py-1.5 rounded"
          style={{ borderLeft: '3px solid #C9A96E', backgroundColor: 'rgba(201,169,110,0.05)' }}
        >
          {clientUnit > 0 && qty > 0 ? (() => {
            const ownerPrice = qty * clientUnit;
            const fee = ownerPrice * (effectiveMarkup / 100);
            const totalCost = ownerPrice + fee;
            return (
              <>
                <span className="text-gray-500">
                  Owner Price <strong className="text-gray-900">{fmt(ownerPrice)}</strong>
                  <span className="text-gray-400 text-[10px] ml-0.5">(client base)</span>
                </span>
                <span className="text-gray-400">+</span>
                <span className="text-gray-500">
                  Contractor Fee <strong style={{ color: '#8B6F3F' }}>{fmt(fee)}</strong>
                  <span className="text-gray-400 text-[10px] ml-0.5">({effectiveMarkup}%)</span>
                </span>
                <span className="text-gray-400">=</span>
                <span className="text-green-800">
                  Total Cost <strong>{fmt(totalCost)}</strong>
                </span>
                {subCost > 0 && (
                  <span className="text-gray-400 text-[10px] ml-2">
                    · Internal cost {fmt(qty * subCost)} → profit {fmt(totalCost - qty * subCost)}
                  </span>
                )}
              </>
            );
          })() : (
            <span className="text-gray-400 text-[10px] italic">Enter Sell / unit (what the client sees as Owner Price) + Markup to see the breakdown</span>
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

      {/* Bid match chips — every project bid whose subContactId is in this
          line's assignedSubIds and whose trade matches. One-click applies the
          bid total as the line's Builder Cost. */}
      {matchingBids.length > 0 && (
        <div className="mt-1 ml-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {matchingBids.map(bid => {
            const isApplied = item.awardedBidId === bid.id;
            const total = bid.totalAmount || 0;
            return (
              <span key={bid.id} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => isApplied ? clearAppliedBid() : applyBid(bid)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors ${
                    isApplied
                      ? 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100'
                      : 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                  }`}
                  title={isApplied
                    ? `Applied — click to unlink this bid from the line`
                    : `Apply ${fmt(total)} from this bid as Builder Cost`}
                >
                  {isApplied ? <Check className="w-3 h-3" /> : <DollarSign className="w-3 h-3" />}
                  {isApplied ? 'Bid applied' : 'Apply bid'}
                  <span className="font-mono font-semibold">{fmt(total)}</span>
                  {bid.subName && <span className="text-[10px] opacity-70">· {bid.subName}</span>}
                  {bid.status === 'awarded' && <span className="ml-0.5 text-[9px] uppercase tracking-wide opacity-70">awarded</span>}
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ est, onEdit, onDelete, onMoveTo, isOrphan, onCreateLead }: {
  est: Estimate;
  onEdit: () => void;
  onDelete: () => void;
  onMoveTo: (stage: PipelineStage) => void;
  isOrphan?: boolean;
  onCreateLead?: () => void;
}) {
  const currentStage = getPipelineStage(est);
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-sm transition-shadow"
      onClick={onEdit}
      style={isOrphan ? { borderColor: 'rgba(245,158,11,0.4)' } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-gray-900 truncate leading-snug">{est.title}</p>
          {est.clientName && <p className="text-xs text-gray-500 truncate mt-0.5">{est.clientName}</p>}
          {isOrphan && (
            <p className="text-[10px] text-amber-700 mt-0.5 font-medium flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              No lead — create one
            </p>
          )}
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
            {isOrphan && onCreateLead && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCreateLead} className="text-amber-700">
                  <Plus className="h-4 w-4 mr-2" /> Create lead from this
                </DropdownMenuItem>
              </>
            )}
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

function KanbanColumn({ stage, label, accent, estimates, onEdit, onDelete, onMoveTo, isOrphan, onCreateLead }: {
  stage: PipelineStage; label: string; accent: string; estimates: Estimate[];
  onEdit: (est: Estimate) => void; onDelete: (est: Estimate) => void;
  onMoveTo: (est: Estimate, stage: PipelineStage) => void;
  isOrphan?: (est: Estimate) => boolean;
  onCreateLead?: (est: Estimate) => void;
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
            onMoveTo={s => onMoveTo(est, s)}
            isOrphan={isOrphan?.(est)}
            onCreateLead={onCreateLead ? () => onCreateLead(est) : undefined}
          />
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
  const defaultItems = () => FALLBACK_TRADES.slice(0, 5).map(t => newLineItem(t));

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
  // Live bids on the current project — surfaces "Apply bid" chips on any
  // line where a project bid matches both trade and one of the assigned subs.
  const [projectBids, setProjectBids] = useState<MatchableBid[]>([]);
  useEffect(() => {
    if (!projectId) { setProjectBids([]); return; }
    const q = query(collection(db, 'bids'), where('projectId', '==', projectId));
    const unsub = onSnapshot(q,
      snap => setProjectBids(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MatchableBid, 'id'>) }))),
      () => setProjectBids([]),
    );
    return () => unsub();
  }, [projectId]);
  const [lineStatusFilter, setLineStatusFilter] = useState<'all' | 'inc' | 'allow' | 'not-incl'>('all');
  const [saving, setSaving]         = useState(false);
  const [expandedTrades, setExpandedTrades] = useState<Set<string>>(new Set(FALLBACK_TRADES));
  // Live trade list from Firestore (same source as Contacts → Trades)
  const [firestoreTrades, setFirestoreTrades] = useState<string[]>([]);
  useEffect(() => {
    getDocs(query(collection(db, 'trades'), orderBy('name'))).then(snap => {
      const names = snap.docs
        .filter(d => (d.data() as any).isActive !== false)
        .map(d => (d.data() as any).name as string)
        .filter(Boolean);
      if (names.length) setFirestoreTrades(names);
    }).catch(() => {});
  }, [open]);

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

  // Group items by resolved trade label. Each unique trade in the item list
  // gets its own section, even if it's a legacy short-key.
  const allTradeLabels = buildTradeList(firestoreTrades);
  const matchesFilter = (i: LineItem) => {
    const s = i.lineStatus ?? 'inc';
    switch (lineStatusFilter) {
      case 'all':      return true;
      case 'inc':      return s === 'inc';
      case 'allow':    return s === 'allow';
      case 'not-incl': return s === 'ex' || s === 'note';
    }
  };
  const grouped = (() => {
    const filteredItems = items.filter(matchesFilter);
    const seen = new Set<string>();
    const groups: { label: string; items: LineItem[] }[] = [];
    // First pass: ordered by allTradeLabels
    for (const label of allTradeLabels) {
      const grpItems = filteredItems.filter(i => resolveTradeLabel(i.trade) === label || i.trade === label);
      if (grpItems.length > 0) { seen.add(label); groups.push({ label, items: grpItems }); }
    }
    // Second pass: any items whose trade wasn't covered
    for (const item of filteredItems) {
      const label = resolveTradeLabel(item.trade);
      if (!seen.has(label)) { seen.add(label); groups.push({ label, items: filteredItems.filter(i => resolveTradeLabel(i.trade) === label || i.trade === label) }); }
    }
    return groups;
  })();

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

            <div className="sm:col-span-3">
              <div className="flex items-end gap-3 p-3 rounded-lg border" style={{ borderColor: 'rgba(201,169,110,0.4)', backgroundColor: 'rgba(201,169,110,0.06)' }}>
                <div className="flex-1 space-y-1">
                  <Label className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" style={{ color: '#C9A96E' }} />
                    Default Markup %
                  </Label>
                  <p className="text-xs text-gray-500">Applied to every line item by default. Each row's Markup % cell overrides this on a per-line basis.</p>
                </div>
                <div className="w-32 flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={500}
                    step={0.5}
                    value={markupPct}
                    onChange={e => setMarkupPct(parseFloat(e.target.value) || 0)}
                    onFocus={e => e.target.select()}
                    className="text-right font-semibold"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>
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
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="font-semibold text-gray-800">Scope of Work</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter chips — show All, only allowances, only excluded/note items. */}
                {([
                  { id: 'all',       label: 'All',           count: items.length },
                  { id: 'inc',       label: 'Included',      count: items.filter(i => (i.lineStatus ?? 'inc') === 'inc').length },
                  { id: 'allow',     label: 'Allowances',    count: items.filter(i => i.lineStatus === 'allow').length },
                  { id: 'not-incl',  label: 'Not in price',  count: items.filter(i => i.lineStatus === 'ex' || i.lineStatus === 'note').length },
                ] as const).map(f => {
                  const active = lineStatusFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setLineStatusFilter(f.id)}
                      className="text-[11px] px-2 py-1 rounded-full border transition-colors"
                      style={active
                        ? { backgroundColor: '#141414', borderColor: '#141414', color: 'white' }
                        : { backgroundColor: 'white', borderColor: '#E5E7EB', color: '#6B7280' }}
                    >
                      {f.label} <span className="opacity-60">({f.count})</span>
                    </button>
                  );
                })}
                <span className="text-gray-300">·</span>
                <span className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Top = client
                  <Lock className="w-3 h-3 ml-1" /> Lower = internal
                </span>
              </div>
            </div>

            {/* Column headers — row 1 */}
            <div className="hidden sm:grid text-xs text-gray-400 font-medium px-1 mb-1 gap-2"
              style={{ gridTemplateColumns: '200px 1fr 72px 130px 34px' }}>
              <span>Trade</span>
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span>Unit</span>
              <span title="Measure from plans"><Ruler className="h-3 w-3 text-gray-300" /></span>
            </div>

            {grouped.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">Add line items below to build the estimate.</p>
            )}

            <div className="space-y-1">
              {grouped.map(({ label, items: tradeItems }) => (
                <div key={label}>
                  <div className="flex items-center gap-2 w-full py-1.5 px-1 hover:bg-gray-50 rounded group">
                    <button
                      type="button"
                      className="flex items-center gap-2 flex-1 text-left min-w-0"
                      onClick={() => setExpandedTrades(prev => {
                        const next = new Set(prev);
                        next.has(label) ? next.delete(label) : next.add(label);
                        return next;
                      })}
                    >
                      {expandedTrades.has(label)
                        ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                      }
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide truncate">{label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setExpandedTrades(prev => {
                          const next = new Set(prev);
                          next.add(label);
                          return next;
                        });
                        addItem(label);
                      }}
                      className="text-[11px] px-2 py-0.5 rounded-full border border-dashed text-gray-500 hover:text-amber-900 hover:bg-amber-50 transition-colors flex-shrink-0"
                      style={{ borderColor: 'rgba(201,169,110,0.4)' }}
                      title={`Add another ${label} line (e.g. split material / labor / equipment)`}
                    >
                      + line
                    </button>
                    <span className="text-xs text-gray-400 ml-1 flex-shrink-0">{fmt(tradeItems.reduce((s, i) => s + i.total, 0))}</span>
                  </div>
                  {expandedTrades.has(label) && (
                    <div className="ml-5 border-l border-gray-100 pl-3">
                      {tradeItems.map(item => (
                        <LineItemRow key={item.id} item={item} onChange={changeItem} onDelete={deleteItem} onMeasure={setMeasuringItemId} tradeOptions={firestoreTrades} globalMarkupPct={markupPct} projectBids={projectBids} />
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
                {allTradeLabels.map(label => (
                  <button
                    key={label}
                    onClick={() => addItem(label)}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900 transition-colors"
                  >
                    + {label}
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

interface EstimateBuilderContentProps {
  projectId?: string;
  projectName?: string;
  embedded?: boolean; // true = no AppLayout wrapper
}

export function EstimateBuilderContent({ projectId, projectName, embedded = false }: EstimateBuilderContentProps) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [, setLocation] = useLocation();
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

  // ── Load estimates (optionally scoped to a project) ───────────────────────
  useEffect(() => {
    const q = projectId
      ? query(collection(db, 'estimates'), where('projectId', '==', projectId), orderBy('createdAt', 'desc'))
      : query(collection(db, 'estimates'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setEstimates(snap.docs.map(d => ({ id: d.id, ...d.data() } as Estimate)));
      setLoading(false);
    });
  }, [projectId]);

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
    const ok = await confirm({
      title: `Delete "${est.title}"?`,
      description: 'This cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
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

  // ── Orphan estimates (no matching client) → quick-action "Create lead" ────
  // An estimate is "orphan" when its clientId is missing OR doesn't point to a
  // current client in the CRM. We surface a one-click "Create lead from this"
  // action that deep-links into /sales with the estimate's data pre-filled.
  const clientIdsSet = useMemo(() => new Set(clients.map(c => c.id)), [clients]);
  const isEstimateOrphan = (est: Estimate) =>
    !est.clientId || !clientIdsSet.has(est.clientId);
  const createLeadFromEstimate = (est: Estimate) => {
    const params = new URLSearchParams({
      newLead: '1',
      fromEstimateId: est.id,
      name: est.clientName || est.title || '',
      address: est.jobAddress || '',
      amount: String(est.totalAmount || 0),
    });
    setLocation(`/sales?${params.toString()}`);
  };

  // ── Filtered ──────────────────────────────────────────────────────────────
  const filtered = estimates.filter(e => {
    const matchSearch = !search || [e.title, e.clientName, e.jobAddress]
      .filter(Boolean).some(v => v!.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const content = (
    <>
      <div className="space-y-5">
        {/* ── JACK-style header ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-heading font-semibold text-brand-black" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
            {projectName ? `${projectName} — Estimates` : 'Estimates'}
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
                  onMoveTo={handleMoveTo}
                  isOrphan={isEstimateOrphan}
                  onCreateLead={createLeadFromEstimate} />
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
    </>
  );

  if (embedded) return content;
  return <AppLayout>{content}</AppLayout>;
}

export default function EstimateBuilder() {
  return <EstimateBuilderContent />;
}
