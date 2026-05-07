import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2, Download, TrendingDown, TrendingUp, DollarSign } from 'lucide-react';

interface BudgetItem {
  id: string;
  category: string;
  budgetAmount: number;
  actualAmount: number;
  committedAmount: number;
  notes?: string;
  updatedAt?: any;
}

interface Project {
  id: string;
  name: string;
  contractAmount?: number;
}

const PRESET_CATEGORIES = [
  'Foundation', 'Framing', 'Electrical', 'Plumbing', 'HVAC',
  'Roofing', 'Exterior', 'Insulation', 'Drywall', 'Flooring',
  'Cabinets & Counters', 'Paint', 'Fixtures & Hardware',
  'Landscaping', 'Site Work', 'Permits & Fees',
  'General Conditions', 'Contingency', 'Custom',
];

const EMPTY_FORM = {
  category: '',
  customCategory: '',
  budgetAmount: '',
  actualAmount: '',
  committedAmount: '',
  notes: '',
};

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function varianceColor(budget: number, actual: number) {
  if (actual > budget) return 'text-red-600';
  if (budget > 0 && actual / budget >= 0.8) return 'text-amber-600';
  return 'text-green-600';
}

function rowBg(budget: number, actual: number) {
  if (actual > budget) return 'bg-red-50';
  if (budget > 0 && actual / budget >= 0.8) return 'bg-amber-50';
  return '';
}

export default function BudgetVsActualTab({ projects }: { projects: Project[] }) {
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<BudgetItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) setSelectedProjectId(projects[0].id);
  }, [projects]);

  useEffect(() => {
    if (!selectedProjectId) { setItems([]); return; }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'projects', selectedProjectId, 'budgetItems'),
      snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as BudgetItem));
        rows.sort((a, b) => a.category.localeCompare(b.category));
        setItems(rows);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [selectedProjectId]);

  const openNew = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (item: BudgetItem) => {
    setEditItem(item);
    setForm({
      category: PRESET_CATEGORIES.includes(item.category) ? item.category : 'Custom',
      customCategory: PRESET_CATEGORIES.includes(item.category) ? '' : item.category,
      budgetAmount: String(item.budgetAmount),
      actualAmount: String(item.actualAmount),
      committedAmount: String(item.committedAmount),
      notes: item.notes ?? '',
    });
    setDialogOpen(true);
  };

  const resolvedCategory = form.category === 'Custom' ? form.customCategory : form.category;

  const handleSave = async () => {
    if (!resolvedCategory || !form.budgetAmount) {
      toast({ title: 'Category and budget amount are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const data = {
      category: resolvedCategory,
      budgetAmount: parseFloat(form.budgetAmount) || 0,
      actualAmount: parseFloat(form.actualAmount) || 0,
      committedAmount: parseFloat(form.committedAmount) || 0,
      notes: form.notes,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editItem) {
        await updateDoc(doc(db, 'projects', selectedProjectId, 'budgetItems', editItem.id), data);
        toast({ title: 'Item updated' });
      } else {
        await addDoc(collection(db, 'projects', selectedProjectId, 'budgetItems'), data);
        toast({ title: 'Category added' });
      }
      setDialogOpen(false);
    } catch {
      toast({ title: 'Error saving item', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget item?')) return;
    await deleteDoc(doc(db, 'projects', selectedProjectId, 'budgetItems', id));
    toast({ title: 'Item deleted' });
  };

  const exportCSV = () => {
    const headers = ['Category', 'Budget', 'Actual', 'Committed', 'Variance', '% Used'];
    const rows = items.map(i => {
      const variance = i.budgetAmount - i.actualAmount;
      const pct = i.budgetAmount > 0 ? Math.round((i.actualAmount / i.budgetAmount) * 100) : 0;
      return [i.category, i.budgetAmount, i.actualAmount, i.committedAmount, variance, `${pct}%`];
    });
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `budget-vs-actual-${selectedProjectId}.csv`;
    a.click();
  };

  // Totals
  const totalBudget = items.reduce((s, i) => s + i.budgetAmount, 0);
  const totalActual = items.reduce((s, i) => s + i.actualAmount, 0);
  const totalCommitted = items.reduce((s, i) => s + i.committedAmount, 0);
  const totalVariance = totalBudget - totalActual;

  return (
    <div className="space-y-5">
      {/* Project selector + actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-64">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selectedProjectId && (
          <>
            <Button size="sm" onClick={openNew} style={{ backgroundColor: '#C9A96E' }} className="text-white gap-1.5">
              <Plus className="w-4 h-4" /> Add Category
            </Button>
            {items.length > 0 && (
              <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            )}
          </>
        )}
      </div>

      {!selectedProjectId ? (
        <div className="text-center py-16 text-gray-400">Select a project to view budget vs actual.</div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-500">Total Budget</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{fmt(totalBudget)}</p>
              </CardContent>
            </Card>
            <Card className="border border-gray-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-500">Actual Spent</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{fmt(totalActual)}</p>
                {totalCommitted > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">+{fmt(totalCommitted)} committed</p>
                )}
              </CardContent>
            </Card>
            <Card className={`border ${totalVariance >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  {totalVariance >= 0
                    ? <TrendingDown className="w-4 h-4 text-green-500" />
                    : <TrendingUp className="w-4 h-4 text-red-500" />}
                  <p className="text-xs text-gray-500">Variance</p>
                </div>
                <p className={`text-xl font-bold ${totalVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {totalVariance >= 0 ? '+' : ''}{fmt(totalVariance)}
                </p>
                <p className={`text-xs mt-0.5 ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalVariance >= 0 ? 'Under budget' : 'Over budget'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Budget table */}
          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
          ) : items.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
              <DollarSign className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No budget items</p>
              <p className="text-sm text-gray-400 mt-1 mb-4">Add categories from your estimate to start tracking.</p>
              <Button size="sm" onClick={openNew} style={{ backgroundColor: '#C9A96E' }} className="text-white gap-1.5">
                <Plus className="w-4 h-4" /> Add Category
              </Button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_100px_100px_100px_100px_120px_60px] gap-2 px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
                <span>Category</span>
                <span className="text-right">Budget</span>
                <span className="text-right">Actual</span>
                <span className="text-right">Committed</span>
                <span className="text-right">Variance</span>
                <span className="text-center">% Used</span>
                <span />
              </div>

              {/* Rows */}
              {items.map(item => {
                const variance = item.budgetAmount - item.actualAmount;
                const pct = item.budgetAmount > 0 ? Math.min(100, Math.round((item.actualAmount / item.budgetAmount) * 100)) : 0;
                return (
                  <div
                    key={item.id}
                    className={`grid grid-cols-[1fr_100px_100px_100px_100px_120px_60px] gap-2 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer transition-colors ${rowBg(item.budgetAmount, item.actualAmount)}`}
                    onClick={() => openEdit(item)}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.category}</p>
                      {item.notes && <p className="text-xs text-gray-400">{item.notes}</p>}
                    </div>
                    <p className="text-sm text-right text-gray-700">{fmt(item.budgetAmount)}</p>
                    <p className="text-sm text-right font-medium text-gray-900">{fmt(item.actualAmount)}</p>
                    <p className="text-sm text-right text-gray-500">{item.committedAmount > 0 ? fmt(item.committedAmount) : '—'}</p>
                    <p className={`text-sm text-right font-medium ${varianceColor(item.budgetAmount, item.actualAmount)}`}>
                      {variance >= 0 ? '+' : ''}{fmt(variance)}
                    </p>
                    <div className="flex flex-col justify-center gap-1">
                      <Progress
                        value={pct}
                        className="h-1.5"
                        style={{ '--progress-color': pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e' } as React.CSSProperties}
                      />
                      <p className={`text-xs text-center ${varianceColor(item.budgetAmount, item.actualAmount)}`}>{pct}%</p>
                    </div>
                    <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* Totals row */}
              <div className="grid grid-cols-[1fr_100px_100px_100px_100px_120px_60px] gap-2 px-4 py-3 bg-gray-50 border-t-2 border-gray-300">
                <p className="text-sm font-bold text-gray-900">TOTAL</p>
                <p className="text-sm text-right font-bold text-gray-900">{fmt(totalBudget)}</p>
                <p className="text-sm text-right font-bold text-gray-900">{fmt(totalActual)}</p>
                <p className="text-sm text-right font-bold text-gray-500">{fmt(totalCommitted)}</p>
                <p className={`text-sm text-right font-bold ${varianceColor(totalBudget, totalActual)}`}>
                  {totalVariance >= 0 ? '+' : ''}{fmt(totalVariance)}
                </p>
                <div />
                <div />
              </div>
            </div>
          )}
        </>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Budget Item' : 'Add Budget Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {PRESET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              {form.category === 'Custom' && (
                <Input
                  className="mt-2"
                  placeholder="Enter custom category name"
                  value={form.customCategory}
                  onChange={e => setForm(f => ({ ...f, customCategory: e.target.value }))}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Budget Amount ($) *</Label>
                <Input className="mt-1" type="number" value={form.budgetAmount} onChange={e => setForm(f => ({ ...f, budgetAmount: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Actual Spent ($)</Label>
                <Input className="mt-1" type="number" value={form.actualAmount} onChange={e => setForm(f => ({ ...f, actualAmount: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Committed / In Contract ($)</Label>
              <Input className="mt-1" type="number" value={form.committedAmount} onChange={e => setForm(f => ({ ...f, committedAmount: e.target.value }))} placeholder="0" />
              <p className="text-xs text-gray-400 mt-1">POs and sub contracts signed but not yet invoiced</p>
            </div>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: '#C9A96E' }} className="text-white">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
