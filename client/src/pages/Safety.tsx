import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  doc, getDocs, Timestamp, orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import {
  Plus, ShieldCheck, AlertTriangle, CheckCircle2, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────

type FormType = 'daily_inspection' | 'jsa' | 'incident_report' | 'toolbox_talk';
type FormStatus = 'open' | 'completed' | 'requires_action';

interface ChecklistItem {
  label: string;
  checked: boolean;
}

interface SafetyForm {
  id: string;
  projectId: string;
  projectName: string;
  formType: FormType;
  inspectedBy: string;
  inspectedByName: string;
  date: string;
  status: FormStatus;
  notes: string;
  items: ChecklistItem[];
  createdAt: Timestamp | null;
}

interface Project {
  id: string;
  name: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const FORM_TYPE_LABELS: Record<FormType, string> = {
  daily_inspection: 'Daily Inspection',
  jsa: 'JSA',
  incident_report: 'Incident Report',
  toolbox_talk: 'Toolbox Talk',
};

const FORM_TYPE_COLORS: Record<FormType, string> = {
  daily_inspection: 'bg-blue-100 text-blue-700 border-blue-200',
  jsa: 'bg-purple-100 text-purple-700 border-purple-200',
  incident_report: 'bg-red-100 text-red-700 border-red-200',
  toolbox_talk: 'bg-teal-100 text-teal-700 border-teal-200',
};

const DEFAULT_CHECKLISTS: Record<FormType, string[]> = {
  daily_inspection: [
    'PPE check',
    'Site perimeter secure',
    'Equipment inspected',
    'Hazards identified',
    'First aid kit present',
    'Emergency exits clear',
  ],
  jsa: [
    'Task identified',
    'Hazards listed',
    'Controls in place',
    'Workers briefed',
    'Signed off',
  ],
  toolbox_talk: [
    'Attendees recorded',
    'Topic covered',
    'Questions addressed',
    'Sign-in sheet complete',
  ],
  incident_report: [
    'Scene secured',
    'Injured party assessed',
    'Medical attention given',
    'Witnesses recorded',
    'Photos taken',
    'Management notified',
  ],
};

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FormStatus }) {
  if (status === 'completed') {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs gap-1">
        <CheckCircle2 className="w-3 h-3" /> Completed
      </Badge>
    );
  }
  if (status === 'requires_action') {
    return (
      <Badge className="bg-red-100 text-red-800 border-red-200 text-xs gap-1">
        <AlertTriangle className="w-3 h-3" /> Action Required
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs gap-1">
      <Clock className="w-3 h-3" /> Open
    </Badge>
  );
}

// ── New Form Dialog ──────────────────────────────────────────────────────────

interface NewFormDialogProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  userId: string;
  userName: string;
}

function NewFormDialog({ open, onClose, projects, userId, userName }: NewFormDialogProps) {
  const { toast } = useToast();
  const [formType, setFormType] = useState<FormType>('daily_inspection');
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFormType('daily_inspection');
      setProjectId('');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setItems(DEFAULT_CHECKLISTS['daily_inspection'].map(label => ({ label, checked: false })));
    }
  }, [open]);

  useEffect(() => {
    setItems(DEFAULT_CHECKLISTS[formType].map(label => ({ label, checked: false })));
  }, [formType]);

  function toggleItem(idx: number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item));
  }

  async function handleSave() {
    if (!projectId) {
      toast({ title: 'Select a project', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const proj = projects.find(p => p.id === projectId);
      const allChecked = items.every(i => i.checked);
      const hasUnchecked = items.some(i => !i.checked);
      const status: FormStatus = allChecked ? 'completed' : hasUnchecked ? 'open' : 'open';

      await addDoc(collection(db, 'safetyForms'), {
        projectId,
        projectName: proj?.name ?? '',
        formType,
        inspectedBy: userId,
        inspectedByName: userName,
        date,
        status,
        notes,
        items,
        createdAt: Timestamp.now(),
      });
      toast({ title: 'Safety form created' });
      onClose();
    } catch (e) {
      console.error(e);
      toast({ title: 'Error saving form', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Safety Form</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Form Type *</Label>
              <Select value={formType} onValueChange={v => setFormType(v as FormType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FORM_TYPE_LABELS) as FormType[]).map(ft => (
                    <SelectItem key={ft} value={ft}>{FORM_TYPE_LABELS[ft]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Checklist</Label>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleItem(idx)}
                >
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={() => toggleItem(idx)}
                    id={`item-${idx}`}
                  />
                  <label htmlFor={`item-${idx}`} className="text-sm text-gray-700 cursor-pointer flex-1">{item.label}</label>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              {items.filter(i => i.checked).length}/{items.length} checked
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes or observations..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
          >
            Create Form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Form Card ────────────────────────────────────────────────────────────────

interface FormCardProps {
  form: SafetyForm;
}

function FormCard({ form }: FormCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<ChecklistItem[]>(form.items ?? []);
  const checkedCount = items.filter(i => i.checked).length;

  async function toggleItem(idx: number) {
    const updated = items.map((item, i) => i === idx ? { ...item, checked: !item.checked } : item);
    setItems(updated);
    const allChecked = updated.every(i => i.checked);
    const newStatus: FormStatus = allChecked ? 'completed' : 'open';
    try {
      await updateDoc(doc(db, 'safetyForms', form.id), {
        items: updated,
        status: newStatus,
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Error updating checklist', variant: 'destructive' });
      setItems(items);
    }
  }

  return (
    <Card className="border-gray-200 hover:shadow-md transition-shadow">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${FORM_TYPE_COLORS[form.formType]} text-xs`}>
                {FORM_TYPE_LABELS[form.formType]}
              </Badge>
              <StatusBadge status={form.status} />
            </div>
            <CardTitle className="text-sm font-semibold text-gray-800">{form.projectName}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{form.inspectedByName}</span>
          <div className="flex items-center gap-3">
            <span>{new Date(form.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span className="font-medium text-gray-700">{checkedCount}/{items.length} items</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#C9A96E] transition-all"
            style={{ width: items.length > 0 ? `${(checkedCount / items.length) * 100}%` : '0%' }}
          />
        </div>

        {form.notes && (
          <p className="text-xs text-gray-500 line-clamp-2">{form.notes}</p>
        )}

        {expanded && items.length > 0 && (
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 mt-2">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer"
                onClick={() => toggleItem(idx)}
              >
                <Checkbox
                  checked={item.checked}
                  onCheckedChange={() => toggleItem(idx)}
                  id={`${form.id}-item-${idx}`}
                />
                <label
                  htmlFor={`${form.id}-item-${idx}`}
                  className={`text-sm cursor-pointer flex-1 ${item.checked ? 'line-through text-gray-400' : 'text-gray-700'}`}
                >
                  {item.label}
                </label>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Safety() {
  const { user } = useAuth();
  const [forms, setForms] = useState<SafetyForm[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [filterProject, setFilterProject] = useState('all');
  const [filterType, setFilterType] = useState<FormType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<FormStatus | 'all'>('all');

  useEffect(() => {
    getDocs(collection(db, 'projects')).then(snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name?: string }).name ?? d.id })));
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'safetyForms'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setForms(snap.docs.map(d => ({ id: d.id, ...d.data() } as SafetyForm)));
    }, console.error);
    return () => unsub();
  }, []);

  const filtered = forms.filter(f => {
    if (filterProject !== 'all' && f.projectId !== filterProject) return false;
    if (filterType !== 'all' && f.formType !== filterType) return false;
    if (filterStatus !== 'all' && f.status !== filterStatus) return false;
    return true;
  });

  const openCount = forms.filter(f => f.status === 'open' || f.status === 'requires_action').length;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Safety</h1>
            {openCount > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-semibold">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {openCount} open
              </Badge>
            )}
          </div>
          <Button
            onClick={() => setNewFormOpen(true)}
            className="bg-[#C9A96E] hover:bg-[#b8934d] text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Form
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={v => setFilterType(v as FormType | 'all')}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {(Object.keys(FORM_TYPE_LABELS) as FormType[]).map(ft => (
                <SelectItem key={ft} value={ft}>{FORM_TYPE_LABELS[ft]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as FormStatus | 'all')}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="requires_action">Action Required</SelectItem>
            </SelectContent>
          </Select>

          {(filterProject !== 'all' || filterType !== 'all' || filterStatus !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-gray-500"
              onClick={() => { setFilterProject('all'); setFilterType('all'); setFilterStatus('all'); }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Forms', value: forms.length, icon: ShieldCheck, color: 'text-blue-500' },
            { label: 'Open', value: forms.filter(f => f.status === 'open').length, icon: Clock, color: 'text-amber-500' },
            { label: 'Completed', value: forms.filter(f => f.status === 'completed').length, icon: CheckCircle2, color: 'text-green-500' },
            { label: 'Action Required', value: forms.filter(f => f.status === 'requires_action').length, icon: AlertTriangle, color: 'text-red-500' },
          ].map(stat => (
            <Card key={stat.label} className="border-gray-200">
              <CardContent className="px-4 py-3 flex items-center gap-3">
                <stat.icon className={`w-5 h-5 ${stat.color} shrink-0`} />
                <div>
                  <p className="text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Form List */}
        {filtered.length === 0 ? (
          <Card className="bg-gray-50 border-dashed">
            <CardContent className="py-12 text-center">
              <ShieldCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No safety forms found. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(form => (
              <FormCard key={form.id} form={form} />
            ))}
          </div>
        )}
      </div>

      <NewFormDialog
        open={newFormOpen}
        onClose={() => setNewFormOpen(false)}
        projects={projects}
        userId={user ? String(user.id) : ''}
        userName={user?.name ?? ''}
      />
    </AppLayout>
  );
}
