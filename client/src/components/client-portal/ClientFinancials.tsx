import { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, query, orderBy, addDoc, updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DollarSign, TrendingUp, TrendingDown, CheckCircle2, Clock,
  AlertTriangle, Calendar, ChevronRight, Banknote, FileText,
  Plus, ArrowUpRight, ArrowDownRight, Layers,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Draw {
  id: string;
  number: number;
  title: string;
  description?: string;
  amount: number;
  status: 'scheduled' | 'requested' | 'approved' | 'paid';
  dueDate?: string;
  paidDate?: string;
  paidAmount?: number;
  phase?: string;
  notes?: string;
  createdAt?: any;
}

interface ChangeOrder {
  id: string;
  number?: number;
  title: string;
  description?: string;
  amount: number;
  status: 'pending' | 'approved' | 'declined' | 'void';
  createdAt?: any;
}

interface ProjectFinancials {
  contractAmount?: number;
  progress?: number;
  currentPhase?: string;
  startDate?: string;
  estimatedCompletion?: string;
  actualCompletion?: string;
  name?: string;
}

const PHASES = [
  'Pre-Construction', 'Site Prep', 'Foundation', 'Framing',
  'Rough MEP', 'Insulation', 'Drywall', 'Finish Work', 'Punch List', 'Complete',
];

const DRAW_STATUS: Record<Draw['status'], { label: string; color: string; bg: string; icon: any }> = {
  scheduled: { label: 'Scheduled',         color: '#6b7280', bg: '#f3f4f6',       icon: Clock },
  requested: { label: 'Payment Requested', color: '#d97706', bg: '#fffbeb',       icon: AlertTriangle },
  approved:  { label: 'Approved',          color: '#059669', bg: '#ecfdf5',       icon: CheckCircle2 },
  paid:      { label: 'Paid',              color: '#2563eb', bg: '#eff6ff',       icon: Banknote },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function fmtDate(d: string | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysRemaining(target: string | undefined): number | null {
  if (!target) return null;
  const diff = new Date(target).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon: Icon }: {
  label: string; value: string; sub?: string; accent?: string; icon: any;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold mt-1" style={{ color: accent || '#141414' }}>{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accent || '#C9A96E'}18` }}>
          <Icon className="w-5 h-5" style={{ color: accent || '#C9A96E' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Draw Row ─────────────────────────────────────────────────────────────────

function DrawRow({ draw }: { draw: Draw }) {
  const cfg = DRAW_STATUS[draw.status];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl">
      {/* Number */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ backgroundColor: 'rgba(201,169,110,0.12)', color: '#8a6a3a' }}>
        {draw.number}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{draw.title}</p>
        {draw.description && <p className="text-xs text-gray-500 truncate">{draw.description}</p>}
        {draw.phase && <p className="text-xs text-gray-400 mt-0.5">{draw.phase}</p>}
      </div>

      {/* Date */}
      <div className="text-right hidden sm:block flex-shrink-0">
        {draw.status === 'paid' && draw.paidDate ? (
          <p className="text-xs text-gray-500">Paid {fmtDate(draw.paidDate)}</p>
        ) : draw.dueDate ? (
          <p className="text-xs text-gray-500">Due {fmtDate(draw.dueDate)}</p>
        ) : null}
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-gray-900">{fmt(draw.paidAmount ?? draw.amount)}</p>
        {draw.paidAmount != null && draw.paidAmount !== draw.amount && (
          <p className="text-xs text-gray-400 line-through">{fmt(draw.amount)}</p>
        )}
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}>
          <Icon className="w-3 h-3" />
          <span className="hidden md:inline">{cfg.label}</span>
        </span>
      </div>
    </div>
  );
}

// ─── Add Draw Dialog (GC/Admin only) ─────────────────────────────────────────

function AddDrawDialog({ projectId, drawCount, open, onClose }: {
  projectId: string; drawCount: number; open: boolean; onClose: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', amount: '', phase: '', dueDate: '', status: 'scheduled' as Draw['status'],
  });

  const handleSave = async () => {
    if (!form.title || !form.amount) {
      toast({ title: 'Title and amount are required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'projects', projectId, 'draws'), {
        number: drawCount + 1,
        title: form.title,
        description: form.description || null,
        amount: parseFloat(form.amount),
        phase: form.phase || null,
        dueDate: form.dueDate || null,
        status: form.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Draw added' });
      onClose();
      setForm({ title: '', description: '', amount: '', phase: '', dueDate: '', status: 'scheduled' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Draw / Milestone</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Foundation Draw" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount *</Label>
              <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phase</Label>
              <Select value={form.phase} onValueChange={v => setForm(p => ({ ...p, phase: v }))}>
                <SelectTrigger><SelectValue placeholder="Select phase" /></SelectTrigger>
                <SelectContent>
                  {PHASES.map(ph => <SelectItem key={ph} value={ph}>{ph}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as Draw['status'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DRAW_STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button style={{ backgroundColor: '#C9A96E', color: '#141414' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add Draw'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ClientFinancialsProps {
  projectId: string;
  userRole?: string;
}

export default function ClientFinancials({ projectId, userRole }: ClientFinancialsProps) {
  const [project, setProject] = useState<ProjectFinancials>({});
  const [draws, setDraws] = useState<Draw[]>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDrawOpen, setAddDrawOpen] = useState(false);

  const canManage = userRole === 'admin' || userRole === 'gc' || userRole === 'project_manager';

  // Project doc
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(doc(db, 'projects', projectId), snap => {
      if (snap.exists()) setProject(snap.data() as ProjectFinancials);
      setLoading(false);
    });
    return unsub;
  }, [projectId]);

  // Draws
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'projects', projectId, 'draws'), orderBy('number', 'asc')),
      snap => setDraws(snap.docs.map(d => ({ id: d.id, ...d.data() } as Draw)))
    );
    return unsub;
  }, [projectId]);

  // Change orders
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      query(collection(db, 'projects', projectId, 'changeOrders'), orderBy('createdAt', 'desc')),
      snap => setChangeOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrder)))
    );
    return unsub;
  }, [projectId]);

  // ─── Derived numbers ─────────────────────────────────────────────────────

  const contractAmount = project.contractAmount ?? 0;
  const approvedCOs = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + (co.amount || 0), 0);
  const pendingCOs = changeOrders
    .filter(co => co.status === 'pending')
    .reduce((sum, co) => sum + (co.amount || 0), 0);
  const currentContract = contractAmount + approvedCOs;
  const totalPaid = draws
    .filter(d => d.status === 'paid')
    .reduce((sum, d) => sum + (d.paidAmount ?? d.amount), 0);
  const remaining = currentContract - totalPaid;
  const overUnder = contractAmount > 0 ? approvedCOs : 0;
  const progress = project.progress ?? 0;
  const phaseIndex = PHASES.indexOf(project.currentPhase || '');
  const days = daysRemaining(project.estimatedCompletion);

  // Timeline progress (0-100) from start to estimated completion
  let timelineProgress = 0;
  if (project.startDate && project.estimatedCompletion) {
    const start = new Date(project.startDate).getTime();
    const end = new Date(project.estimatedCompletion).getTime();
    const now = Date.now();
    timelineProgress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#C9A96E' }} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">

      {/* ── Budget Summary ───────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Budget Summary</h2>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <StatCard
            label="Original Contract"
            value={contractAmount > 0 ? fmt(contractAmount) : '—'}
            icon={FileText}
          />
          <StatCard
            label="Change Orders"
            value={approvedCOs !== 0 ? fmt(Math.abs(approvedCOs)) : '$0'}
            sub={approvedCOs > 0 ? `+${changeOrders.filter(c => c.status === 'approved').length} approved` : approvedCOs < 0 ? 'credit' : 'none approved yet'}
            accent={approvedCOs > 0 ? '#d97706' : approvedCOs < 0 ? '#059669' : undefined}
            icon={approvedCOs >= 0 ? ArrowUpRight : ArrowDownRight}
          />
          <StatCard
            label="Current Contract"
            value={currentContract > 0 ? fmt(currentContract) : '—'}
            sub={overUnder !== 0 ? `${overUnder > 0 ? '+' : ''}${fmt(overUnder)} from original` : 'No change orders'}
            accent={overUnder > 0 ? '#d97706' : overUnder < 0 ? '#059669' : undefined}
            icon={DollarSign}
          />
          <StatCard
            label="Paid to Date"
            value={fmt(totalPaid)}
            sub={currentContract > 0 ? `${fmt(remaining)} remaining` : undefined}
            accent="#2563eb"
            icon={Banknote}
          />
        </div>

        {/* Over/Under + Pending COs */}
        <div className="flex flex-wrap gap-3">
          {overUnder !== 0 && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${overUnder > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {overUnder > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {overUnder > 0 ? 'Over' : 'Under'} original contract by {fmt(Math.abs(overUnder))}
            </div>
          )}
          {pendingCOs > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-4 h-4" />
              {changeOrders.filter(c => c.status === 'pending').length} change order{changeOrders.filter(c => c.status === 'pending').length > 1 ? 's' : ''} pending approval ({fmt(pendingCOs)})
            </div>
          )}
          {currentContract > 0 && totalPaid > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <CheckCircle2 className="w-4 h-4" />
              {Math.round((totalPaid / currentContract) * 100)}% of contract paid
            </div>
          )}
        </div>

        {/* Payment progress bar */}
        {currentContract > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Payments: {fmt(totalPaid)} of {fmt(currentContract)}</span>
              <span>{Math.round((totalPaid / currentContract) * 100)}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (totalPaid / currentContract) * 100)}%`, backgroundColor: '#2563eb' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Project Progress ─────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Project Progress</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">

          {/* Completion % */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-3xl font-bold" style={{ color: '#C9A96E' }}>{progress}%</span>
                <span className="text-gray-500 text-sm ml-2">complete</span>
              </div>
              {project.currentPhase && (
                <span className="text-sm font-medium px-3 py-1 rounded-full"
                  style={{ backgroundColor: 'rgba(201,169,110,0.12)', color: '#8a6a3a' }}>
                  {project.currentPhase}
                </span>
              )}
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: '#C9A96E' }}
              />
            </div>
          </div>

          {/* Phase milestones */}
          <div className="relative">
            <div className="flex items-center justify-between gap-0.5">
              {PHASES.map((phase, i) => {
                const done = phaseIndex >= 0 && i < phaseIndex;
                const current = i === phaseIndex;
                return (
                  <div key={phase} className="flex-1 flex flex-col items-center gap-1 text-center">
                    <div
                      className="w-full h-1.5 rounded-sm transition-all"
                      style={{
                        backgroundColor: done ? '#C9A96E' : current ? '#C9A96E88' : '#e5e7eb',
                      }}
                    />
                    <span className={`text-[10px] hidden lg:block leading-tight ${current ? 'font-bold' : 'text-gray-400'}`}
                      style={current ? { color: '#8a6a3a' } : {}}>
                      {phase}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline */}
          {(project.startDate || project.estimatedCompletion) && (
            <div className="pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                <span className="font-medium">Start: {fmtDate(project.startDate)}</span>
                <span className="font-medium text-right">
                  {project.actualCompletion
                    ? `Completed: ${fmtDate(project.actualCompletion)}`
                    : `Est. Completion: ${fmtDate(project.estimatedCompletion)}`}
                </span>
              </div>
              {project.startDate && project.estimatedCompletion && (
                <div className="relative h-4 bg-gray-100 rounded-full overflow-visible">
                  {/* Progress fill */}
                  <div
                    className="absolute top-0 left-0 h-full rounded-full"
                    style={{ width: `${timelineProgress}%`, backgroundColor: 'rgba(201,169,110,0.4)' }}
                  />
                  {/* Today marker */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow z-10"
                    style={{ left: `${timelineProgress}%`, marginLeft: -6, backgroundColor: '#C9A96E' }}
                  />
                  <span
                    className="absolute text-[10px] font-bold -top-5 whitespace-nowrap"
                    style={{ left: `${timelineProgress}%`, marginLeft: -14, color: '#8a6a3a' }}
                  >
                    Today
                  </span>
                </div>
              )}
              {days !== null && !project.actualCompletion && (
                <p className="text-xs text-center mt-3" style={{ color: days < 0 ? '#dc2626' : '#6b7280' }}>
                  {days < 0
                    ? `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} past estimated completion`
                    : days === 0
                    ? 'Estimated completion is today'
                    : `${days} day${days !== 1 ? 's' : ''} until estimated completion`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Draw Schedule ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Draw Schedule</h2>
            <p className="text-xs text-gray-500 mt-0.5">Payment milestones for your project</p>
          </div>
          {canManage && (
            <Button size="sm" style={{ backgroundColor: '#C9A96E', color: '#141414' }} onClick={() => setAddDrawOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Draw
            </Button>
          )}
        </div>

        {draws.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
            <Banknote className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No draws scheduled yet</p>
            <p className="text-sm text-gray-400 mt-1">Your GC will add payment milestones here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {draws.map(draw => <DrawRow key={draw.id} draw={draw} />)}
            {/* Summary row */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
              <span className="text-sm font-semibold text-gray-700">Total Draw Schedule</span>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-900">
                  {fmt(draws.reduce((s, d) => s + (d.amount), 0))}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  ({fmt(totalPaid)} paid)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Change Orders ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4">Change Orders</h2>
        {changeOrders.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No change orders</p>
            <p className="text-sm text-gray-400 mt-1">Any scope or cost changes will appear here for your approval</p>
          </div>
        ) : (
          <div className="space-y-3">
            {changeOrders.map(co => {
              const statusMap = {
                pending:  { label: 'Awaiting Your Approval', bg: '#fffbeb', color: '#d97706', icon: Clock },
                approved: { label: 'Approved',               bg: '#ecfdf5', color: '#059669', icon: CheckCircle2 },
                declined: { label: 'Declined',               bg: '#fef2f2', color: '#dc2626', icon: AlertTriangle },
                void:     { label: 'Void',                   bg: '#f3f4f6', color: '#6b7280', icon: AlertTriangle },
              }[co.status];
              const Icon = statusMap?.icon || Clock;
              return (
                <div key={co.id} className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{co.title}</p>
                    {co.description && <p className="text-xs text-gray-500 truncate">{co.description}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${co.amount > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {co.amount > 0 ? '+' : ''}{fmt(co.amount)}
                    </p>
                  </div>
                  {statusMap && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0"
                      style={{ backgroundColor: statusMap.bg, color: statusMap.color }}>
                      <Icon className="w-3 h-3" />
                      <span className="hidden sm:inline">{statusMap.label}</span>
                    </span>
                  )}
                </div>
              );
            })}
            {/* CO total */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
              <span className="text-sm font-semibold text-gray-700">Net Change Orders (approved)</span>
              <span className={`text-sm font-bold ${approvedCOs > 0 ? 'text-amber-700' : approvedCOs < 0 ? 'text-green-700' : 'text-gray-600'}`}>
                {approvedCOs > 0 ? '+' : ''}{fmt(approvedCOs)}
              </span>
            </div>
          </div>
        )}
      </div>

      {canManage && addDrawOpen && (
        <AddDrawDialog
          projectId={projectId}
          drawCount={draws.length}
          open={addDrawOpen}
          onClose={() => setAddDrawOpen(false)}
        />
      )}
    </div>
  );
}
