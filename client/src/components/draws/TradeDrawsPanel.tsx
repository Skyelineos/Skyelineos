import { useEffect, useMemo, useState } from 'react';
import {
  doc, collection, onSnapshot, addDoc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Wallet, TrendingUp, AlertTriangle } from 'lucide-react';
import { tradeProgress, fmtCurrency } from '@/lib/draws/aggregate';
import type { Draw } from '@/lib/draws/types';
import type { BudgetSnapshot } from '@/lib/estimates/types';

const GOLD = '#C9A96E';
const DARK = '#141414';

interface Props {
  projectId: string;
}

export function TradeDrawsPanel({ projectId }: Props) {
  const [budget, setBudget]   = useState<BudgetSnapshot | undefined>(undefined);
  const [draws, setDraws]     = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogTrade, setDialogTrade] = useState<{ id: string; label: string; suggested: number } | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Subscribe to project doc (for budget) + draws subcollection ─────────
  useEffect(() => {
    const unsubProj = onSnapshot(doc(db, 'projects', projectId), snap => {
      if (snap.exists()) {
        setBudget(snap.data().budget as BudgetSnapshot | undefined);
      }
      setLoading(false);
    });
    const unsubDraws = onSnapshot(
      query(collection(db, 'projects', projectId, 'draws'), orderBy('createdAt', 'desc')),
      snap => {
        setDraws(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Draw, 'id'>) })));
      },
    );
    return () => { unsubProj(); unsubDraws(); };
  }, [projectId]);

  const progress = useMemo(() => tradeProgress(budget, draws), [budget, draws]);
  const totals = useMemo(() => {
    const t = { budget: 0, drawn: 0, pending: 0, remaining: 0 };
    for (const p of progress) {
      t.budget    += p.budgetAmount;
      t.drawn     += p.drawsTotal;
      t.pending   += p.drawsPending;
      t.remaining += p.remaining;
    }
    return t;
  }, [progress]);

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>
    );
  }

  if (!budget) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-900 mb-0.5">No signed budget yet</h3>
              <p className="text-sm text-amber-900">
                Sign this project's contract from the Estimates page (Costings tab → <strong>Sign Contract</strong>) to lock in the budget. Draws are derived from per-trade budget allocations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Contract total"        value={fmtCurrency(totals.budget)} />
        <Stat label="Drawn (approved/paid)" value={fmtCurrency(totals.drawn)} accent />
        <Stat label="Pending draws"         value={fmtCurrency(totals.pending)} />
        <Stat label="Remaining to draw"     value={fmtCurrency(totals.remaining)} />
      </div>

      {/* Per-trade table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#E5E7EB' }}>
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4" style={{ color: GOLD }} />
              <h3 className="text-sm font-semibold" style={{ color: DARK }}>Draws by trade</h3>
            </div>
            <Badge variant="outline" className="text-xs">{progress.length} trade{progress.length === 1 ? '' : 's'}</Badge>
          </div>

          {progress.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No trades budgeted yet.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium">
                <div className="col-span-3">Trade</div>
                <div className="col-span-2 text-right">Budget</div>
                <div className="col-span-2 text-right">Drawn</div>
                <div className="col-span-2 text-right">Pending</div>
                <div className="col-span-2 text-right">Remaining</div>
                <div className="col-span-1" />
              </div>

              {progress.map(p => {
                const pct = p.budgetAmount > 0 ? Math.min(100, (p.drawsTotal / p.budgetAmount) * 100) : 0;
                return (
                  <div key={p.trade || '__uncat__'} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50">
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: DARK }}>{p.tradeLabel}</p>
                      <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: GOLD }} />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">{pct.toFixed(0)}% drawn</p>
                    </div>
                    <div className="col-span-2 text-right text-sm font-medium tabular-nums">{fmtCurrency(p.budgetAmount)}</div>
                    <div className="col-span-2 text-right text-sm tabular-nums" style={{ color: '#0F6F40' }}>{fmtCurrency(p.drawsTotal)}</div>
                    <div className="col-span-2 text-right text-sm tabular-nums text-gray-500">{fmtCurrency(p.drawsPending)}</div>
                    <div className="col-span-2 text-right text-sm font-medium tabular-nums" style={{ color: p.remaining > 0 ? DARK : '#9CA3AF' }}>
                      {fmtCurrency(p.remaining)}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={p.remaining <= 0}
                        onClick={() => setDialogTrade({ id: p.trade, label: p.tradeLabel, suggested: p.remaining })}
                        className="h-7 px-2 text-xs"
                        title={p.remaining > 0 ? 'Create a draft draw for this trade' : 'Fully drawn'}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All draws (any status) */}
      {draws.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#E5E7EB' }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" style={{ color: GOLD }} />
                <h3 className="text-sm font-semibold" style={{ color: DARK }}>All draws</h3>
              </div>
              <Badge variant="outline" className="text-xs">{draws.length}</Badge>
            </div>
            <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
              {draws.map(d => (
                <div key={d.id} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-sm">
                  <div className="col-span-4 min-w-0">
                    <p className="font-medium truncate" style={{ color: DARK }}>{d.name || '(unnamed)'}</p>
                    {d.notes && <p className="text-xs text-gray-500 truncate">{d.notes}</p>}
                  </div>
                  <div className="col-span-2 text-xs text-gray-500 truncate">{d.trade || '—'}</div>
                  <div className="col-span-2 text-right tabular-nums font-medium">{fmtCurrency(d.amount)}</div>
                  <div className="col-span-2"><DrawStatusBadge status={d.status} /></div>
                  <div className="col-span-2 text-xs text-right text-gray-500">{d.scheduledDate || ''}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create-draw dialog */}
      <CreateDrawDialog
        projectId={projectId}
        trade={dialogTrade}
        onClose={() => setDialogTrade(null)}
        userId={user?.id?.toString() || user?.email || 'unknown'}
        onCreated={() => {
          toast({ title: 'Draft draw created' });
          setDialogTrade(null);
        }}
      />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border rounded-md p-3" style={{ borderColor: '#E5E7EB' }}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-lg font-semibold mt-0.5" style={accent ? { color: '#0F6F40' } : { color: DARK }}>{value}</p>
    </div>
  );
}

function DrawStatusBadge({ status }: { status: Draw['status'] }) {
  const map: Record<Draw['status'], { color: string; bg: string; label: string }> = {
    draft:     { color: '#6B7280', bg: 'rgba(107,114,128,0.12)',    label: 'Draft' },
    pending:   { color: '#B45309', bg: 'rgba(180,83,9,0.12)',       label: 'Pending' },
    submitted: { color: '#1D4ED8', bg: 'rgba(29,78,216,0.12)',      label: 'Submitted' },
    approved:  { color: '#0F6F40', bg: 'rgba(15,111,64,0.12)',      label: 'Approved' },
    paid:      { color: '#065F46', bg: 'rgba(6,95,70,0.15)',        label: 'Paid' },
  };
  const m = map[status] ?? map.draft;
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ color: m.color, backgroundColor: m.bg }}>
      {m.label}
    </span>
  );
}

function CreateDrawDialog({
  projectId, trade, onClose, userId, onCreated,
}: {
  projectId: string;
  trade: { id: string; label: string; suggested: number } | null;
  onClose: () => void;
  userId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [milestone, setMilestone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (trade) {
      setName(`${trade.label} draw`);
      setAmount(String(Math.round(trade.suggested)));
      setMilestone(`${trade.label} milestone`);
      setNotes('');
      setScheduledDate(new Date().toISOString().split('T')[0]);
    }
  }, [trade]);

  if (!trade) return null;

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!name.trim() || Number.isNaN(amt) || amt <= 0) {
      toast({ title: 'Fill in name + amount', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'projects', projectId, 'draws'), {
        projectId,
        trade: trade.id,
        name: name.trim(),
        amount: amt,
        milestone: milestone.trim() || undefined,
        scheduledDate: scheduledDate || undefined,
        notes: notes.trim() || undefined,
        status: 'draft' as const,
        createdAt: serverTimestamp(),
        createdBy: userId,
      });
      onCreated();
    } catch (e: any) {
      toast({ title: 'Could not create draw', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5" style={{ color: GOLD }} />
            New draft draw — {trade.label}
          </DialogTitle>
          <DialogDescription>
            Drafts aren't sent to the client. Save it now, edit later, and submit when you're ready to bill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">Draw name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={`${trade.label} draw`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount</Label>
              <Input type="number" min={0} step={100} value={amount} onChange={e => setAmount(e.target.value)} />
              <p className="text-[10px] text-gray-500 mt-0.5">Suggested: {fmtCurrency(trade.suggested)} (remaining)</p>
            </div>
            <div>
              <Label className="text-xs">Scheduled date</Label>
              <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Milestone</Label>
            <Input value={milestone} onChange={e => setMilestone(e.target.value)} placeholder="e.g., Drywall complete" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional context for the client" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: GOLD, color: DARK }}
            className="hover:opacity-90"
          >
            {saving ? 'Saving…' : 'Save draft draw'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
