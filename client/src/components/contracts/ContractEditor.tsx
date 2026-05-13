import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft, Save, Plus, Trash2, AlertTriangle, Upload, FileText,
} from 'lucide-react';
import { collection, getDocs, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updateContract } from '@/lib/contracts/firestore';
import {
  type Contract, type ContractStatus, type ContractType,
  type AllowanceItem, type DrawMilestone, type ContractChangeOrder,
  type ContractParty, type BudgetMode, type BidLineItem,
  CONTRACT_TYPE_LABEL, CONTRACT_STATUS_LABEL,
  contractTotal, contractPaid, contractOutstanding, lineItemsTotal,
} from '@/lib/contracts/types';
import { useAuth } from '@/hooks/use-auth';

function fmt(n: number) {
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function newId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function todayIso() { return new Date().toISOString().slice(0, 10); }

interface ProjectLite { id: string; name: string; clientId?: string; clientName?: string; }
interface ContactLite { id: string; name: string; email?: string; phone?: string; company?: string; role?: string; linkedUserId?: string; }

interface EditorProps {
  contract?: Contract;                 // edit existing
  newContractType?: ContractType;      // create new of this type
  onBack?: () => void;
  onCancel?: () => void;
  onSave?: (data: Omit<Contract, 'id' | 'createdAt'>) => Promise<void>;
}

// Default draw schedule templates per contract type. Tyler can tune these
// per-contract; they're starting points only.
function defaultDrawSchedule(type: ContractType): DrawMilestone[] {
  if (type === 'client_build') {
    return [
      { id: newId(), label: 'Deposit at signing',     pctOfContract: 5,  status: 'upcoming' },
      { id: newId(), label: 'Foundation complete',    pctOfContract: 15, status: 'upcoming' },
      { id: newId(), label: 'Framing complete',       pctOfContract: 20, status: 'upcoming' },
      { id: newId(), label: 'Mechanical rough-in',    pctOfContract: 15, status: 'upcoming' },
      { id: newId(), label: 'Drywall complete',       pctOfContract: 15, status: 'upcoming' },
      { id: newId(), label: 'Cabinets & tile',        pctOfContract: 15, status: 'upcoming' },
      { id: newId(), label: 'Substantial completion', pctOfContract: 10, status: 'upcoming' },
      { id: newId(), label: 'Final / punch-list',     pctOfContract: 5,  status: 'upcoming' },
    ];
  }
  if (type === 'subcontractor') {
    return [
      { id: newId(), label: 'Mobilization',     pctOfContract: 10, status: 'upcoming' },
      { id: newId(), label: 'Rough-in',         pctOfContract: 50, status: 'upcoming' },
      { id: newId(), label: 'Final completion', pctOfContract: 40, status: 'upcoming' },
    ];
  }
  if (type === 'designer') {
    return [
      { id: newId(), label: 'Retainer',                pctOfContract: 25, status: 'upcoming' },
      { id: newId(), label: 'Design schemes approved', pctOfContract: 50, status: 'upcoming' },
      { id: newId(), label: 'Final selections',        pctOfContract: 25, status: 'upcoming' },
    ];
  }
  return [];
}

function defaultAllowances(type: ContractType): AllowanceItem[] {
  if (type !== 'client_build') return [];
  return [
    { id: newId(), category: 'Appliances',     description: 'Kitchen + laundry package', amount: 25000, resolved: false },
    { id: newId(), category: 'Lighting',       description: 'Interior + exterior fixtures', amount: 12000, resolved: false },
    { id: newId(), category: 'Plumbing fixtures', description: 'Faucets, sinks, toilets, tubs', amount: 18000, resolved: false },
    { id: newId(), category: 'Flooring',       description: 'Hardwood/tile/carpet', amount: 35000, resolved: false },
    { id: newId(), category: 'Cabinets',       description: 'Kitchen + bath casework', amount: 60000, resolved: false },
    { id: newId(), category: 'Countertops',    description: 'Quartz/granite/etc.', amount: 18000, resolved: false },
  ];
}

// Default bid line items for a Client Build Agreement, modeled after the
// Skyeline draw sheet categories. Amounts default to 0 — Tyler fills in
// per project (they scale by square footage and design specs). Names
// match the trades used in bid packages so the data lines up cleanly.
function defaultLineItems(type: ContractType): BidLineItem[] {
  if (type !== 'client_build') return [];
  const cats = [
    'Plans / Survey', 'Engineering', 'Building Permit', 'Lot Staking',
    'Temp Water & Power', 'Prep / Security', 'Excavation', 'Lateral Utilities',
    'Concrete: Footings / Foundation', 'Concrete: Flatwork', 'Foundation Damp-Proofing',
    'Window Wells', 'Framing', 'Roofing', 'Windows & Exterior Doors',
    'Front Door', 'Concrete: Self Leveling', 'Garage Doors',
    'Plumbing Rough', 'HVAC', 'Electrical Rough', 'Gas Lines',
    'Insulation', 'Fireplace Install', 'Stone', 'Stucco / Board & Batten',
    'Gutter / Soffit', 'Sheet Rock', 'Tile', 'Engineered Hardwood',
    'Carpet', 'Interior Doors / Finish Trim — Material',
    'Interior Doors / Finish Trim — Labor', 'Cabinets', 'Counter Tops',
    'Appliances', 'Plumbing Final', 'Electrical Final', 'Paint',
    'Final Cleaning', 'Driveways / Walkways / Patios', 'Landscaping',
    'Master Closet Organizers', 'Smart Home Installation', 'Exterior Railing',
  ];
  return cats.map(category => ({ id: newId(), category, amount: 0 }));
}

export function ContractEditor({ contract, newContractType, onBack, onCancel, onSave }: EditorProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const initial: Contract = useMemo(() => {
    if (contract) return contract;
    const t = newContractType || 'client_build';
    return {
      id: '',
      type: t,
      status: 'draft' as ContractStatus,
      projectId: '',
      projectName: '',
      gc: {
        contactId: undefined,
        userId: undefined,
        name: 'Skyeline Homes',
        company: 'Skyeline Homes',
        email: 'bids@skyelinehomes.com',
        role: 'gc',
      },
      other: {
        name: '',
        role: t === 'client_build' ? 'client' : t === 'subcontractor' ? 'subcontractor' : t === 'designer' ? 'designer' : 'employee',
      },
      budgetMode: 'soft' as BudgetMode,
      contractAmount: 0,
      lineItems: defaultLineItems(t),
      allowances: defaultAllowances(t),
      drawSchedule: defaultDrawSchedule(t),
      changeOrders: [],
      createdAt: new Date().toISOString(),
      createdBy: user?.firebaseUid || user?.email || 'unknown',
    } as Contract;
  }, [contract, newContractType, user]);

  const [state, setState] = useState<Contract>(initial);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  // Load projects + contacts for the picker
  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, 'projects'), orderBy('createdAt', 'desc')), snap => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    const unsubC = onSnapshot(collection(db, 'contacts'), snap => {
      setContacts(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
    return () => { unsubP(); unsubC(); };
  }, []);

  const isNew = !state.id;
  const update = (patch: Partial<Contract>) => setState(s => ({ ...s, ...patch }));

  const linkedProject = state.projectId ? projects.find(p => p.id === state.projectId) : null;

  // Filter contacts to the relevant role for the "other party" picker
  const partyChoices = useMemo(() => {
    if (state.type === 'client_build') return contacts.filter(c => (c.role || '').toLowerCase() === 'client' || (c.role || '').toLowerCase() === 'homeowner');
    if (state.type === 'subcontractor') return contacts.filter(c => ['subcontractor', 'sub', 'vendor'].includes((c.role || '').toLowerCase()));
    if (state.type === 'designer') return contacts.filter(c => (c.role || '').toLowerCase() === 'designer');
    if (state.type === 'employee') return contacts.filter(c => ['employee', 'team'].includes((c.role || '').toLowerCase()));
    return contacts;
  }, [contacts, state.type]);

  const onPickParty = (contactId: string) => {
    const c = contacts.find(x => x.id === contactId);
    if (!c) return;
    const party: ContractParty = {
      contactId: c.id,
      userId: c.linkedUserId,
      name: c.name,
      email: c.email,
      company: c.company,
      role: state.other.role,
    };
    update({ other: party });
  };

  const onPickProject = (projectId: string) => {
    const p = projects.find(x => x.id === projectId);
    update({
      projectId,
      projectName: p?.name || '',
    });
  };

  const totalAllowanceBudget = useMemo(() => state.allowances.reduce((s, a) => s + (a.amount || 0), 0), [state.allowances]);
  const allowancesResolved = state.allowances.filter(a => a.resolved).length;
  const allowancesPending = state.allowances.length - allowancesResolved;
  const drawSum = state.drawSchedule.reduce((s, d) => s + (d.pctOfContract || 0), 0);

  const addAllowance = () => update({
    allowances: [...state.allowances, { id: newId(), category: '', description: '', amount: 0, resolved: false }],
  });
  const updateAllowance = (id: string, patch: Partial<AllowanceItem>) => update({
    allowances: state.allowances.map(a => a.id === id ? { ...a, ...patch } : a),
  });
  const removeAllowance = (id: string) => update({
    allowances: state.allowances.filter(a => a.id !== id),
  });

  const addLineItem = () => update({
    lineItems: [...(state.lineItems || []), { id: newId(), category: '', amount: 0 } as BidLineItem],
  });
  const updateLineItem = (id: string, patch: Partial<BidLineItem>) => update({
    lineItems: (state.lineItems || []).map(l => l.id === id ? { ...l, ...patch } : l),
  });
  const removeLineItem = (id: string) => update({
    lineItems: (state.lineItems || []).filter(l => l.id !== id),
  });
  const lineItemsSum = lineItemsTotal(state);

  const addMilestone = () => update({
    drawSchedule: [...state.drawSchedule, { id: newId(), label: 'New milestone', pctOfContract: 0, status: 'upcoming' }],
  });
  const updateMilestone = (id: string, patch: Partial<DrawMilestone>) => update({
    drawSchedule: state.drawSchedule.map(m => m.id === id ? { ...m, ...patch } : m),
  });
  const removeMilestone = (id: string) => update({
    drawSchedule: state.drawSchedule.filter(m => m.id !== id),
  });

  const addChangeOrder = () => {
    const number = (state.changeOrders || []).length + 1;
    update({
      changeOrders: [...(state.changeOrders || []), {
        id: newId(), number, description: '', amount: 0, status: 'pending',
      } as ContractChangeOrder],
    });
  };
  const updateChangeOrder = (id: string, patch: Partial<ContractChangeOrder>) => update({
    changeOrders: state.changeOrders.map(co => co.id === id ? { ...co, ...patch } : co),
  });
  const removeChangeOrder = (id: string) => update({
    changeOrders: state.changeOrders.filter(co => co.id !== id),
  });

  const uploadSignedDoc = async (file: File) => {
    setUploadPct(0);
    try {
      const path = `contracts/${state.id || 'draft-' + Date.now()}/${file.name}`;
      const ref = storageRef(storage, path);
      const task = uploadBytesResumable(ref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          snap => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          err => reject(err),
          () => resolve(),
        );
      });
      const url = await getDownloadURL(task.snapshot.ref);
      update({ signedDocumentUrl: url, documentName: file.name });
      toast({ title: 'Document uploaded', description: file.name });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || 'Unknown', variant: 'destructive' });
    } finally {
      setUploadPct(null);
    }
  };

  const handleSave = async () => {
    if (!state.other.name) {
      toast({ title: 'Party required', description: 'Pick the contact this contract is with.', variant: 'destructive' });
      return;
    }
    if (state.type !== 'employee' && !state.projectId) {
      toast({ title: 'Project required', description: 'Pick the project this contract is on.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      if (isNew && onSave) {
        const { id, createdAt, ...rest } = state as any;
        await onSave(rest);
      } else {
        const { id, createdAt, createdBy, ...rest } = state as any;
        await updateContract(state.id, rest);
        toast({ title: 'Contract saved' });
        onBack?.();
      }
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Unknown', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={() => (isNew ? onCancel?.() : onBack?.())}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ChevronLeft className="w-4 h-4" />
          Contracts
        </button>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {CONTRACT_TYPE_LABEL[state.type]}
          </Badge>
          {state.budgetMode === 'soft' && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Soft budget
            </Badge>
          )}
          <Button onClick={handleSave} disabled={busy} className="gap-1.5">
            <Save className="w-4 h-4" />
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Header / basics */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={state.status} onValueChange={(v) => update({ status: v as ContractStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['draft','sent','signed','active','completed','closed','cancelled'] as ContractStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{CONTRACT_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget mode</Label>
              <Select value={state.budgetMode} onValueChange={(v) => update({ budgetMode: v as BudgetMode })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="soft">Soft — selections still pending</SelectItem>
                  <SelectItem value="finalized">Finalized — all selections + sub estimates locked</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Stays soft until design selections reach 100% AND all subs have updated estimates.
              </p>
            </div>
          </div>

          {state.type !== 'employee' && (
            <div>
              <Label>Project</Label>
              <Select value={state.projectId || ''} onValueChange={onPickProject}>
                <SelectTrigger><SelectValue placeholder="Pick a project…" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {linkedProject?.clientName && (
                <p className="text-xs text-gray-500 mt-1">Client on project: {linkedProject.clientName}</p>
              )}
            </div>
          )}

          <div>
            <Label>{state.type === 'employee' ? 'Employee' : state.other.role === 'client' ? 'Client' : state.other.role === 'subcontractor' ? 'Subcontractor' : 'Designer'}</Label>
            <Select value={state.other.contactId || ''} onValueChange={onPickParty}>
              <SelectTrigger><SelectValue placeholder="Pick a contact…" /></SelectTrigger>
              <SelectContent>
                {partyChoices.length === 0 ? (
                  <SelectItem value="_none" disabled>No matching contacts</SelectItem>
                ) : (
                  partyChoices.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}{c.company && c.company !== c.name ? ` — ${c.company}` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {state.other.email && <p className="text-xs text-gray-500 mt-1">{state.other.email}</p>}
          </div>

          {state.type === 'subcontractor' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Trade</Label>
                <Input value={state.trade || ''} onChange={e => update({ trade: e.target.value })} placeholder="Electrical, Framing, etc." />
              </div>
              <div>
                <Label>Retainage %</Label>
                <Input
                  type="number" min={0} max={100} step="0.5"
                  value={state.retainagePct ?? 10}
                  onChange={e => update({ retainagePct: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Scope</Label>
                <Textarea
                  rows={3}
                  value={state.scope || ''}
                  onChange={e => update({ scope: e.target.value })}
                  placeholder="Describe what's included / excluded."
                />
              </div>
            </div>
          )}

          {state.type === 'designer' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Fee model</Label>
                <Select value={state.designerFeeModel || 'fixed'} onValueChange={(v) => update({ designerFeeModel: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="fixed">Fixed fee</SelectItem>
                    <SelectItem value="pct_of_construction">% of construction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hourly rate</Label>
                <Input
                  type="number" min={0}
                  value={state.designerHourlyRate ?? 0}
                  onChange={e => update({ designerHourlyRate: parseFloat(e.target.value) || 0 })}
                  disabled={state.designerFeeModel !== 'hourly'}
                />
              </div>
              <div>
                <Label>% of construction</Label>
                <Input
                  type="number" min={0} max={100} step="0.5"
                  value={state.designerPctOfConstruction ?? 0}
                  onChange={e => update({ designerPctOfConstruction: parseFloat(e.target.value) || 0 })}
                  disabled={state.designerFeeModel !== 'pct_of_construction'}
                />
              </div>
            </div>
          )}

          {state.type === 'employee' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Title</Label>
                <Input value={state.employmentTitle || ''} onChange={e => update({ employmentTitle: e.target.value })} />
              </div>
              <div>
                <Label>Start date</Label>
                <Input type="date" value={state.employmentStartDate || todayIso()} onChange={e => update({ employmentStartDate: e.target.value })} />
              </div>
              <div>
                <Label>Compensation</Label>
                <Input value={state.employmentComp || ''} onChange={e => update({ employmentComp: e.target.value })} placeholder="$X/yr + $Y allowance" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Contract amount</Label>
              <Input
                type="number" min={0} step="100"
                value={state.contractAmount}
                onChange={e => update({ contractAmount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Effective date</Label>
              <Input type="date" value={state.effectiveDate || ''} onChange={e => update({ effectiveDate: e.target.value })} />
            </div>
            <div>
              <Label>Signed date</Label>
              <Input type="date" value={state.signedAt || ''} onChange={e => update({ signedAt: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bid breakdown — the line items that built up the contract total.
          Visible to the client in their portal so they understand exactly
          how the price was assembled. */}
      {state.type === 'client_build' && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold">Bid breakdown (line items)</h3>
                <p className="text-xs text-gray-500">
                  Every trade / category that built the contract total. Shown to the client.{' '}
                  <span className="font-medium">{(state.lineItems || []).length} lines · </span>
                  <span>Sum: {fmt(lineItemsSum)}</span>
                  {state.contractAmount > 0 && lineItemsSum !== state.contractAmount && (
                    <span className="ml-2 text-amber-700">
                      <AlertTriangle className="inline w-3 h-3 mr-0.5" />
                      doesn't match Contract amount ({fmt(state.contractAmount)})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => update({ contractAmount: lineItemsSum })}
                  disabled={lineItemsSum === 0 || lineItemsSum === state.contractAmount} className="text-xs">
                  Set contract = sum
                </Button>
                <Button size="sm" variant="outline" onClick={addLineItem} className="gap-1">
                  <Plus className="w-3.5 h-3.5" />Add line
                </Button>
              </div>
            </div>
            <div className="divide-y divide-gray-100 border border-gray-200 rounded">
              {(state.lineItems || []).length === 0 && <div className="p-3 text-xs text-gray-400 text-center">No line items yet.</div>}
              {(state.lineItems || []).map((l, i) => (
                <div key={l.id} className="grid grid-cols-12 gap-2 p-2 items-center">
                  <span className="col-span-1 text-xs text-gray-400 tabular-nums text-right">{i + 1}.</span>
                  <Input className="col-span-3 h-8" value={l.category} onChange={e => updateLineItem(l.id, { category: e.target.value })} placeholder="Category / trade" />
                  <Input className="col-span-4 h-8" value={l.description || ''} onChange={e => updateLineItem(l.id, { description: e.target.value })} placeholder="Description (optional)" />
                  <Input className="col-span-3 h-8 text-right tabular-nums" type="number" min={0} step="100"
                    value={l.amount} onChange={e => updateLineItem(l.id, { amount: parseFloat(e.target.value) || 0 })} />
                  <Button size="sm" variant="ghost" className="col-span-1 h-7 text-red-500" onClick={() => removeLineItem(l.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Allowances (client build only) */}
      {state.type === 'client_build' && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Allowance items</h3>
                <p className="text-xs text-gray-500">
                  Selection buckets that stay soft until the client picks specifics. {' '}
                  <span className="font-medium">{allowancesResolved} of {state.allowances.length} resolved · </span>
                  <span>Total budget: {fmt(totalAllowanceBudget)}</span>
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={addAllowance} className="gap-1">
                <Plus className="w-3.5 h-3.5" />Add
              </Button>
            </div>
            <div className="divide-y divide-gray-100 border border-gray-200 rounded">
              {state.allowances.length === 0 && <div className="p-3 text-xs text-gray-400 text-center">No allowances yet.</div>}
              {state.allowances.map((a, i) => (
                <div key={a.id} className="grid grid-cols-12 gap-2 p-2 items-center">
                  <span className="col-span-1 text-xs text-gray-400 tabular-nums text-right">{i + 1}.</span>
                  <Input className="col-span-2 h-8" value={a.category} onChange={e => updateAllowance(a.id, { category: e.target.value })} placeholder="Category" />
                  <Input className="col-span-3 h-8" value={a.description} onChange={e => updateAllowance(a.id, { description: e.target.value })} placeholder="Description" />
                  <Input className="col-span-2 h-8 text-right tabular-nums" type="number" min={0} step="100"
                    value={a.amount} onChange={e => updateAllowance(a.id, { amount: parseFloat(e.target.value) || 0 })} />
                  <Input className="col-span-2 h-8 text-xs" type="date" value={a.dueDate || ''}
                    onChange={e => updateAllowance(a.id, { dueDate: e.target.value })}
                    title="Selection deadline (shown on client portal)" />
                  <div className="col-span-1 flex items-center gap-1">
                    <input
                      type="checkbox" checked={a.resolved}
                      onChange={e => updateAllowance(a.id, { resolved: e.target.checked, resolvedAt: e.target.checked ? todayIso() : undefined })}
                    />
                    <span className="text-[10px] text-gray-500">Done</span>
                  </div>
                  <Button size="sm" variant="ghost" className="col-span-1 h-7 text-red-500" onClick={() => removeAllowance(a.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            {allowancesPending > 0 && (
              <p className="text-xs text-amber-700">
                <AlertTriangle className="inline w-3 h-3 mr-0.5" />
                {allowancesPending} allowance{allowancesPending === 1 ? '' : 's'} still pending — budget stays soft until resolved.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Draw schedule */}
      {state.type !== 'employee' && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Draw / payment schedule</h3>
                <p className="text-xs text-gray-500">
                  Milestones that trigger invoicing. Percentages should add to 100%.{' '}
                  <span className={drawSum === 100 ? 'text-green-600 font-medium' : 'text-amber-700 font-medium'}>
                    Currently: {drawSum.toFixed(1)}%
                  </span>
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={addMilestone} className="gap-1">
                <Plus className="w-3.5 h-3.5" />Add
              </Button>
            </div>
            <div className="divide-y divide-gray-100 border border-gray-200 rounded">
              {state.drawSchedule.map((m, i) => {
                const computedAmount = m.pctOfContract != null
                  ? (contractTotal(state) * m.pctOfContract) / 100
                  : (m.amount || 0);
                return (
                  <div key={m.id} className="grid grid-cols-12 gap-2 p-2 items-center">
                    <span className="col-span-1 text-xs text-gray-400 tabular-nums text-right">{i + 1}.</span>
                    <Input className="col-span-4 h-8" value={m.label} onChange={e => updateMilestone(m.id, { label: e.target.value })} placeholder="Milestone name" />
                    <Input className="col-span-1 h-8 text-right tabular-nums" type="number" min={0} max={100} step="0.5"
                      value={m.pctOfContract ?? ''} onChange={e => updateMilestone(m.id, { pctOfContract: parseFloat(e.target.value) || 0 })}
                      placeholder="%" />
                    <span className="col-span-2 text-xs text-gray-500 tabular-nums">{fmt(computedAmount)}</span>
                    <Select value={m.status} onValueChange={(v) => updateMilestone(m.id, { status: v as any })}>
                      <SelectTrigger className="col-span-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upcoming">Upcoming</SelectItem>
                        <SelectItem value="ready_to_invoice">Ready to invoice</SelectItem>
                        <SelectItem value="invoiced">Invoiced</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input className="col-span-1 h-8 text-xs" type="date" value={m.dueDate || ''} onChange={e => updateMilestone(m.id, { dueDate: e.target.value })} />
                    <Button size="sm" variant="ghost" className="col-span-1 h-7 text-red-500" onClick={() => removeMilestone(m.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Change orders */}
      {state.type === 'client_build' && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Change orders</h3>
                <p className="text-xs text-gray-500">Approved COs adjust the total contract value.</p>
              </div>
              <Button size="sm" variant="outline" onClick={addChangeOrder} className="gap-1">
                <Plus className="w-3.5 h-3.5" />Add CO
              </Button>
            </div>
            <div className="divide-y divide-gray-100 border border-gray-200 rounded">
              {(state.changeOrders || []).length === 0 && <div className="p-3 text-xs text-gray-400 text-center">No change orders yet.</div>}
              {(state.changeOrders || []).map(co => (
                <div key={co.id} className="grid grid-cols-12 gap-2 p-2 items-center">
                  <span className="col-span-1 text-xs font-semibold text-gray-500">CO #{co.number}</span>
                  <Input className="col-span-5 h-8" value={co.description} onChange={e => updateChangeOrder(co.id, { description: e.target.value })} placeholder="Description" />
                  <Input className="col-span-2 h-8 text-right tabular-nums" type="number" step="100"
                    value={co.amount} onChange={e => updateChangeOrder(co.id, { amount: parseFloat(e.target.value) || 0 })} />
                  <Select value={co.status} onValueChange={(v) => updateChangeOrder(co.id, { status: v as any })}>
                    <SelectTrigger className="col-span-3 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="voided">Voided</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="col-span-1 h-7 text-red-500" onClick={() => removeChangeOrder(co.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Signed document */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">Signed document</h3>
          {state.signedDocumentUrl ? (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4 text-gray-500" />
              <a href={state.signedDocumentUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {state.documentName || 'Open signed contract'}
              </a>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => update({ signedDocumentUrl: undefined, documentName: undefined })}>
                Replace
              </Button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-md p-6 cursor-pointer hover:border-gray-300">
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500">
                {uploadPct != null ? `Uploading… ${uploadPct}%` : 'Upload signed PDF'}
              </span>
              <input type="file" className="hidden" accept="application/pdf,image/*" onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadSignedDoc(f);
              }} />
            </label>
          )}
        </CardContent>
      </Card>

      {/* Summary footer */}
      <Card>
        <CardContent className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Tile label="Base contract" value={fmt(state.contractAmount)} />
          <Tile label="CO total" value={fmt(contractTotal(state) - state.contractAmount)} />
          <Tile label="Paid to date" value={fmt(contractPaid(state))} />
          <Tile label="Outstanding" value={fmt(contractOutstanding(state))} accent />
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ? 'text-gray-900' : 'text-gray-700'}`}>{value}</div>
    </div>
  );
}
