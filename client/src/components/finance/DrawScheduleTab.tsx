import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
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
import {
  Plus, Edit2, Trash2, CheckCircle2, XCircle, DollarSign,
  CalendarDays, AlertCircle,
} from 'lucide-react';

interface Draw {
  id: string;
  name: string;
  amount: number;
  percentage: number;
  milestone: string;
  status: 'pending' | 'submitted' | 'approved' | 'paid';
  scheduledDate: string;
  paidDate?: string;
  lienWaiverReceived: boolean;
  notes?: string;
  createdAt?: any;
}

interface Project {
  id: string;
  name: string;
  contractAmount?: number;
}

const STATUS_STYLES: Record<Draw['status'], string> = {
  pending:   'bg-gray-100 text-gray-600 border-gray-200',
  submitted: 'bg-blue-100 text-blue-700 border-blue-200',
  approved:  'bg-amber-100 text-amber-700 border-amber-200',
  paid:      'bg-green-100 text-green-700 border-green-200',
};

const EMPTY_FORM = {
  name: '',
  milestone: '',
  amount: '',
  scheduledDate: '',
  status: 'pending' as Draw['status'],
  lienWaiverReceived: false,
  notes: '',
};

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function DrawScheduleTab({ projects }: { projects: Project[] }) {
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDraw, setEditDraw] = useState<Draw | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const project = projects.find(p => p.id === selectedProjectId);
  const contractAmount = project?.contractAmount ?? 0;

  // Auto-select first project
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) setSelectedProjectId(projects[0].id);
  }, [projects]);

  // Subscribe to draws subcollection
  useEffect(() => {
    if (!selectedProjectId) { setDraws([]); return; }
    setLoading(true);
    const q = query(
      collection(db, 'projects', selectedProjectId, 'draws'),
      orderBy('scheduledDate', 'asc'),
    );
    const unsub = onSnapshot(q, snap => {
      setDraws(snap.docs.map(d => ({ id: d.id, ...d.data() } as Draw)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [selectedProjectId]);

  const openNew = () => {
    setEditDraw(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (d: Draw) => {
    setEditDraw(d);
    setForm({
      name: d.name,
      milestone: d.milestone,
      amount: String(d.amount),
      scheduledDate: d.scheduledDate,
      status: d.status,
      lienWaiverReceived: d.lienWaiverReceived,
      notes: d.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.amount || !form.scheduledDate) {
      toast({ title: 'Name, amount, and date are required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const amount = parseFloat(form.amount) || 0;
    const percentage = contractAmount > 0 ? Math.round((amount / contractAmount) * 1000) / 10 : 0;
    const data = {
      name: form.name,
      milestone: form.milestone,
      amount,
      percentage,
      scheduledDate: form.scheduledDate,
      status: form.status,
      lienWaiverReceived: form.lienWaiverReceived,
      notes: form.notes,
    };
    try {
      if (editDraw) {
        await updateDoc(doc(db, 'projects', selectedProjectId, 'draws', editDraw.id), data);
        toast({ title: 'Draw updated' });
      } else {
        await addDoc(collection(db, 'projects', selectedProjectId, 'draws'), {
          ...data, createdAt: serverTimestamp(),
        });
        toast({ title: 'Draw added' });
      }
      setDialogOpen(false);
    } catch {
      toast({ title: 'Error saving draw', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this draw?')) return;
    await deleteDoc(doc(db, 'projects', selectedProjectId, 'draws', id));
    toast({ title: 'Draw deleted' });
  };

  const handleMarkPaid = async (d: Draw) => {
    await updateDoc(doc(db, 'projects', selectedProjectId, 'draws', d.id), {
      status: 'paid',
      paidDate: new Date().toISOString().split('T')[0],
    });
    toast({ title: `${d.name} marked as paid` });
  };

  const totalScheduled = draws.reduce((s, d) => s + d.amount, 0);
  const totalPaid = draws.filter(d => d.status === 'paid').reduce((s, d) => s + d.amount, 0);
  const remaining = contractAmount - totalPaid;
  const paidPct = contractAmount > 0 ? Math.round((totalPaid / contractAmount) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Project selector */}
      <div className="flex items-center gap-3">
        <div className="w-64">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selectedProjectId && (
          <Button size="sm" onClick={openNew} style={{ backgroundColor: '#C9A96E' }} className="text-white gap-1.5">
            <Plus className="w-4 h-4" /> Add Draw
          </Button>
        )}
      </div>

      {!selectedProjectId ? (
        <div className="text-center py-16 text-gray-400">Select a project to manage its draw schedule.</div>
      ) : (
        <>
          {/* Summary stat row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Contract Value', value: fmt(contractAmount), color: 'text-gray-900' },
              { label: 'Draws Scheduled', value: fmt(totalScheduled), color: 'text-blue-700' },
              { label: 'Collected', value: fmt(totalPaid), color: 'text-green-700' },
              { label: 'Remaining', value: fmt(remaining), color: remaining > 0 ? 'text-amber-700' : 'text-gray-400' },
            ].map(s => (
              <Card key={s.label} className="border border-gray-200">
                <CardContent className="p-4">
                  <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{paidPct}% collected</span>
              <span>{fmt(totalPaid)} of {fmt(contractAmount)}</span>
            </div>
            <Progress value={paidPct} className="h-2" />
          </div>

          {/* Draw list */}
          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center">Loading draws…</p>
          ) : draws.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
              <DollarSign className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No draws added</p>
              <p className="text-sm text-gray-400 mt-1 mb-4">Add your first draw to start tracking payments.</p>
              <Button size="sm" onClick={openNew} style={{ backgroundColor: '#C9A96E' }} className="text-white gap-1.5">
                <Plus className="w-4 h-4" /> Add Draw
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {draws.map(draw => (
                <div key={draw.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors ${draw.status === 'paid' ? 'opacity-75' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{draw.name}</p>
                    {draw.milestone && <p className="text-xs text-gray-400 mt-0.5">{draw.milestone}</p>}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {draw.scheduledDate}
                    {draw.paidDate && <span className="text-green-600 text-xs">· paid {draw.paidDate}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{fmt(draw.amount)}</span>
                    {contractAmount > 0 && (
                      <Badge variant="outline" className="text-xs">{draw.percentage}%</Badge>
                    )}
                  </div>
                  <Badge className={`text-xs border capitalize ${STATUS_STYLES[draw.status]}`}>{draw.status}</Badge>
                  <div className="flex items-center gap-1" title={draw.lienWaiverReceived ? 'Lien waiver received' : 'Lien waiver missing'}>
                    {draw.lienWaiverReceived
                      ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                      : <XCircle className="w-4 h-4 text-red-400" />}
                    <span className="text-xs text-gray-400 hidden sm:inline">{draw.lienWaiverReceived ? 'Waiver' : 'No waiver'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {draw.status === 'approved' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-200 hover:bg-green-50" onClick={() => handleMarkPaid(draw)}>
                        Mark Paid
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(draw)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDelete(draw.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {draws.length > 0 && totalScheduled < contractAmount && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {fmt(contractAmount - totalScheduled)} of contract value is not yet covered by a draw.
            </div>
          )}
        </>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editDraw ? 'Edit Draw' : 'Add Draw'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Draw Name *</Label>
              <Input className="mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Foundation Draw" />
            </div>
            <div>
              <Label>Milestone (what must be complete)</Label>
              <Input className="mt-1" value={form.milestone} onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))} placeholder="e.g. Foundation poured and inspected" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount ($) *</Label>
                <Input className="mt-1" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
                {contractAmount > 0 && form.amount && (
                  <p className="text-xs text-gray-400 mt-1">{Math.round((parseFloat(form.amount) / contractAmount) * 1000) / 10}% of contract</p>
                )}
              </div>
              <div>
                <Label>Scheduled Date *</Label>
                <Input className="mt-1" type="date" value={form.scheduledDate} onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Draw['status'] }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['pending', 'submitted', 'approved', 'paid'] as const).map(s => (
                      <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={form.lienWaiverReceived}
                    onChange={e => setForm(f => ({ ...f, lienWaiverReceived: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Lien Waiver Received</span>
                </label>
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: '#C9A96E' }} className="text-white">
              {saving ? 'Saving…' : 'Save Draw'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
