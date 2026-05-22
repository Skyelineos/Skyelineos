import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
  serverTimestamp, query, orderBy, getDoc, setDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/auth/AuthContext';
import { VcardImportZone } from '@/components/sales/VcardImportZone';
import {
  Plus, Search, MoreVertical, Filter, X, ChevronUp, ChevronDown,
  ExternalLink, FolderOpen, List, LayoutGrid, Settings2, Trash2,
  ArrowRight, Edit2, User,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type ProjectType = 'custom_home' | 'remodel' | 'addition' | 'spec' | 'commercial' | 'other';
type LeadSource  = 'referral' | 'parade_of_homes' | 'website' | 'instagram' | 'email' | 'phone' | 'other';

interface StageConfig { key: string; label: string; color: string; }

interface Client {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  stage: string;
  projectType?: ProjectType;
  source?: LeadSource;
  jobAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  spouse?: {
    name: string;
    email?: string | null;
    phone?: string | null;
  } | null;
  budget?: number | null;
  squareFootage?: number | null;
  notes?: string | null;
  priority?: 'low' | 'medium' | 'high';
  assignedTo?: string | null;
  assignedToName?: string | null;
  tags?: string[];
  linkedJobId?: string;
  // Set by ImportCenter on bulk import; cleared by the Review Imported Leads
  // wizard once the operator has enriched the row.
  importedAt?: any;
  importReviewNeeded?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

interface TeamMember { id: string; name: string; email: string; }

// ─── Default stages (matching Jack's pipeline) ───────────────────────────────

const DEFAULT_STAGES: StageConfig[] = [
  { key: 'new_lead',        label: 'New Lead',         color: '#64748b' },
  { key: 'meeting_booked',  label: 'Meeting Booked',   color: '#3b82f6' },
  { key: 'design_phase',    label: 'Design Phase',     color: '#8b5cf6' },
  { key: 'in_estimating',   label: 'In Estimating',    color: '#f59e0b' },
  { key: 'close_to_sign',   label: 'Close to Signing', color: '#C9A96E' },
  { key: 'won',             label: 'Won',              color: '#22c55e' },
  { key: 'lost',            label: 'Lost',             color: '#ef4444' },
];

const PROJECT_TYPES: { value: ProjectType; label: string }[] = [
  { value: 'custom_home', label: 'Custom Home' },
  { value: 'remodel',     label: 'Remodel'     },
  { value: 'addition',    label: 'Addition'    },
  { value: 'spec',        label: 'Spec Build'  },
  { value: 'commercial',  label: 'Commercial'  },
  { value: 'other',       label: 'Other'       },
];

const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'referral',        label: 'Referral'        },
  { value: 'parade_of_homes', label: 'Parade of Homes' },
  { value: 'website',         label: 'Website'         },
  { value: 'instagram',       label: 'Instagram'       },
  { value: 'email',           label: 'Email'           },
  { value: 'phone',           label: 'Phone'           },
  { value: 'other',           label: 'Other'           },
];

const COLOR_OPTIONS = [
  '#64748b','#3b82f6','#f59e0b','#8b5cf6','#10b981',
  '#C9A96E','#22c55e','#ef4444','#ec4899','#06b6d4',
  '#f97316','#84cc16','#6366f1','#14b8a6','#a855f7',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stageConfig(key: string, stages: StageConfig[]) {
  return stages.find(s => s.key === key) ?? { key, label: key, color: '#64748b' };
}

function fmtBudget(n?: number | null) {
  if (!n) return null;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtFull(n?: number | null) {
  if (!n) return '$0';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function generateKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `s_${Date.now()}`;
}

// ─── Edit Stages Modal ───────────────────────────────────────────────────────

function EditStagesModal({ open, onClose, stages, onSave }: {
  open: boolean; onClose: () => void;
  stages: StageConfig[]; onSave: (s: StageConfig[]) => Promise<void>;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<StageConfig[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setDraft(stages.map(s => ({ ...s }))); }, [open, stages]);

  const update = (i: number, k: keyof StageConfig, v: string) =>
    setDraft(d => d.map((s, idx) => idx === i ? { ...s, [k]: v } : s));

  const swap = (i: number, j: number) => setDraft(d => {
    const n = [...d]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(draft.filter(s => s.label.trim())); onClose(); }
    catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Pipeline Stages</DialogTitle>
          <p className="text-sm text-gray-500">Rename, reorder, add or remove stages.</p>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2 py-2">
          {draft.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <div className="relative flex-shrink-0">
                <div className="w-6 h-6 rounded-full cursor-pointer border-2 border-white shadow-sm"
                  style={{ backgroundColor: stage.color }}
                  onClick={e => (e.currentTarget.nextElementSibling as HTMLInputElement)?.click()} />
                <input type="color" className="absolute opacity-0 w-0 h-0" value={stage.color}
                  onChange={e => update(i, 'color', e.target.value)} />
              </div>
              <Input className="h-8 text-sm flex-1" value={stage.label}
                onChange={e => update(i, 'label', e.target.value)} />
              <div className="flex flex-col gap-0.5">
                <button onClick={() => swap(i, i - 1)} disabled={i === 0}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => swap(i, i + 1)} disabled={i === draft.length - 1}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-20">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <button onClick={() => draft.length > 1 && setDraft(d => d.filter((_, j) => j !== i))}
                disabled={draft.length <= 1}
                className="p-1 rounded text-gray-400 hover:text-red-500 disabled:opacity-20">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t flex flex-wrap gap-1.5 mb-3">
          {COLOR_OPTIONS.map(c => (
            <div key={c} className="w-5 h-5 rounded-full cursor-pointer border border-white shadow-sm hover:scale-110 transition-transform"
              style={{ backgroundColor: c }} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setDraft(d => [...d, { key: generateKey('New Stage') + '_' + Date.now(), label: 'New Stage', color: '#64748b' }])}>
            <Plus className="h-4 w-4 mr-1" /> Add Stage
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button style={{ backgroundColor: '#C9A96E', color: '#141414' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Link Project Dialog ─────────────────────────────────────────────────────

function LinkProjectDialog({ client, open, onClose, onLinked }: {
  client: Client; open: boolean; onClose: () => void;
  onLinked: (id: string) => void;
}) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<{ id: string; name: string; address?: string }[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    return onSnapshot(query(collection(db, 'projects'), orderBy('name', 'asc')), snap =>
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name, address: (d.data() as any).address })))
    );
  }, [open]);

  const filtered = projects.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.address || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleLink = async (pid: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'clients', client.id), { linkedJobId: pid, updatedAt: serverTimestamp() });
      toast({ title: 'Project linked' });
      onLinked(pid);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Link Project — {client.name}</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1.5">
          {filtered.map(p => (
            <button key={p.id} disabled={saving} onClick={() => handleLink(p.id)}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#C9A96E] hover:bg-amber-50 transition-colors group">
              <FolderOpen className="w-4 h-4 text-gray-400 group-hover:text-[#C9A96E] flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                {p.address && <p className="text-xs text-gray-500 truncate">{p.address}</p>}
              </div>
              {client.linkedJobId === p.id && <span className="text-xs text-green-600 font-medium">Current</span>}
              <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[#C9A96E] flex-shrink-0" />
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No projects found</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead Form Dialog ────────────────────────────────────────────────────────

interface LeadPrefill {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  jobAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  spouseName?: string;
  spouseEmail?: string;
  spousePhone?: string;
  budget?: string;
  notes?: string;
}

function LeadDialog({ open, editing, stages, teamMembers, prefill, onClose, onSave }: {
  open: boolean;
  editing: Client | null;
  stages: StageConfig[];
  teamMembers: TeamMember[];
  prefill?: LeadPrefill;
  onClose: () => void;
  onSave: (data: Partial<Client>) => Promise<void>;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [tagInput, setTagInput] = useState('');

  const blank = {
    firstName: '', lastName: '',
    email: '', phone: '', company: '', jobAddress: '', city: '', state: '', zip: '',
    // hasSpouse toggles the spouse fields. We keep the three spouse fields in
    // state regardless so toggling off-then-on doesn't wipe entered text;
    // the save handler only emits a spouse object when hasSpouse is true.
    hasSpouse: false,
    spouseName: '', spouseEmail: '', spousePhone: '',
    stage: stages[0]?.key || 'new_lead',
    projectType: 'custom_home' as ProjectType,
    source: 'referral' as LeadSource,
    budget: '', squareFootage: '', notes: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    assignedTo: user?.firebaseUid || '',
    assignedToName: user?.name || '',
    tags: [] as string[],
  };

  // When editing an existing lead, split the stored full `name` into first/last.
  // First word is firstName; everything else is lastName. Round-trips: if the
  // user doesn't change anything, save reproduces the same combined name.
  const splitName = (full: string): { firstName: string; lastName: string } => {
    const parts = (full || '').trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
  };

  const [form, setForm] = useState(blank);

  useEffect(() => {
    if (open) {
      if (editing) {
        // Prefer the stored firstName/lastName if present (set by recent
        // saves). Fall back to splitting the legacy combined `name` field
        // for older records that don't have the split pair yet.
        const fn = editing.firstName ?? '';
        const ln = editing.lastName ?? '';
        const fallback = fn || ln ? { firstName: fn, lastName: ln } : splitName(editing.name || '');
        setForm({
          firstName: fallback.firstName,
          lastName: fallback.lastName,
          email: editing.email || '',
          phone: editing.phone || '',
          company: editing.company || '',
          jobAddress: editing.jobAddress || '',
          city: editing.city || '',
          state: editing.state || '',
          zip: editing.zip || '',
          hasSpouse: !!(editing.spouse && editing.spouse.name),
          spouseName: editing.spouse?.name || '',
          spouseEmail: editing.spouse?.email || '',
          spousePhone: editing.spouse?.phone || '',
          stage: editing.stage || stages[0]?.key || 'new_lead',
          projectType: editing.projectType || 'custom_home',
          source: editing.source || 'referral',
          budget: editing.budget?.toString() || '',
          squareFootage: editing.squareFootage?.toString() || '',
          notes: editing.notes || '',
          priority: editing.priority || 'medium',
          assignedTo: editing.assignedTo || '',
          assignedToName: editing.assignedToName || '',
          tags: editing.tags || [],
        });
      } else if (prefill) {
        // Pre-fill new-lead form (e.g., from "Create lead from estimate" deep link,
        // mobile contact picker, or the Review Imported Leads wizard).
        setForm({
          ...blank,
          firstName:   prefill.firstName   ?? blank.firstName,
          lastName:    prefill.lastName    ?? blank.lastName,
          email:       prefill.email       ?? blank.email,
          phone:       prefill.phone       ?? blank.phone,
          jobAddress:  prefill.jobAddress  ?? blank.jobAddress,
          city:        prefill.city        ?? blank.city,
          state:       prefill.state       ?? blank.state,
          zip:         prefill.zip         ?? blank.zip,
          hasSpouse:   !!prefill.spouseName,
          spouseName:  prefill.spouseName  ?? blank.spouseName,
          spouseEmail: prefill.spouseEmail ?? blank.spouseEmail,
          spousePhone: prefill.spousePhone ?? blank.spousePhone,
          budget:      prefill.budget      ?? blank.budget,
          notes:       prefill.notes       ?? blank.notes,
        });
      } else {
        setForm(blank);
      }
      setTagInput('');
    }
  }, [open, editing, prefill]);

  // ── Mobile contact picker — Web Contacts API ─────────────────────────────
  // navigator.contacts is supported on Chrome Android (and some Edge mobile).
  // iOS Safari doesn't expose it yet (Apple hasn't shipped the API). When
  // unavailable, we hide the button — paste-as-text still works as fallback.
  const contactPickerAvailable = typeof window !== 'undefined'
    && 'contacts' in (navigator as any)
    && typeof (navigator as any).contacts?.select === 'function';

  const pickFromContacts = async () => {
    try {
      const result = await (navigator as any).contacts.select(
        ['name', 'email', 'tel'],
        { multiple: false },
      );
      if (!result || result.length === 0) return;
      const c = result[0];
      const fullName = Array.isArray(c.name) ? c.name[0] : c.name;
      const [firstName, ...rest] = (fullName || '').split(/\s+/);
      set('firstName', firstName || form.firstName);
      set('lastName', rest.join(' ') || form.lastName);
      const email = Array.isArray(c.email) ? c.email[0] : c.email;
      const tel = Array.isArray(c.tel) ? c.tel[0] : c.tel;
      if (email) set('email', email);
      if (tel) set('phone', tel);
      toast({ title: 'Contact imported', description: fullName || 'Filled in from your contacts' });
    } catch (e: any) {
      // Permission denied or user cancelled — silent
      if (e?.name !== 'AbortError') toast({ title: 'Contact picker unavailable', description: e?.message || 'Try entering manually', variant: 'destructive' });
    }
  };

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (t && !form.tags.includes(t)) set('tags', [...form.tags, t]);
    setTagInput('');
  };

  const removeTag = (tag: string) => set('tags', form.tags.filter(t => t !== tag));

  const handleSave = async () => {
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    if (!fullName) { toast({ title: 'First or last name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const assignedMember = teamMembers.find(m => m.id === form.assignedTo);
      // Emit a spouse object only when the toggle is on AND there's a name.
      // Toggling off (or leaving the name blank) writes spouse: null so the
      // edit dialog reads cleanly on the next open.
      const spousePayload =
        form.hasSpouse && form.spouseName.trim()
          ? {
              name: form.spouseName.trim(),
              email: form.spouseEmail.trim() || null,
              phone: form.spousePhone.trim() || null,
            }
          : null;
      await onSave({
        name: fullName,
        firstName: form.firstName.trim() || null,
        lastName:  form.lastName.trim()  || null,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        jobAddress: form.jobAddress || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        spouse: spousePayload,
        stage: form.stage,
        projectType: form.projectType,
        source: form.source,
        budget: form.budget ? parseFloat(form.budget) : null,
        squareFootage: form.squareFootage ? parseFloat(form.squareFootage) : null,
        notes: form.notes || null,
        priority: form.priority,
        assignedTo: form.assignedTo || null,
        assignedToName: assignedMember?.name || form.assignedToName || null,
        tags: form.tags,
      });
      onClose();
    } catch (e: any) {
      toast({ title: 'Error saving', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
        </DialogHeader>

        {/* Mobile contact picker — fills name/email/phone from a tap on the
            phone's address book. Browser support is best on Android Chrome;
            iOS Safari hides this button entirely (Apple hasn't shipped the API). */}
        {contactPickerAvailable && !editing && (
          <Button
            variant="outline"
            size="sm"
            onClick={pickFromContacts}
            className="w-full justify-center gap-2 mb-2"
            style={{ borderColor: 'rgba(201,169,110,0.5)', color: '#8B6F3F' }}
          >
            <User className="w-4 h-4" />
            Pick from phone contacts
          </Button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {/* Name — split into first/last */}
          <div>
            <Label>First Name *</Label>
            <Input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>
          <div>
            <Label>Last Name *</Label>
            <Input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>

          {/* Contact */}
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>

          {/* Company */}
          <div>
            <Label>Company <span className="text-xs text-gray-400 font-normal">(optional)</span></Label>
            <Input value={form.company} onChange={e => set('company', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>

          {/* Source */}
          <div>
            <Label>Lead Source</Label>
            <Select value={form.source} onValueChange={v => set('source', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Address — full row for street, then City / State / Zip on one row */}
          <div className="sm:col-span-2">
            <Label>Job Address</Label>
            <Input value={form.jobAddress} onChange={e => set('jobAddress', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>
          <div className="sm:col-span-2 grid grid-cols-6 gap-3">
            <div className="col-span-3">
              <Label>City</Label>
              <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
            </div>
            <div className="col-span-1">
              <Label>State</Label>
              <Input value={form.state} onChange={e => set('state', e.target.value.toUpperCase().slice(0, 2))} placeholder="UT" maxLength={2} className="placeholder:text-gray-300" />
            </div>
            <div className="col-span-2">
              <Label>Zip</Label>
              <Input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
            </div>
          </div>

          {/* Spouse — hidden by default; "+ Add Spouse" reveals three fields.
              Toggling off clears emission on save but keeps the values in
              local state in case the user re-toggles on. */}
          <div className="sm:col-span-2">
            {!form.hasSpouse ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => set('hasSpouse', true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" /> Add Spouse
              </Button>
            ) : (
              <div className="border rounded-lg p-3 bg-gray-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Spouse</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      set('hasSpouse', false);
                      set('spouseName', '');
                      set('spouseEmail', '');
                      set('spousePhone', '');
                    }}
                    className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="w-3 h-3 mr-1" /> Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label>Spouse Name</Label>
                    <Input value={form.spouseName} onChange={e => set('spouseName', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
                  </div>
                  <div>
                    <Label>Spouse Email</Label>
                    <Input type="email" value={form.spouseEmail} onChange={e => set('spouseEmail', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
                  </div>
                  <div>
                    <Label>Spouse Phone</Label>
                    <Input value={form.spousePhone} onChange={e => set('spousePhone', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Budget & Sqft */}
          <div>
            <Label>Budget ($)</Label>
            <Input type="number" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>
          <div>
            <Label>Square Footage</Label>
            <Input type="number" value={form.squareFootage} onChange={e => set('squareFootage', e.target.value)} placeholder="—" className="placeholder:text-gray-300" />
          </div>

          {/* Project type & stage */}
          <div>
            <Label>Project Type</Label>
            <Select value={form.projectType} onValueChange={v => set('projectType', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Stage</Label>
            <Select value={form.stage} onValueChange={v => set('stage', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div>
            <Label>Assigned To</Label>
            <Select value={form.assignedTo} onValueChange={v => set('assignedTo', v)}>
              <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
              <SelectContent>
                {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={v => set('priority', v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="sm:col-span-2">
            <Label>Tags</Label>
            <div className="flex gap-2 flex-wrap mb-2">
              {form.tags.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {t}
                  <button onClick={() => removeTag(t)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput); } }}
                placeholder="Type a tag and press Enter"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={() => addTag(tagInput)}>Add</Button>
            </div>
          </div>

          {/* Notes */}
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Any notes about this lead…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button style={{ backgroundColor: '#C9A96E', color: '#141414' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Add Lead')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Project + Estimate Dialog ────────────────────────────────────────

function CreateProjectDialog({ client, mode, previousStage, previousStageLabel, onClose, onCreate, onRevert }: {
  client: Client;
  mode: 'auto' | 'prompt'; // auto = estimating (required), prompt = optional
  previousStage?: string;
  previousStageLabel?: string;
  onClose: () => void;
  onCreate: (projectId: string) => void;
  onRevert?: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [form, setForm] = useState({
    projectName: client.name,
    address: [client.jobAddress, client.city].filter(Boolean).join(', '),
  });

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleCreate = async () => {
    if (!form.projectName.trim()) return;
    setSaving(true);
    try {
      // 1. Create project
      const projectRef = await addDoc(collection(db, 'projects'), {
        name: form.projectName.trim(),
        clientName: client.name,
        address: form.address || null,
        status: 'active',
        projectType: client.projectType || 'custom_home',
        contractAmount: client.budget || null,
        budget: client.budget || null,
        progress: 0,
        currentPhase: 'Pre-Construction',
        assignedUserIds: client.assignedTo ? [client.assignedTo] : [],
        createdFromLeadId: client.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user?.firebaseUid || '',
      });

      // 2. Create blank draft estimate linked to project
      await addDoc(collection(db, 'estimates'), {
        title: `${form.projectName.trim()} — Estimate`,
        clientId: client.id,
        clientName: client.name,
        jobAddress: form.address || null,
        projectId: projectRef.id,
        projectName: form.projectName.trim(),
        status: 'draft',
        lineItems: [],
        subtotal: 0,
        overhead: 10,
        profit: 10,
        totalAmount: 0,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Link client → project
      await updateDoc(doc(db, 'clients', client.id), {
        linkedJobId: projectRef.id,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Project & estimate created',
        description: `"${form.projectName.trim()}" is ready in Projects.`,
      });
      onCreate(projectRef.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'auto'
              ? 'Create Project & Estimate'
              : 'Create a Project Folder?'}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-2">
          {mode === 'auto'
            ? `Moving to estimating — a project folder and draft estimate will be created for ${client.name}.`
            : `${client.name} is moving through your pipeline. Create a project folder to track their build.`}
        </p>

        <div className="space-y-3 py-1">
          <div>
            <Label>Project Name</Label>
            <Input
              value={form.projectName}
              onChange={e => set('projectName', e.target.value)}
              placeholder="e.g. Smith Custom Home"
            />
          </div>
          <div>
            <Label>Job Address</Label>
            <Input
              value={form.address}
              onChange={e => set('address', e.target.value)}
              placeholder="123 Main St, Salt Lake City"
            />
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-xs text-amber-700">
          This will create a <strong>Project</strong> in your Jobs list and a <strong>Draft Estimate</strong> in Estimates — both linked to this lead.
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:justify-end gap-2 pt-2">
          {/* Move back: reverts the stage drag if it was a mistake. */}
          {onRevert && previousStage && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 w-full sm:w-auto"
              disabled={reverting || saving}
              onClick={async () => {
                setReverting(true);
                try { await onRevert(); }
                finally { setReverting(false); }
              }}
              title={previousStageLabel ? `Move back to ${previousStageLabel}` : 'Move back to previous stage'}
            >
              {reverting ? 'Reverting…' : 'Move back'}
            </Button>
          )}
          {/* Skip: keep the new stage but don't create the project/estimate yet. */}
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={onClose}
            disabled={reverting || saving}
          >
            Skip for now
          </Button>
          <Button
            size="sm"
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            className="w-full sm:w-auto"
            onClick={handleCreate}
            disabled={saving || reverting || !form.projectName.trim()}
          >
            {saving ? 'Creating…' : 'Create Project & Estimate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Filter Panel ─────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  budgetMin: string;
  budgetMax: string;
  tags: string[];
  assignedTo: string;
  stage: string;
  priority: '' | 'low' | 'medium' | 'high';
  sort: 'newest' | 'oldest' | 'budget_desc' | 'budget_asc' | 'name_asc' | 'priority';
}

const EMPTY_FILTERS: Filters = {
  search: '', budgetMin: '', budgetMax: '', tags: [],
  assignedTo: '', stage: '', priority: '', sort: 'newest',
};

// Priority → color used for the card left-stripe + filter chip.
const PRIORITY_COLORS: Record<string, { stripe: string; bg: string; text: string; label: string }> = {
  high:   { stripe: '#ef4444', bg: 'bg-red-50',    text: 'text-red-700',    label: 'High' },
  medium: { stripe: '#f59e0b', bg: 'bg-amber-50',  text: 'text-amber-700',  label: 'Medium' },
  low:    { stripe: '#94a3b8', bg: 'bg-slate-50',  text: 'text-slate-600',  label: 'Low' },
};
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function FilterPanel({ open, filters, onFiltersChange, onClose, stages, teamMembers, allTags }: {
  open: boolean;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onClose: () => void;
  stages: StageConfig[];
  teamMembers: TeamMember[];
  allTags: string[];
}) {
  const set = (k: keyof Filters, v: any) => onFiltersChange({ ...filters, [k]: v });
  const activeCount = [
    filters.search, filters.budgetMin, filters.budgetMax,
    filters.assignedTo, filters.stage, filters.priority, ...filters.tags,
  ].filter(Boolean).length + (filters.sort !== 'newest' ? 1 : 0);

  return (
    <div
      className={`fixed top-0 right-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-gray-100">
        <div>
          <h2 className="font-semibold text-gray-900">Filter Leads</h2>
          {activeCount > 0 && <p className="text-xs text-amber-600 mt-0.5">{activeCount} filter{activeCount > 1 ? 's' : ''} active</p>}
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-500">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Search */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Search</Label>
          <div className="relative mt-1.5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input className="pl-9" placeholder="Name, email, address…" value={filters.search}
              onChange={e => set('search', e.target.value)} />
          </div>
        </div>

        {/* Budget range */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Budget</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <Input className="pl-7" type="number" placeholder="Min" value={filters.budgetMin}
                onChange={e => set('budgetMin', e.target.value)} />
            </div>
            <span className="text-gray-400 text-sm">–</span>
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <Input className="pl-7" type="number" placeholder="Max" value={filters.budgetMax}
                onChange={e => set('budgetMax', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Assigned To */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned To</Label>
          <Select value={filters.assignedTo || 'all'} onValueChange={v => set('assignedTo', v === 'all' ? '' : v)}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Anyone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anyone</SelectItem>
              {teamMembers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Stage */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage</Label>
          <Select value={filters.stage || 'all'} onValueChange={v => set('stage', v === 'all' ? '' : v)}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="All stages" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stages.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Priority</Label>
          <Select value={filters.priority || 'all'} onValueChange={v => set('priority', v === 'all' ? '' : v)}>
            <SelectTrigger className="mt-1.5"><SelectValue placeholder="Any priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority</SelectItem>
              <SelectItem value="high">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS.high.stripe }} />
                  High only
                </span>
              </SelectItem>
              <SelectItem value="medium">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS.medium.stripe }} />
                  Medium only
                </span>
              </SelectItem>
              <SelectItem value="low">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS.low.stripe }} />
                  Low only
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div>
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => {
                    const next = filters.tags.includes(tag)
                      ? filters.tags.filter(t => t !== tag)
                      : [...filters.tags, tag];
                    set('tags', next);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filters.tags.includes(tag)
                      ? 'border-[#C9A96E] bg-amber-50 text-amber-800 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sort */}
        <div>
          <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sort</Label>
          <Select value={filters.sort} onValueChange={v => set('sort', v as Filters['sort'])}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="priority">Priority: High → Low</SelectItem>
              <SelectItem value="budget_desc">Budget: High → Low</SelectItem>
              <SelectItem value="budget_asc">Budget: Low → High</SelectItem>
              <SelectItem value="name_asc">Name A → Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Footer */}
      <div className="p-5 border-t border-gray-100">
        <button
          onClick={() => onFiltersChange(EMPTY_FILTERS)}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}

// ─── Pipeline Card ────────────────────────────────────────────────────────────

function PipelineCard({ client, stages, onEdit, onDelete, onAdvance }: {
  client: Client;
  stages: StageConfig[];
  onEdit: () => void;
  onDelete: () => void;
  onAdvance: () => void;
}) {
  const [, setLocation] = useLocation();
  const [linkOpen, setLinkOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const stageIdx = stages.findIndex(s => s.key === client.stage);
  const canAdvance = stageIdx >= 0 && stageIdx < stages.length - 1;

  const openProject = () => {
    if (client.linkedJobId) setLocation(`/projects/${client.linkedJobId}`);
    else setLinkOpen(true);
  };

  const priorityCfg = PRIORITY_COLORS[client.priority || 'medium'] || PRIORITY_COLORS.medium;

  return (
    <>
      <div
        draggable
        onDragStart={e => { e.dataTransfer.setData('clientId', client.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDoubleClick={e => { e.preventDefault(); openProject(); }}
        className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-grab active:cursor-grabbing group relative"
        style={{ borderLeft: `3px solid ${priorityCfg.stripe}` }}
        title={`Priority: ${priorityCfg.label}`}
      >
        {/* Kebab menu — floats top-right so the lead name owns the full
            card width directly below. */}
        <div className="absolute top-1.5 right-1.5 z-10">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
            className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                <button onClick={() => { setMenuOpen(false); openProject(); }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                  <ExternalLink className="w-4 h-4" />
                  {client.linkedJobId ? 'Open Project' : 'Link & Open Project'}
                </button>
                <button onClick={() => { setMenuOpen(false); onEdit(); }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                  <Edit2 className="w-4 h-4" />Edit
                </button>
                {canAdvance && (
                  <button onClick={() => { setMenuOpen(false); onAdvance(); }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                    <ArrowRight className="w-4 h-4" />Advance Stage
                  </button>
                )}
                <div className="border-t border-gray-100 my-1" />
                <button onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600">
                  <Trash2 className="w-4 h-4" />Delete
                </button>
              </div>
            </>
          )}
        </div>
        {/* Lead name — the headline. Full width, larger, up to three lines
            so a long name doesn't get clipped. pr-7 reserves space for the
            kebab in the top-right. */}
        <p className="text-base font-bold text-gray-900 leading-snug line-clamp-3 pr-7 [overflow-wrap:normal] [word-break:keep-all] hyphens-none" title={client.name}>
          {client.name}
        </p>
        {client.spouse?.name && (
          <p className="text-xs text-gray-500 mt-0.5" title={`Spouse: ${client.spouse.name}`}>
            & {client.spouse.name}
          </p>
        )}
        {client.assignedToName && (
          <p className="text-xs text-gray-500 truncate mt-1" title={client.assignedToName}>
            {client.assignedToName}
          </p>
        )}
        {client.budget && (
          <p className="text-xs font-semibold text-gray-700 mt-1 whitespace-nowrap">
            {fmtFull(client.budget)}
          </p>
        )}

        {/* Tags */}
        {client.tags && client.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {client.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{t}</span>
            ))}
          </div>
        )}

        {/* Linked job chip */}
        {client.linkedJobId && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-500">
            <FolderOpen className="w-3 h-3" />
            <span>Linked job</span>
          </div>
        )}
      </div>

      {linkOpen && (
        <LinkProjectDialog client={client} open={linkOpen} onClose={() => setLinkOpen(false)}
          onLinked={id => { setLinkOpen(false); setLocation(`/projects/${id}`); }} />
      )}
    </>
  );
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ListRow({ client, stages, onEdit, onDelete }: {
  client: Client; stages: StageConfig[];
  onEdit: () => void; onDelete: () => void;
}) {
  const [, setLocation] = useLocation();
  const cfg = stageConfig(client.stage, stages);
  const priorityCfg = PRIORITY_COLORS[client.priority || 'medium'] || PRIORITY_COLORS.medium;
  return (
    <div
      className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 transition-colors"
      style={{ borderLeft: `3px solid ${priorityCfg.stripe}` }}
      title={`Priority: ${priorityCfg.label}`}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{client.name}</p>
        {client.assignedToName && <p className="text-xs text-gray-400">{client.assignedToName}</p>}
      </div>
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {client.tags?.slice(0, 2).map(t => (
          <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{t}</span>
        ))}
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
        style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}>
        {cfg.label}
      </span>
      {client.budget && (
        <span className="text-sm font-semibold text-gray-700 flex-shrink-0">{fmtFull(client.budget)}</span>
      )}
      <div className="flex items-center gap-1 flex-shrink-0">
        <button onClick={onEdit} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
          <Edit2 className="w-4 h-4" />
        </button>
        {client.linkedJobId && (
          <button onClick={() => setLocation(`/projects/${client.linkedJobId!}`)}
            className="p-1.5 rounded hover:bg-blue-50 text-blue-400 hover:text-blue-600">
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
        <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Sales() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [stages, setStages] = useState<StageConfig[]>(DEFAULT_STAGES);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'pipeline' | 'list'>('pipeline');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [editStagesOpen, setEditStagesOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [leadPrefill, setLeadPrefill] = useState<LeadPrefill | undefined>(undefined);

  // ── Deep-link: open the new-lead dialog with prefilled fields ────────────
  // Triggered by /sales?newLead=1&name=&address=&amount=&email=&phone= — used
  // by the "Create lead from this estimate" action on orphan estimates and by
  // any external integration that wants to seed a lead.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('newLead') !== '1') return;
    const name = params.get('name') || '';
    const [firstName, ...rest] = name.trim().split(/\s+/);
    setLeadPrefill({
      firstName,
      lastName: rest.join(' '),
      email: params.get('email') || undefined,
      phone: params.get('phone') || undefined,
      jobAddress: params.get('address') || undefined,
      budget: params.get('amount') || undefined,
      notes: params.get('fromEstimateId')
        ? `Created from estimate ${params.get('fromEstimateId')}`
        : undefined,
    });
    setEditing(null);
    setLeadDialogOpen(true);
    // Clean the URL so a refresh doesn't re-open the dialog.
    window.history.replaceState({}, '', '/sales');
  }, []);

  // Project creation prompt state. previousStage lets the dialog revert if the
  // drag was a mistake (e.g. user dragged a card to estimating but didn't mean to).
  const [pendingProject, setPendingProject] = useState<{ client: Client; mode: 'auto' | 'prompt'; previousStage?: string } | null>(null);

  // Drag state
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // ── Stage-change helpers ──────────────────────────────────────────────────

  // Returns true if the stage key represents an "estimating" stage
  const isEstimatingStage = (key: string) => key.toLowerCase().includes('estimat');

  // After any stage change, check if we need to create a project
  const checkProjectCreation = (client: Client, oldStage: string, newStage: string) => {
    if (client.linkedJobId) return; // already has a project — skip
    const firstStageKey = stages[0]?.key || '';
    if (isEstimatingStage(newStage)) {
      // Moving to estimating → prompt with project/estimate pre-fill, but
      // also let the user back out (revert to oldStage or skip without creating).
      setPendingProject({ client, mode: 'auto', previousStage: oldStage });
    } else if (oldStage === firstStageKey) {
      // Moving out of the first stage (New Lead) → soft prompt
      setPendingProject({ client, mode: 'prompt', previousStage: oldStage });
    }
  };

  // Load pipeline stages. Auto-migrates away from the legacy project-lifecycle
  // stage set (Pre Construction / Active Build / Punchlist / Completed Build)
  // that briefly shipped — those weren't sales pipeline stages and overrode
  // the new DEFAULT_STAGES on every load. If detected, the doc is deleted and
  // DEFAULT_STAGES is used. User can re-customize via Edit Stages anytime.
  useEffect(() => {
    getDoc(doc(db, 'settings', 'pipeline')).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      const stored = d.stages as StageConfig[] | undefined;
      if (!Array.isArray(stored) || stored.length === 0) return;

      const LEGACY_MARKERS = [
        'Pre Construction', 'Active Build', 'Punchlist', 'Completed Build',
        'Final Passed', 'In Punchlist', 'In Punch List', 'Warranty',
      ];
      const isLegacy = stored.some(s =>
        LEGACY_MARKERS.some(m => (s.label || '').toLowerCase().includes(m.toLowerCase()))
      );

      if (isLegacy) {
        // Remove the legacy doc so DEFAULT_STAGES is used.
        deleteDoc(doc(db, 'settings', 'pipeline')).catch(() => {});
        return;  // Keep DEFAULT_STAGES — don't apply the legacy data
      }
      setStages(stored);
    }).catch(() => {});
  }, []);

  // ── One-time client-stage migration (option a + c from the cleanup conversation) ────
  // Maps legacy client.stage values to current pipeline keys, and deletes the
  // ghost demo leads Tyler flagged. Guarded by a settings/migrations flag so
  // it only runs once per project. Idempotent if it runs again — the flag
  // prevents writes, and orphaned-stage fixes are no-ops on already-correct data.
  useEffect(() => {
    (async () => {
      try {
        const flagRef = doc(db, 'settings', 'migrations');
        const flagSnap = await getDoc(flagRef);
        if (flagSnap.exists() && flagSnap.data()?.pipelineV2_migrated) return;

        // Map of legacy stage values → new canonical keys
        const STAGE_MAP: Record<string, string> = {
          'estimating':       'in_estimating',
          'in_estimating':    'in_estimating',
          'contract':         'close_to_sign',
          'close_to_signing': 'close_to_sign',
          'close_to_sign':    'close_to_sign',
          'pre_construction': 'won',
          'preconstruction':  'won',
          'active_build':     'won',
          'final_passed':     'won',
          'completed_build':  'won',
          'in_punchlist':     'won',
          'warranty':         'won',
          'meeting_booked':   'meeting_booked',
          'design_phase':     'design_phase',
          'new_lead':         'new_lead',
          'won':              'won',
          'lost':             'lost',
        };

        // Demo / ghost leads to delete — DISABLED 2026-05-16 after Tyler asked
        // to recover the deleted leads. Migration now only does the safe stage
        // remap; nothing else gets deleted automatically.
        const GHOST_NAMES: string[] = [];

        const all = await getDocs(collection(db, 'clients'));
        const updateBatch = writeBatch(db);
        const toDelete: { id: string; ref: any }[] = [];
        let mappedCount = 0;

        for (const d of all.docs) {
          const data = d.data() as any;
          const name = (data.name || '').trim();
          if (GHOST_NAMES.some(g => name.toLowerCase() === g.toLowerCase())) {
            toDelete.push({ id: d.id, ref: d.ref });
            continue;
          }
          const stage = (data.stage || '').toString();
          const key = stage.toLowerCase().replace(/\s+/g, '_');
          const mapped = STAGE_MAP[key];
          if (mapped && mapped !== stage) {
            updateBatch.update(d.ref, { stage: mapped });
            mappedCount++;
          }
        }

        // Phase 1: bulk update (allowed for any GC role).
        if (mappedCount > 0) {
          try { await updateBatch.commit(); } catch { /* permission or transient */ }
        }

        // Phase 2: deletes — individually so one permission-denied doesn't
        // block the others. Firestore rules require admin for `clients` delete;
        // for GC users the deletes simply no-op (without breaking the migration).
        let deletedCount = 0;
        for (const d of toDelete) {
          try { await deleteDoc(d.ref); deletedCount++; } catch { /* swallow */ }
        }

        // Only mark migration as done if SOMETHING succeeded, so a partial run
        // (e.g., as GC) can be completed later by an admin.
        if (mappedCount > 0 || deletedCount > 0) {
          await setDoc(flagRef, {
            pipelineV2_migrated: deletedCount === toDelete.length,
            ranAt: serverTimestamp(),
            mappedCount,
            deletedCount,
            pendingDeletes: toDelete.length - deletedCount,
          }, { merge: true });
        }
      } catch (e) {
        // Migration failures are non-fatal — page still renders. Don't toast either,
        // since this runs silently on background load.
        void e;
      }
    })();
  }, []);

  // Load clients
  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() } as Client)));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  // Load team members for "Assigned To"
  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'users'), orderBy('name', 'asc')),
      snap => setTeamMembers(
        snap.docs
          .map(d => ({ id: d.id, name: (d.data() as any).name || '', email: (d.data() as any).email || '' }))
          .filter(m => m.name)
      )
    );
  }, []);

  // All unique tags across clients
  const allTags = [...new Set(clients.flatMap(c => c.tags || []))].sort();

  // Filter + sort
  const applyFilters = (list: Client[]): Client[] => {
    let out = list;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      out = out.filter(c =>
        [c.name, c.email, c.phone, c.company, c.jobAddress, c.city]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    if (filters.budgetMin) out = out.filter(c => (c.budget || 0) >= parseFloat(filters.budgetMin));
    if (filters.budgetMax) out = out.filter(c => (c.budget || 0) <= parseFloat(filters.budgetMax));
    if (filters.assignedTo) out = out.filter(c => c.assignedTo === filters.assignedTo);
    if (filters.stage) out = out.filter(c => c.stage === filters.stage);
    if (filters.priority) out = out.filter(c => (c.priority || 'medium') === filters.priority);
    if (filters.tags.length > 0) out = out.filter(c => filters.tags.every(t => c.tags?.includes(t)));
    out = [...out].sort((a, b) => {
      if (filters.sort === 'oldest') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      if (filters.sort === 'budget_desc') return (b.budget || 0) - (a.budget || 0);
      if (filters.sort === 'budget_asc') return (a.budget || 0) - (b.budget || 0);
      if (filters.sort === 'name_asc') return a.name.localeCompare(b.name);
      if (filters.sort === 'priority') {
        const ra = PRIORITY_RANK[a.priority || 'medium'] ?? 2;
        const rb = PRIORITY_RANK[b.priority || 'medium'] ?? 2;
        if (rb !== ra) return rb - ra;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    });
    return out;
  };

  const filteredClients = applyFilters(clients);

  const activeFilterCount = [
    filters.search, filters.budgetMin, filters.budgetMax,
    filters.assignedTo, filters.stage, ...filters.tags,
  ].filter(Boolean).length + (filters.sort !== 'newest' ? 1 : 0);

  // CRUD
  const handleSave = async (data: Partial<Client>) => {
    const prevStage = editing?.stage;
    const prevLinkedJobId = editing?.linkedJobId;
    if (editing) {
      await updateDoc(doc(db, 'clients', editing.id), { ...data, updatedAt: serverTimestamp() });
      toast({ title: 'Lead updated' });
      // Check if stage changed in the form
      if (prevStage && data.stage && prevStage !== data.stage && !prevLinkedJobId) {
        const updatedClient: Client = { ...editing, ...data } as Client;
        checkProjectCreation(updatedClient, prevStage, data.stage);
      }
    } else {
      // Two writes, one batch: a Sales/CRM client row AND a matching contact row
      // (so the new lead also appears in Contacts as type='client'). The two
      // docs cross-reference each other via salesClientId/contactId.
      const clientRef  = doc(collection(db, 'clients'));
      const contactRef = doc(collection(db, 'contacts'));
      const batch = writeBatch(db);
      batch.set(clientRef, {
        ...data,
        contactId: contactRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(contactRef, {
        name: data.name || '',
        email: data.email || '',
        phone: data.phone || '',
        type: 'client',
        role: 'client',
        company: data.company || '',
        address: data.jobAddress || '',
        city: data.city || '',
        notes: data.notes || '',
        tags: data.tags || [],
        isActive: true,
        salesClientId: clientRef.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      toast({ title: 'Lead added — also linked in Contacts' });
      // New lead created directly into estimating
      if (data.stage && isEstimatingStage(data.stage)) {
        const newClient: Client = { id: clientRef.id, name: data.name || '', stage: data.stage, ...data } as Client;
        checkProjectCreation(newClient, '', data.stage);
      }
    }
    setEditing(null);
  };

  const handleDelete = async (client: Client) => {
    if (!confirm(`Delete "${client.name}"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'clients', client.id));
    toast({ title: 'Lead deleted' });
  };

  const handleAdvance = async (client: Client) => {
    const idx = stages.findIndex(s => s.key === client.stage);
    if (idx < 0 || idx >= stages.length - 1) return;
    const newStage = stages[idx + 1].key;
    await updateDoc(doc(db, 'clients', client.id), { stage: newStage, updatedAt: serverTimestamp() });
    checkProjectCreation(client, client.stage, newStage);
  };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverStage(null);
    const clientId = e.dataTransfer.getData('clientId');
    if (!clientId) return;
    const client = clients.find(c => c.id === clientId);
    if (!client || client.stage === targetStage) return;
    await updateDoc(doc(db, 'clients', clientId), { stage: targetStage, updatedAt: serverTimestamp() });
    checkProjectCreation(client, client.stage, targetStage);
  };

  const handleSaveStages = async (newStages: StageConfig[]) => {
    await setDoc(doc(db, 'settings', 'pipeline'), { stages: newStages });
    setStages(newStages);
  };

  // Pipeline total = only leads that actually appear in a known stage column.
  // Older leads stuck on legacy stage names (e.g. "Pre Construction") used to
  // inflate this number despite not being shown anywhere on the board.
  const _knownStageKeys = new Set(stages.map(s => s.key));
  const totalPipeline = filteredClients
    .filter(c => _knownStageKeys.has(c.stage))
    .reduce((s, c) => s + (c.budget || 0), 0);

  return (
    <AppLayout>
      <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 80px)' }}>

        {/* Top Bar */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales</h1>
            {totalPipeline > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">Pipeline: {fmtFull(totalPipeline)}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Pipeline / List toggle */}
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('pipeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${viewMode === 'pipeline' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">Pipeline</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <List className="w-4 h-4" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>

            {/* Edit Stages */}
            <Button variant="outline" size="sm" onClick={() => setEditStagesOpen(true)} className="gap-1.5">
              <Settings2 className="w-4 h-4" />
              <span className="hidden sm:inline">Edit Stages</span>
            </Button>

            {/* Filter */}
            <Button variant="outline" size="sm" onClick={() => setFilterOpen(f => !f)}
              className={`gap-1.5 relative ${activeFilterCount > 0 ? 'border-[#C9A96E] text-amber-700' : ''}`}>
              <Filter className="w-4 h-4" />
              <span className="hidden sm:inline">Filter</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 text-[10px] font-bold rounded-full flex items-center justify-center"
                  style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
                  {activeFilterCount}
                </span>
              )}
            </Button>

            {/* Import vCard */}
            <VcardImportZone
              defaultStage={stages[0]?.key || 'new_lead'}
              onSinglePrefill={p => {
                setLeadPrefill(p);
                setEditing(null);
                setLeadDialogOpen(true);
              }}
            />

            {/* Add Lead */}
            <Button
              onClick={() => { setEditing(null); setLeadDialogOpen(true); }}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              className="gap-1.5 font-semibold"
            >
              <Plus className="w-4 h-4" />
              Lead
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#C9A96E' }} />
          </div>
        ) : viewMode === 'list' ? (
          /* ── List View ──────────────────────────────────────────── */
          <div className="space-y-2 overflow-y-auto flex-1">
            {filteredClients.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="font-medium">No leads found</p>
                <p className="text-sm mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              filteredClients.map(c => (
                <ListRow key={c.id} client={c} stages={stages}
                  onEdit={() => { setEditing(c); setLeadDialogOpen(true); }}
                  onDelete={() => handleDelete(c)} />
              ))
            )}
          </div>
        ) : (
          /* ── Pipeline View ─────────────────────────────────────── */
          /* Mobile: horizontal scroll with fixed-width columns (otherwise
             cramped). Desktop (md+): equal-width columns sized to fit
             every stage on the page at once — Tyler's preference. */
          <div
            className="flex md:grid gap-2 md:gap-3 overflow-x-auto md:overflow-x-visible flex-1 pb-4"
            style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}
          >
            {stages.map(stage => {
              const stageClients = filteredClients.filter(c => c.stage === stage.key);
              const stageTotal = stageClients.reduce((s, c) => s + (c.budget || 0), 0);
              const isDropTarget = dragOverStage === stage.key;

              return (
                <div
                  key={stage.key}
                  className="flex-shrink-0 w-64 md:w-auto md:min-w-0 flex flex-col"
                  onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key); }}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={e => handleDrop(e, stage.key)}
                >
                  {/* Column Header — label is the headline: full width,
                      two-line wrap, larger font. Lead count + total stack
                      below as secondary info. A color stripe across the
                      top edge keeps columns scannable when many stages
                      are visible. */}
                  <div className={`rounded-t-xl border border-b-0 overflow-hidden transition-colors ${isDropTarget ? 'border-gray-400' : 'border-gray-200'}`}>
                    <div className="h-1" style={{ backgroundColor: stage.color }} />
                    <div className="px-3 py-2" style={{ backgroundColor: isDropTarget ? `${stage.color}10` : '#f9fafb' }}>
                      <p className="text-sm font-bold text-gray-900 leading-snug break-words line-clamp-2" title={stage.label}>
                        {stage.label}
                      </p>
                      <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                        <span className="font-medium">{stageClients.length} {stageClients.length === 1 ? 'lead' : 'leads'}</span>
                        <span className="font-bold" title={`Total: ${fmtFull(stageTotal)}`}>
                          {stageTotal > 0 ? fmtFull(stageTotal) : '$0'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cards */}
                  <div
                    className={`flex-1 border border-gray-200 rounded-b-xl p-2 space-y-2 min-h-32 transition-colors ${isDropTarget ? 'border-gray-400 bg-gray-50' : 'bg-gray-50'}`}
                    style={isDropTarget ? { backgroundColor: `${stage.color}08` } : {}}
                  >
                    {stageClients.map(c => (
                      <PipelineCard
                        key={c.id}
                        client={c}
                        stages={stages}
                        onEdit={() => { setEditing(c); setLeadDialogOpen(true); }}
                        onDelete={() => handleDelete(c)}
                        onAdvance={() => handleAdvance(c)}
                      />
                    ))}
                    {stageClients.length === 0 && (
                      <div className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${isDropTarget ? 'border-gray-400' : 'border-gray-200'}`}>
                        <p className="text-xs text-gray-400">Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <LeadDialog
        open={leadDialogOpen}
        editing={editing}
        stages={stages}
        teamMembers={teamMembers}
        prefill={leadPrefill}
        onClose={() => { setLeadDialogOpen(false); setEditing(null); setLeadPrefill(undefined); }}
        onSave={handleSave}
      />

      <EditStagesModal
        open={editStagesOpen}
        onClose={() => setEditStagesOpen(false)}
        stages={stages}
        onSave={handleSaveStages}
      />

      {/* Filter panel + backdrop */}
      {filterOpen && <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />}
      <FilterPanel
        open={filterOpen}
        filters={filters}
        onFiltersChange={setFilters}
        onClose={() => setFilterOpen(false)}
        stages={stages}
        teamMembers={teamMembers}
        allTags={allTags}
      />

      {/* Project + estimate creation prompt */}
      {pendingProject && (
        <CreateProjectDialog
          client={pendingProject.client}
          mode={pendingProject.mode}
          previousStage={pendingProject.previousStage}
          previousStageLabel={
            pendingProject.previousStage
              ? stageConfig(pendingProject.previousStage, stages).label
              : undefined
          }
          onClose={() => setPendingProject(null)}
          onCreate={() => {
            setPendingProject(null);
          }}
          onRevert={async () => {
            // User changed their mind — revert the stage on the lead doc.
            if (!pendingProject.previousStage) return;
            try {
              await updateDoc(doc(db, 'clients', pendingProject.client.id), {
                stage: pendingProject.previousStage,
                updatedAt: serverTimestamp(),
              });
              toast({
                title: 'Reverted',
                description: `${pendingProject.client.name} moved back to "${stageConfig(pendingProject.previousStage, stages).label}".`,
              });
              setPendingProject(null);
            } catch (e: any) {
              toast({ title: 'Revert failed', description: e.message, variant: 'destructive' });
            }
          }}
        />
      )}
    </AppLayout>
  );
}
