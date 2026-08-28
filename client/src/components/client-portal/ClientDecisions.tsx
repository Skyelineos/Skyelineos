/**
 * ClientDecisions — Pillar 3: Decision Clarity
 *
 * Answers the question every homeowner has: "What do I need to decide RIGHT NOW?"
 *
 * Three sections:
 *   1. URGENT   — anything due within 7 days (amber card, cannot be missed)
 *   2. PENDING  — all items needing a decision, with countdown + action buttons
 *   3. COMPLETE — collapsed history of past decisions
 *
 * Data sources:
 *   - projects/{id}/selections  (pending finish/material decisions)
 *   - changeOrders collection  (pending change orders needing review)
 *   - decisions collection     (completed client-visible log)
 *
 * Actions:
 *   - "Approve" on a selection → sets clientApprovalStatus = 'Approved'
 *   - "Need More Time" → flags clientNeedsMoreTime + timestamp (PM notified)
 *   - "Review Change Order" → navigates to change-orders tab
 */

import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  addDoc,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Palette,
  BookOpen,
  GitPullRequest,
  Sparkles,
  ThumbsUp,
  Timer,
  PartyPopper,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectionDoc {
  id: string;
  category?: string;
  area?: string;
  room?: string;
  floor?: string;
  item?: string;
  description?: string;
  notes?: string;
  dueDate?: any;
  clientApprovalStatus?: string;
  status?: string;
  clientNeedsMoreTime?: boolean;
  selectionGuideUrl?: string;
  imageUrl?: string;
}

interface ChangeOrderDoc {
  id: string;
  title?: string;
  description?: string;
  amount?: number;
  status?: string;
  createdAt?: any;
}

interface DecisionLogDoc {
  id: string;
  title?: string;
  summary?: string;
  kind?: string;
  decidedOn?: string;
  createdAt?: any;
  createdByName?: string;
  visibility?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDue(raw: any): Date | null {
  if (!raw) return null;
  if (raw?.toDate) return raw.toDate();
  if (raw?.seconds) return new Date(raw.seconds * 1000);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function daysFromNow(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d = new Date(d);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function fmtDue(d: Date | null, days: number | null): string {
  if (!d) return 'No due date';
  if (days === null) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} day${days !== 1 ? 's' : ''}`;
}

function isUnapproved(s: SelectionDoc): boolean {
  const st = s.clientApprovalStatus || s.status || '';
  return st !== 'Approved' && st !== 'approved' && st !== 'Client Approved';
}

function selectionLabel(s: SelectionDoc): string {
  return s.category || s.item || s.area || s.room || 'Selection';
}

function selectionDescription(s: SelectionDoc): string {
  const parts: string[] = [];
  if (s.room && s.room !== selectionLabel(s)) parts.push(s.room);
  if (s.floor) parts.push(s.floor);
  if (s.area && s.area !== selectionLabel(s)) parts.push(s.area);
  if (s.description) parts.push(s.description);
  return parts.join(' · ') || s.notes || 'Finish selection decision';
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ─── Countdown Chip ───────────────────────────────────────────────────────────

function DueChip({ days }: { days: number | null }) {
  if (days === null) return <span className="text-xs text-gray-400">No deadline</span>;
  const overdue = days < 0;
  const urgent = days >= 0 && days <= 3;
  const soon = days > 3 && days <= 7;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
      overdue ? 'bg-red-100 text-red-700' :
      urgent ? 'bg-amber-100 text-amber-700' :
      soon ? 'bg-yellow-50 text-yellow-700' :
      'bg-gray-100 text-gray-600'
    }`}>
      <Clock className="w-3 h-3" />
      {overdue ? `${Math.abs(days)}d overdue` :
       days === 0 ? 'Due today' :
       days === 1 ? 'Tomorrow' :
       `${days} days`}
    </span>
  );
}

// ─── Selection Decision Card ──────────────────────────────────────────────────

function SelectionCard({
  sel,
  projectId,
  onAction,
}: {
  sel: SelectionDoc;
  projectId: string;
  onAction: () => void;
}) {
  const { toast } = useToast();
  const [approving, setApproving] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const dueDate = parseDue(sel.dueDate);
  const days = daysFromNow(dueDate);

  const handleApprove = async () => {
    setApproving(true);
    try {
      await updateDoc(doc(db, 'projects', projectId, 'selections', sel.id), {
        clientApprovalStatus: 'Approved',
        clientApprovedAt: serverTimestamp(),
        clientApprovedBy: auth.currentUser?.uid || '',
      });
      // Log a decision entry
      await addDoc(collection(db, 'decisions'), {
        projectId,
        title: `Approved: ${selectionLabel(sel)}`,
        summary: selectionDescription(sel),
        kind: 'selection',
        visibility: 'client-visible',
        subjectRef: { collection: `projects/${projectId}/selections`, id: sel.id, label: selectionLabel(sel) },
        createdBy: auth.currentUser?.uid || '',
        createdByName: auth.currentUser?.displayName || 'Client',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: '✓ Selection approved', description: selectionLabel(sel) });
      onAction();
    } catch (e: any) {
      toast({ title: 'Could not approve', description: e.message, variant: 'destructive' });
    } finally {
      setApproving(false);
    }
  };

  const handleNeedMoreTime = async () => {
    setFlagging(true);
    try {
      await updateDoc(doc(db, 'projects', projectId, 'selections', sel.id), {
        clientNeedsMoreTime: true,
        clientNeedsMoreTimeAt: serverTimestamp(),
        clientNeedsMoreTimeBy: auth.currentUser?.uid || '',
      });
      toast({
        title: 'Noted — we\'ll follow up',
        description: `Your GC has been notified you need more time on "${selectionLabel(sel)}".`,
      });
      onAction();
    } catch (e: any) {
      toast({ title: 'Could not flag', description: e.message, variant: 'destructive' });
    } finally {
      setFlagging(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Palette className="w-4 h-4 flex-shrink-0" style={{ color: '#C9A96E' }} />
            <h4 className="text-sm font-bold text-gray-900">{selectionLabel(sel)}</h4>
            {sel.clientNeedsMoreTime && (
              <Badge className="bg-blue-50 text-blue-700 text-[10px]">Extension requested</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 line-clamp-2">{selectionDescription(sel)}</p>
        </div>
        <DueChip days={days} />
      </div>

      {sel.selectionGuideUrl && (
        <a
          href={sel.selectionGuideUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium mb-3"
          style={{ color: '#8a6a3a' }}
        >
          <BookOpen className="w-3.5 h-3.5" />
          View selection guide
          <ChevronRight className="w-3 h-3" />
        </a>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={handleApprove}
          disabled={approving || flagging}
          className="font-semibold"
          style={{ backgroundColor: '#C9A96E', color: '#141414' }}
        >
          {approving ? (
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 animate-spin" /> Approving…</span>
          ) : (
            <span className="flex items-center gap-1.5"><ThumbsUp className="w-3.5 h-3.5" /> I've Decided</span>
          )}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleNeedMoreTime}
          disabled={approving || flagging || sel.clientNeedsMoreTime}
          className="text-gray-700 border-gray-300"
        >
          {flagging ? (
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 animate-spin" /> Notifying…</span>
          ) : (
            <span className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5" />
              {sel.clientNeedsMoreTime ? 'Extension sent' : 'Need More Time'}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Change Order Decision Card ────────────────────────────────────────────────

function ChangeOrderCard({
  co,
  onNavigate,
}: {
  co: ChangeOrderDoc;
  onNavigate: () => void;
}) {
  const days = daysFromNow(parseDue(co.createdAt));
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <GitPullRequest className="w-4 h-4 flex-shrink-0 text-blue-500" />
            <h4 className="text-sm font-bold text-gray-900">{co.title || 'Change Order'}</h4>
          </div>
          {co.description && (
            <p className="text-xs text-gray-500 line-clamp-2">{co.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {co.amount !== undefined && co.amount !== 0 && (
            <p className={`text-sm font-bold ${co.amount > 0 ? 'text-amber-700' : 'text-green-700'}`}>
              {co.amount > 0 ? '+' : ''}{fmtMoney(co.amount)}
            </p>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={onNavigate}
        className="text-blue-700 border-blue-300 hover:bg-blue-50"
      >
        Review Change Order
        <ChevronRight className="w-3.5 h-3.5 ml-1" />
      </Button>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
  accent,
}: {
  icon: any;
  title: string;
  count: number;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: accent ? `${accent}18` : 'rgba(201,169,110,0.12)' }}>
        <Icon className="w-4 h-4" style={{ color: accent || '#C9A96E' }} />
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {count > 0 && (
        <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: accent || '#C9A96E' }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ClientDecisionsProps {
  projectId: string;
  onNavigate?: (tab: string) => void;
}

export default function ClientDecisions({ projectId, onNavigate }: ClientDecisionsProps) {
  const [selections, setSelections] = useState<SelectionDoc[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrderDoc[]>([]);
  const [completedDecisions, setCompletedDecisions] = useState<DecisionLogDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [tick, setTick] = useState(0);

  const forceRefresh = () => setTick(t => t + 1);

  // Pending selections (all that haven't been approved)
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'projects', projectId, 'selections'),
        orderBy('dueDate', 'asc')
      ),
      snap => {
        setSelections(
          snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(isUnapproved)
        );
        setLoading(false);
      },
      // Fallback if no index / permission
      () => {
        // Try without ordering
        getDocs(collection(db, 'projects', projectId, 'selections'))
          .then(snap => {
            setSelections(
              snap.docs
                .map(d => ({ id: d.id, ...(d.data() as any) }))
                .filter(isUnapproved)
                .sort((a, b) => {
                  const da = parseDue(a.dueDate)?.getTime() ?? Infinity;
                  const db2 = parseDue(b.dueDate)?.getTime() ?? Infinity;
                  return da - db2;
                })
            );
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      }
    );
    return unsub;
  }, [projectId, tick]);

  // Pending change orders (need client awareness)
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'changeOrders'), where('projectId', '==', projectId)),
      snap => {
        setChangeOrders(
          snap.docs
            .map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(co => co.status === 'pending')
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        );
      },
      () => {}
    );
    return unsub;
  }, [projectId, tick]);

  // Completed client-visible decisions (history)
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'decisions'),
        where('projectId', '==', projectId),
        where('visibility', '==', 'client-visible'),
        orderBy('createdAt', 'desc'),
        limit(20)
      ),
      snap => setCompletedDecisions(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))),
      () => {}
    );
    return unsub;
  }, [projectId]);

  // ── Segment pending items ─────────────────────────────────────────────────
  const urgentSelections = useMemo(() => {
    return selections.filter(s => {
      const days = daysFromNow(parseDue(s.dueDate));
      return days !== null && days <= 7;
    });
  }, [selections]);

  const nonUrgentSelections = useMemo(() => {
    return selections.filter(s => {
      const days = daysFromNow(parseDue(s.dueDate));
      return days === null || days > 7;
    });
  }, [selections]);

  const totalPending = selections.length + changeOrders.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: '#C9A96E' }} />
      </div>
    );
  }

  // ── All caught up ─────────────────────────────────────────────────────────
  if (totalPending === 0) {
    return (
      <div className="space-y-6">
        {/* All caught up state */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <PartyPopper className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="font-heading text-2xl font-bold text-emerald-800 mb-1">
            You're all caught up!
          </h2>
          <p className="text-sm text-emerald-700">
            No pending decisions right now — we'll notify you as soon as something needs your input.
          </p>
        </div>

        {/* Completed decisions history */}
        {completedDecisions.length > 0 && (
          <CompletedSection
            decisions={completedDecisions}
            expanded={completedExpanded}
            onToggle={() => setCompletedExpanded(v => !v)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Urgent Decisions (≤7 days) ────────────────────────────────── */}
      {urgentSelections.length > 0 && (
        <div>
          {/* Amber urgent banner */}
          <div className="mb-4 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 flex items-center gap-3"
            style={{ borderLeftWidth: 4 }}>
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">
                {urgentSelections.length} decision{urgentSelections.length !== 1 ? 's' : ''} due within 7 days
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                These need your attention to keep the build on schedule.
              </p>
            </div>
          </div>
          <SectionHeader
            icon={AlertTriangle}
            title="Needs Your Decision Soon"
            count={urgentSelections.length}
            accent="#d97706"
          />
          <div className="space-y-3">
            {urgentSelections.map(sel => (
              <SelectionCard
                key={sel.id}
                sel={sel}
                projectId={projectId}
                onAction={forceRefresh}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Pending Change Orders ────────────────────────────────────────── */}
      {changeOrders.length > 0 && (
        <div>
          <SectionHeader
            icon={GitPullRequest}
            title="Change Orders to Review"
            count={changeOrders.length}
            accent="#3b82f6"
          />
          <p className="text-xs text-gray-500 mb-3">
            These scope or cost changes have been submitted for your awareness. Review them in detail in the Change Orders tab.
          </p>
          <div className="space-y-3">
            {changeOrders.map(co => (
              <ChangeOrderCard
                key={co.id}
                co={co}
                onNavigate={() => onNavigate?.('change-orders')}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Remaining Pending Selections ────────────────────────────────── */}
      {nonUrgentSelections.length > 0 && (
        <div>
          <SectionHeader
            icon={Palette}
            title="Pending Selections"
            count={nonUrgentSelections.length}
          />
          <p className="text-xs text-gray-500 mb-3">
            These will need your decision before their phase begins. No rush yet — but good to review early.
          </p>
          <div className="space-y-3">
            {nonUrgentSelections.map(sel => (
              <SelectionCard
                key={sel.id}
                sel={sel}
                projectId={projectId}
                onAction={forceRefresh}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Completed Decisions ──────────────────────────────────────────── */}
      {completedDecisions.length > 0 && (
        <CompletedSection
          decisions={completedDecisions}
          expanded={completedExpanded}
          onToggle={() => setCompletedExpanded(v => !v)}
        />
      )}
    </div>
  );
}

// ─── Completed Decisions Section ──────────────────────────────────────────────

function CompletedSection({
  decisions,
  expanded,
  onToggle,
}: {
  decisions: DecisionLogDoc[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full p-4 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-gray-700">Completed Decisions</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            {decisions.length}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {decisions.map(d => (
            <CompletedDecisionRow key={d.id} decision={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function CompletedDecisionRow({ decision }: { decision: DecisionLogDoc }) {
  const { title, summary, kind, decidedOn, createdAt, createdByName } = decision;
  const Icon = kind === 'selection' ? Palette :
               kind === 'change_order' ? GitPullRequest :
               kind === 'approval' ? ThumbsUp :
               CheckCircle2;

  const dateStr = decidedOn ||
    (createdAt ? (createdAt.toDate ? createdAt.toDate() : new Date(createdAt))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '');

  return (
    <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
      <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-emerald-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{title || 'Decision'}</p>
        {summary && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{summary}</p>}
        <p className="text-[11px] text-gray-400 mt-0.5">
          {typeof dateStr === 'string' ? dateStr : (dateStr as Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {createdByName ? ` · ${createdByName}` : ''}
        </p>
      </div>
      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-1" />
    </div>
  );
}
