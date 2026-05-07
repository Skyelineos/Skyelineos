import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, TrendingUp, Clock, Plus, FileText, CalendarDays, BarChart3, TrendingDown } from 'lucide-react';
import DrawScheduleTab from '@/components/finance/DrawScheduleTab';
import BudgetVsActualTab from '@/components/finance/BudgetVsActualTab';
import CashFlowForecast from '@/components/finance/CashFlowForecast';

interface Invoice {
  id: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  amount: number;
  clientName: string;
  dueDate: string;
  createdAt: { toDate: () => Date } | null;
  description?: string;
}

interface Estimate {
  id: string;
  status: string;
  totalAmount: number;
  clientName: string;
  createdAt: { toDate: () => Date } | null;
}

interface Project {
  id: string;
  name: string;
  status: string;
  contractAmount: number;
}

interface ClientDoc {
  id: string;
  name: string;
}

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function statusBadge(status: Invoice['status']) {
  const map: Record<Invoice['status'], string> = {
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    sent: 'bg-blue-100 text-blue-700 border-blue-200',
    paid: 'bg-green-100 text-green-700 border-green-200',
    overdue: 'bg-red-100 text-red-700 border-red-200',
  };
  return <Badge className={`text-xs capitalize border ${map[status]}`}>{status}</Badge>;
}

function StatCard({ label, value, icon: Icon, sub, color }: { label: string; value: string; icon: React.ElementType; sub?: string; color?: string }) {
  return (
    <Card className="border border-gray-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">{label}</p>
            <p className="text-2xl font-bold" style={{ color: color || '#111827' }}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          </div>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#C9A96E22' }}>
            <Icon className="w-5 h-5" style={{ color: '#C9A96E' }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const TABS = [
  { key: 'invoices',    label: 'Invoices',          icon: FileText },
  { key: 'draws',       label: 'Draw Schedule',     icon: CalendarDays },
  { key: 'budget',      label: 'Budget vs Actual',  icon: BarChart3 },
  { key: 'forecast',    label: 'Cash Flow',         icon: TrendingDown },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function Finance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('invoices');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientDoc[]>([]);
  const [showDialog, setShowDialog] = useState(false);

  const [form, setForm] = useState({ clientId: '', clientName: '', amount: '', dueDate: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub1 = onSnapshot(
      query(collection(db, 'invoices'), orderBy('createdAt', 'desc')),
      snap => setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice))),
      () => {}
    );
    const unsub2 = onSnapshot(
      query(collection(db, 'estimates'), orderBy('createdAt', 'desc')),
      snap => setEstimates(snap.docs.map(d => ({ id: d.id, ...d.data() } as Estimate))),
      () => {}
    );
    const unsub3 = onSnapshot(
      collection(db, 'projects'),
      snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project))),
      () => {}
    );
    getDocs(collection(db, 'clients')).then(snap =>
      setClients(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Unnamed' })))
    );
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const totalContracted = projects.reduce((s, p) => s + (p.contractAmount || 0), 0);
  const totalInvoiced   = invoices.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCollected  = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0);
  const totalOutstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + (i.amount || 0), 0);

  const estByStatus = estimates.reduce<Record<string, { count: number; amount: number }>>((acc, e) => {
    const s = e.status || 'draft';
    if (!acc[s]) acc[s] = { count: 0, amount: 0 };
    acc[s].count += 1;
    acc[s].amount += e.totalAmount || 0;
    return acc;
  }, {});

  async function handleCreate() {
    if (!form.clientName || !form.amount || !form.dueDate) {
      toast({ title: 'Missing fields', description: 'Client, amount, and due date are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'invoices'), {
        clientId: form.clientId,
        clientName: form.clientName,
        amount: parseFloat(form.amount),
        dueDate: form.dueDate,
        description: form.description,
        status: 'draft',
        createdBy: user?.id,
        createdByName: user?.name,
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Invoice created' });
      setShowDialog(false);
      setForm({ clientId: '', clientName: '', amount: '', dueDate: '', description: '' });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <div className="space-y-0">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
            <p className="text-sm text-gray-500 mt-0.5">Invoices, draws, budget tracking, and cash flow</p>
          </div>
          {activeTab === 'invoices' && (
            <Button onClick={() => setShowDialog(true)} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90 gap-2">
              <Plus className="w-4 h-4" /> New Invoice
            </Button>
          )}
        </div>

        {/* Tab bar */}
        <div className="border-b border-gray-200 px-6">
          <nav className="flex gap-0 -mb-px overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    active
                      ? 'border-[#C9A96E] text-[#8a6a3a]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab content */}
        <div className="p-6">

          {/* ── INVOICES TAB ─────────────────────────────────────────────── */}
          {activeTab === 'invoices' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Contracted"  value={fmt(totalContracted)}  icon={DollarSign} />
                <StatCard label="Total Invoiced"    value={fmt(totalInvoiced)}    icon={FileText} />
                <StatCard label="Collected"         value={fmt(totalCollected)}   icon={TrendingUp}  color="#16a34a" />
                <StatCard label="Outstanding"       value={fmt(totalOutstanding)} icon={Clock}       color={totalOutstanding > 0 ? '#dc2626' : undefined} sub="sent + overdue" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Invoices */}
                <Card className="border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Recent Invoices</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {invoices.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">No invoices yet</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {invoices.slice(0, 8).map(inv => (
                          <div key={inv.id} className="flex items-center justify-between px-5 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {statusBadge(inv.status)}
                              <span className="text-sm font-medium text-gray-800 truncate">{inv.clientName || '—'}</span>
                            </div>
                            <div className="flex items-center gap-4 text-right shrink-0">
                              <span className="text-sm font-semibold text-gray-900">{fmt(inv.amount || 0)}</span>
                              <span className="text-xs text-gray-400 hidden sm:block">{inv.dueDate || '—'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Estimates Pipeline */}
                <Card className="border border-gray-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold">Estimates Pipeline</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {(['draft', 'sent', 'accepted', 'rejected'] as const).map(s => {
                      const d = estByStatus[s] || { count: 0, amount: 0 };
                      const colors: Record<string, string> = { draft: 'bg-gray-300', sent: 'bg-blue-400', accepted: 'bg-green-400', rejected: 'bg-red-300' };
                      const total = estimates.length || 1;
                      const pct = Math.round((d.count / total) * 100);
                      return (
                        <div key={s}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm capitalize text-gray-700">{s}</span>
                            <span className="text-xs text-gray-500">{d.count} · {fmt(d.amount)}</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${colors[s]}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── DRAW SCHEDULE TAB ─────────────────────────────────────────── */}
          {activeTab === 'draws' && (
            <DrawScheduleTab projects={projects} />
          )}

          {/* ── BUDGET VS ACTUAL TAB ──────────────────────────────────────── */}
          {activeTab === 'budget' && (
            <BudgetVsActualTab projects={projects} />
          )}

          {/* ── CASH FLOW FORECAST TAB ────────────────────────────────────── */}
          {activeTab === 'forecast' && (
            <CashFlowForecast />
          )}

        </div>
      </div>

      {/* New Invoice Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              {clients.length > 0 ? (
                <Select onValueChange={v => {
                  const c = clients.find(x => x.id === v);
                  setForm(f => ({ ...f, clientId: v, clientName: c?.name || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="Client name" value={form.clientName}
                  onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input type="number" placeholder="0.00" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate}
                onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="Invoice description…" value={form.description} rows={3}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90">
              {saving ? 'Creating…' : 'Create Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
