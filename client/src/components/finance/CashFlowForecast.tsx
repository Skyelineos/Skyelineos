import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, getDoc, getDocs, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type OverheadCategory = 'payroll' | 'office' | 'insurance' | 'equipment' | 'marketing' | 'other';

interface OverheadItem {
  id: string;
  name: string;
  amount: number;
  category: OverheadCategory;
}

interface DrawRecord {
  id: string;
  projectId: string;
  projectName: string;
  name: string;
  amount: number;
  scheduledDate: string; // ISO date string
  status: 'pending' | 'submitted' | 'approved' | 'paid';
}

interface ForecastMonth {
  label: string;        // "May '26"
  shortLabel: string;   // "May"
  year: number;
  month: number;        // 0-indexed
  inflow: number;
  outflow: number;      // stored as negative for chart
  net: number;
  cumulative: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: OverheadCategory; label: string; color: string }[] = [
  { value: 'payroll',   label: 'Payroll',    color: 'bg-blue-100 text-blue-700' },
  { value: 'office',    label: 'Office',     color: 'bg-purple-100 text-purple-700' },
  { value: 'insurance', label: 'Insurance',  color: 'bg-amber-100 text-amber-700' },
  { value: 'equipment', label: 'Equipment',  color: 'bg-orange-100 text-orange-700' },
  { value: 'marketing', label: 'Marketing',  color: 'bg-pink-100 text-pink-700' },
  { value: 'other',     label: 'Other',      color: 'bg-gray-100 text-gray-600' },
];

const catColor = (c: OverheadCategory) =>
  CATEGORIES.find(x => x.value === c)?.color ?? 'bg-gray-100 text-gray-600';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (n: number) =>
  '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

const fmtK = (n: number) => {
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + (abs >= 1000 ? `$${(abs / 1000).toFixed(0)}k` : `$${abs}`);
};

const drawStatusColor: Record<DrawRecord['status'], string> = {
  pending:   'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-amber-100 text-amber-700',
  paid:      'bg-green-100 text-green-700',
};

// ── Tooltip ───────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium" style={{ color: p.color }}>
            {fmt(Math.abs(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CashFlowForecast() {
  const { toast } = useToast();
  const [range, setRange] = useState<6 | 12>(6);

  const [overheadItems, setOverheadItems] = useState<OverheadItem[]>([]);
  const [draws, setDraws] = useState<DrawRecord[]>([]);
  const [loadingOverhead, setLoadingOverhead] = useState(true);
  const [loadingDraws, setLoadingDraws] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<OverheadItem | null>(null);
  const [form, setForm] = useState({ name: '', amount: '', category: 'other' as OverheadCategory });

  // ── Load overhead ──────────────────────────────────────────────────────────
  useEffect(() => {
    getDoc(doc(db, 'settings', 'overhead')).then(snap => {
      if (snap.exists()) {
        setOverheadItems((snap.data().items as OverheadItem[]) || []);
      }
      setLoadingOverhead(false);
    }).catch(() => setLoadingOverhead(false));
  }, []);

  // ── Load draws from all project subcollections ─────────────────────────────
  useEffect(() => {
    getDocs(collection(db, 'projects')).then(async projectSnap => {
      const all: DrawRecord[] = [];
      await Promise.all(projectSnap.docs.map(async pDoc => {
        const projectName = (pDoc.data().name as string) || 'Unknown Project';
        const drawSnap = await getDocs(collection(db, 'projects', pDoc.id, 'draws'));
        drawSnap.docs.forEach(d => {
          const data = d.data();
          if (data.status !== 'paid') {
            all.push({
              id: d.id,
              projectId: pDoc.id,
              projectName,
              name: data.name || 'Draw',
              amount: data.amount || 0,
              scheduledDate: data.scheduledDate || data.dueDate || '',
              status: data.status || 'pending',
            });
          }
        });
      }));
      all.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
      setDraws(all);
      setLoadingDraws(false);
    }).catch(() => setLoadingDraws(false));
  }, []);

  // ── Forecast computation ───────────────────────────────────────────────────
  const forecastData = useCallback((): ForecastMonth[] => {
    const monthlyOverhead = overheadItems.reduce((s, i) => s + i.amount, 0);
    const now = new Date();
    const months: ForecastMonth[] = [];
    let cumulative = 0;

    for (let i = 0; i < range + 1; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const label = `${MONTH_LABELS[m]} '${String(y).slice(2)}`;
      const shortLabel = MONTH_LABELS[m];

      const inflow = draws
        .filter(dr => {
          if (!dr.scheduledDate) return false;
          const sd = new Date(dr.scheduledDate);
          return sd.getFullYear() === y && sd.getMonth() === m;
        })
        .reduce((s, dr) => s + dr.amount, 0);

      const net = inflow - monthlyOverhead;
      cumulative += net;

      months.push({
        label, shortLabel, year: y, month: m,
        inflow,
        outflow: -monthlyOverhead,   // negative for chart stacking
        net,
        cumulative,
      });
    }
    return months;
  }, [overheadItems, draws, range]);

  const forecast = forecastData();
  const monthlyOverhead = overheadItems.reduce((s, i) => s + i.amount, 0);
  const avgInflow = forecast.length ? forecast.reduce((s, f) => s + f.inflow, 0) / forecast.length : 0;
  const periodNet = forecast.slice(0, range).reduce((s, f) => s + f.net, 0);

  // ── Overhead CRUD ──────────────────────────────────────────────────────────
  const openNew = () => {
    setEditItem(null);
    setForm({ name: '', amount: '', category: 'other' });
    setDialogOpen(true);
  };

  const openEdit = (item: OverheadItem) => {
    setEditItem(item);
    setForm({ name: item.name, amount: String(item.amount), category: item.category });
    setDialogOpen(true);
  };

  const saveOverhead = async (items: OverheadItem[]) => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'overhead'), { items, updatedAt: serverTimestamp() });
      setOverheadItems(items);
    } catch {
      toast({ title: 'Error saving overhead', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveItem = async () => {
    if (!form.name || !form.amount) return;
    const updated = editItem
      ? overheadItems.map(i => i.id === editItem.id
          ? { ...i, name: form.name, amount: parseFloat(form.amount) || 0, category: form.category }
          : i)
      : [...overheadItems, {
          id: `oh_${Date.now()}`,
          name: form.name,
          amount: parseFloat(form.amount) || 0,
          category: form.category,
        }];
    await saveOverhead(updated);
    setDialogOpen(false);
    toast({ title: editItem ? 'Expense updated' : 'Expense added' });
  };

  const handleDelete = async (id: string) => {
    await saveOverhead(overheadItems.filter(i => i.id !== id));
    toast({ title: 'Expense removed' });
  };

  // ── Draw calendar grouping ─────────────────────────────────────────────────
  const drawsByMonth = draws.reduce<Record<string, DrawRecord[]>>((acc, dr) => {
    if (!dr.scheduledDate) return acc;
    const d = new Date(dr.scheduledDate);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    const label = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
    if (!acc[label]) acc[label] = [];
    acc[label].push(dr);
    return acc;
  }, {});

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Section 1: Monthly Overhead ──────────────────────────────────── */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Monthly Overhead</CardTitle>
              <p className="text-sm text-gray-500 mt-0.5">
                Total: <span className="font-semibold text-gray-900">{fmt(monthlyOverhead)}/mo</span>
              </p>
            </div>
            <Button size="sm" onClick={openNew} style={{ backgroundColor: '#C9A96E' }} className="text-white gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add Expense
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingOverhead ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading…</div>
          ) : overheadItems.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No overhead expenses yet. Add your monthly costs to enable forecasting.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {overheadItems.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <Badge className={`text-xs ${catColor(item.category)}`}>{item.category}</Badge>
                    <span className="text-sm font-medium text-gray-800">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-gray-900">{fmt(item.amount)}/mo</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
                        <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-3 mt-1">
                <span className="text-sm font-semibold text-gray-700">Monthly Total</span>
                <span className="text-base font-bold text-gray-900">{fmt(monthlyOverhead)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Forecast Chart ──────────────────────────────────────── */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base font-semibold">{range}-Month Cash Flow Forecast</CardTitle>
              <p className="text-sm text-gray-500">Draw income vs. overhead — based on scheduled draws and monthly expenses</p>
            </div>
            {/* Range toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {([6, 12] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                    range === r
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {r} mo
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={forecast} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Bar dataKey="inflow" name="Draw Income" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Bar dataKey="outflow" name="Overhead Out" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Line
                dataKey="cumulative"
                name="Net Position"
                type="monotone"
                stroke="#C9A96E"
                strokeWidth={2.5}
                dot={{ fill: '#C9A96E', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Summary chips */}
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">Avg Monthly Income</p>
              <p className="text-base font-bold text-green-600">{fmt(avgInflow)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">Monthly Overhead</p>
              <p className="text-base font-bold text-red-500">{fmt(monthlyOverhead)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-0.5">{range}-Month Net</p>
              <p className={`text-base font-bold ${periodNet >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {periodNet >= 0 ? '+' : ''}{fmt(periodNet)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Draw Calendar ───────────────────────────────────────── */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Upcoming Draw Schedule</CardTitle>
          <p className="text-sm text-gray-500">{draws.length} upcoming draw{draws.length !== 1 ? 's' : ''} across all projects</p>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingDraws ? (
            <div className="text-sm text-gray-400 py-4 text-center">Loading draws…</div>
          ) : draws.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No upcoming draws. Add draws in each project's financial section.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(drawsByMonth).map(([monthLabel, monthDraws]) => (
                <div key={monthLabel}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{monthLabel}</p>
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                    {monthDraws.map(draw => (
                      <div key={draw.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                        <div className="flex items-center gap-3 min-w-0">
                          <Badge className={`text-xs shrink-0 ${drawStatusColor[draw.status]}`}>{draw.status}</Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{draw.name}</p>
                            <p className="text-xs text-gray-400 truncate">{draw.projectName}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-sm font-bold text-gray-900">{fmt(draw.amount)}</p>
                          <p className="text-xs text-gray-400">{draw.scheduledDate ? new Date(draw.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add/Edit Overhead Dialog ───────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Expense' : 'Add Monthly Expense'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="e.g. Office Rent"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Monthly Amount ($)</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as OverheadCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveItem}
              disabled={saving || !form.name || !form.amount}
              style={{ backgroundColor: '#C9A96E' }}
              className="text-white"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
