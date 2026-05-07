import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, doc, onSnapshot,
  serverTimestamp, query, orderBy, where, getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Search, UserPlus, ChevronRight, Pencil } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  clientId?: string;
  clientName?: string;
  designerId?: string;
  designerName?: string;
  stage: ProjectStage;
  address?: string;
  city?: string;
  projectType?: string;
  budget?: number;
  sqFootage?: number;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export type ProjectStage =
  | 'estimating'
  | 'proposal'
  | 'contract'
  | 'pre_construction'
  | 'active'
  | 'completed'
  | 'on_hold';

export const PROJECT_STAGE_CONFIG: Record<ProjectStage, { label: string; color: string; crmStage: string }> = {
  estimating:       { label: 'Estimating',       color: '#f59e0b', crmStage: 'estimate'   },
  proposal:         { label: 'Proposal Sent',     color: '#8b5cf6', crmStage: 'proposal'   },
  contract:         { label: 'Contract Signed',   color: '#10b981', crmStage: 'contract'   },
  pre_construction: { label: 'Pre-Construction',  color: '#3b82f6', crmStage: 'contract'   },
  active:           { label: 'Active Build',      color: '#C9A96E', crmStage: 'active'     },
  completed:        { label: 'Completed',         color: '#22c55e', crmStage: 'completed'  },
  on_hold:          { label: 'On Hold',           color: '#6b7280', crmStage: 'qualified'  },
};

const PROJECT_TYPES = [
  'Custom Home', 'Remodel', 'Addition', 'Spec Build', 'Commercial', 'Other'
];

// ─── Component ────────────────────────────────────────────────────────────────

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
  defaultStage?: ProjectStage;
}

export function CreateProjectModal({ open, onClose, onCreated, defaultStage = 'estimating' }: CreateProjectModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<'details' | 'client' | 'designer'>('details');
  const [saving, setSaving] = useState(false);

  // Project fields
  const [name, setName]             = useState('');
  const [address, setAddress]       = useState('');
  const [city, setCity]             = useState('');
  const [projectType, setProjectType] = useState('Custom Home');
  const [stage, setStage]           = useState<ProjectStage>(defaultStage);
  const [budget, setBudget]         = useState('');
  const [sqFootage, setSqFootage]   = useState('');
  const [notes, setNotes]           = useState('');

  // Client linking
  const [clients, setClients]       = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<any | null>(null);

  // Designer linking
  const [designers, setDesigners]   = useState<any[]>([]);
  const [designerSearch, setDesignerSearch] = useState('');
  const [selectedDesigner, setSelectedDesigner] = useState<any | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('details'); setName(''); setAddress(''); setCity('');
    setProjectType('Custom Home'); setStage(defaultStage); setBudget('');
    setSqFootage(''); setNotes(''); setClientSearch(''); setSelectedClient(null);
    setDesignerSearch(''); setSelectedDesigner(null);
  }, [open, defaultStage]);

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('name'));
    return onSnapshot(q, snap => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // Load designers from users collection (role = 'designer')
  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, 'users'), where('role', '==', 'designer'));
    getDocs(q).then(snap => setDesigners(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [open]);

  const filteredClients = clients.filter(c => {
    const s = clientSearch.toLowerCase();
    return !s || [c.name, c.email, c.city].filter(Boolean).some((v: string) => v.toLowerCase().includes(s));
  });

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const projectData = {
        name: name.trim(),
        clientId: selectedClient?.id ?? null,
        clientName: selectedClient?.name ?? null,
        designerId: selectedDesigner?.id ?? null,
        designerName: selectedDesigner?.name || selectedDesigner?.fullName || null,
        stage,
        address: address.trim() || null,
        city: city.trim() || null,
        projectType,
        budget: budget ? Number(budget) : null,
        sqFootage: sqFootage ? Number(sqFootage) : null,
        notes: notes.trim() || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, 'projects'), projectData);

      // Advance the CRM lead's stage to match
      if (selectedClient?.id) {
        const crmStage = PROJECT_STAGE_CONFIG[stage].crmStage;
        await updateDoc(doc(db, 'clients', selectedClient.id), {
          stage: crmStage,
          linkedJobId: ref.id,
          updatedAt: serverTimestamp(),
        });
      }

      const project: Project = { id: ref.id, ...projectData } as Project;
      toast({ title: 'Project created', description: `${name} added to your jobs.` });
      onCreated(project);
      onClose();
    } catch (e: any) {
      toast({ title: 'Error creating project', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">New Project / Job</DialogTitle>
        </DialogHeader>

        {step === 'details' && (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Smith Custom Home" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select value={stage} onValueChange={v => setStage(v as ProjectStage)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_STAGE_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project Type</Label>
                <Select value={projectType} onValueChange={setProjectType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Address / Lot</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St or Lot 4" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Draper, UT" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Budget ($)</Label>
                <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="1,200,000" />
              </div>
              <div className="space-y-1.5">
                <Label>Sq Footage</Label>
                <Input type="number" value={sqFootage} onChange={e => setSqFootage(e.target.value)} placeholder="3,500" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Additional details..." />
            </div>

            {/* Client selection preview */}
            <div className="border border-gray-200 rounded-xl p-3">
              {selectedClient ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedClient.name}</p>
                    <p className="text-xs text-gray-500">{selectedClient.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setStep('client')}>Change</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500"
                      onClick={() => setSelectedClient(null)}>Remove</Button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full flex items-center gap-3 text-left hover:bg-gray-50 rounded-lg p-1 transition-colors"
                  onClick={() => setStep('client')}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="h-4 w-4 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Link to home owner / lead</p>
                    <p className="text-xs text-gray-400">Advances them through the sales pipeline</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />
                </button>
              )}
            </div>

            {/* Designer selection preview */}
            <div className="border border-gray-200 rounded-xl p-3">
              {selectedDesigner ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedDesigner.fullName || selectedDesigner.name}
                    </p>
                    <p className="text-xs text-gray-500">{selectedDesigner.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs"
                      onClick={() => setStep('designer')}>Change</Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500"
                      onClick={() => setSelectedDesigner(null)}>Remove</Button>
                  </div>
                </div>
              ) : (
                <button
                  className="w-full flex items-center gap-3 text-left hover:bg-gray-50 rounded-lg p-1 transition-colors"
                  onClick={() => setStep('designer')}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Pencil className="h-4 w-4 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Assign a designer</p>
                    <p className="text-xs text-gray-400">Optional — grant them access to the design board</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 ml-auto" />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'client' && (
          <div className="space-y-3 py-2">
            <button onClick={() => setStep('details')} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              ← Back
            </button>
            <p className="text-sm text-gray-600">Select the client or lead this project belongs to. Their pipeline stage will be automatically updated.</p>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search clients and leads..." value={clientSearch}
                onChange={e => setClientSearch(e.target.value)} />
            </div>

            <div className="space-y-1 max-h-72 overflow-y-auto">
              {filteredClients.map(client => (
                <button
                  key={client.id}
                  onClick={() => { setSelectedClient(client); setStep('details'); if (!address && client.jobAddress) setAddress(client.jobAddress); if (!city && client.city) setCity(client.city); if (!name) setName(`${client.name} — ${projectType}`); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-left transition-colors"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: '#C9A96E' }}>
                    {client.name?.split(' ').map((p: string) => p[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{client.name}</p>
                    <p className="text-xs text-gray-500 truncate">{client.email}
                      {client.city ? ` · ${client.city}` : ''}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                    {client.stage}
                  </span>
                </button>
              ))}
              {filteredClients.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No clients found — add them in Sales / CRM first.</p>
              )}
            </div>
          </div>
        )}

        {step === 'designer' && (
          <div className="space-y-3 py-2">
            <button onClick={() => setStep('details')} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              ← Back
            </button>
            <p className="text-sm text-gray-600">Select a designer to assign to this project. They must have registered with the Designer role.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search designers..." value={designerSearch}
                onChange={e => setDesignerSearch(e.target.value)} />
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {designers
                .filter(d => {
                  const s = designerSearch.toLowerCase();
                  const n = (d.fullName || d.name || '').toLowerCase();
                  return !s || n.includes(s) || (d.email || '').toLowerCase().includes(s);
                })
                .map(designer => (
                  <button
                    key={designer.id}
                    onClick={() => { setSelectedDesigner(designer); setStep('details'); }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-left transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                      style={{ backgroundColor: '#C9A96E' }}>
                      {(designer.fullName || designer.name || 'D').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{designer.fullName || designer.name}</p>
                      <p className="text-xs text-gray-500 truncate">{designer.email}</p>
                    </div>
                  </button>
                ))}
              {designers.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No designers found — they need to register with the Designer role first.</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === 'details' && (
            <Button
              onClick={handleCreate}
              disabled={saving || !name.trim()}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            >
              {saving ? 'Creating...' : 'Create Project'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
