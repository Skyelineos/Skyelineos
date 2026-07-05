import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Zap, ArrowRight } from 'lucide-react';

type TriggerType = 'stage_change' | 'task_overdue' | 'new_lead' | 'estimate_accepted' | 'invoice_overdue';
type ActionType = 'send_notification' | 'create_task' | 'send_email' | 'update_status';

interface Automation {
  id: string;
  name: string;
  trigger: TriggerType;
  action: ActionType;
  conditions?: Record<string, unknown>;
  enabled: boolean;
  runCount: number;
  lastRun?: string | null;
  createdAt?: { toDate: () => Date } | null;
}

const TRIGGER_META: Record<TriggerType, { label: string; description: string }> = {
  stage_change: { label: 'Stage Change', description: 'Fires when a client moves into a new pipeline stage' },
  task_overdue: { label: 'Task Overdue', description: 'Fires when a task passes its due date without completion' },
  new_lead: { label: 'New Lead', description: 'Fires when a new lead is added to the system' },
  estimate_accepted: { label: 'Estimate Accepted', description: 'Fires when a client accepts an estimate' },
  invoice_overdue: { label: 'Invoice Overdue', description: 'Fires when an invoice passes its payment due date' },
};

const ACTION_META: Record<ActionType, { label: string }> = {
  send_notification: { label: 'Send Notification' },
  create_task: { label: 'Create Task' },
  send_email: { label: 'Send Email' },
  update_status: { label: 'Update Status' },
};

const PLACEHOLDER_AUTOMATIONS: Automation[] = [
  { id: '__ph_1', name: 'New Lead Assigned', trigger: 'new_lead', action: 'send_notification', enabled: true, runCount: 0 },
  { id: '__ph_2', name: 'Estimate Accepted', trigger: 'estimate_accepted', action: 'create_task', enabled: true, runCount: 0 },
  { id: '__ph_3', name: 'Invoice Overdue', trigger: 'invoice_overdue', action: 'send_email', enabled: false, runCount: 0 },
];

function isPlaceholder(id: string) { return id.startsWith('__ph_'); }

function TriggerPill({ trigger }: { trigger: TriggerType }) {
  return (
    <Badge className="text-xs bg-blue-50 text-blue-700 border border-blue-200 font-medium">
      {TRIGGER_META[trigger]?.label || trigger}
    </Badge>
  );
}

function ActionPill({ action }: { action: ActionType }) {
  return (
    <Badge className="text-xs bg-green-50 text-green-700 border border-green-200 font-medium">
      {ACTION_META[action]?.label || action}
    </Badge>
  );
}

export default function Automations() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    trigger: 'new_lead' as TriggerType,
    action: 'send_notification' as ActionType,
    enabled: true,
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'automations'), orderBy('createdAt', 'desc')),
      snap => setAutomations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Automation)))
    );
    return () => unsub();
  }, []);

  const displayList: Automation[] = automations.length > 0 ? automations : PLACEHOLDER_AUTOMATIONS;
  const activeCount = displayList.filter(a => a.enabled).length;

  async function handleCreate() {
    if (!form.name) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'automations'), {
        name: form.name,
        trigger: form.trigger,
        action: form.action,
        enabled: form.enabled,
        runCount: 0,
        lastRun: null,
        createdBy: user?.id,
        createdAt: serverTimestamp(),
      });
      toast({ title: 'Automation created' });
      setShowDialog(false);
      setForm({ name: '', trigger: 'new_lead', action: 'send_notification', enabled: true });
    } catch {
      toast({ title: 'Error', description: 'Could not create automation.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(automation: Automation) {
    if (isPlaceholder(automation.id)) {
      toast({ title: 'Demo only', description: 'Create a real automation to enable it.' });
      return;
    }
    try {
      await updateDoc(doc(db, 'automations', automation.id), { enabled: !automation.enabled });
    } catch {
      toast({ title: 'Error updating automation', variant: 'destructive' });
    }
  }

  async function handleDelete(automation: Automation) {
    if (isPlaceholder(automation.id)) {
      toast({ title: 'Demo only', description: 'These are placeholder examples.' });
      return;
    }
    try {
      await deleteDoc(doc(db, 'automations', automation.id));
      toast({ title: 'Automation deleted' });
    } catch {
      toast({ title: 'Error deleting automation', variant: 'destructive' });
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
              <p className="text-sm text-gray-500 mt-0.5">Trigger-based workflow rules</p>
            </div>
            <Badge className="bg-green-100 text-green-700 border border-green-200">
              {activeCount} active
            </Badge>
          </div>
          <Button onClick={() => setShowDialog(true)} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90 gap-2">
            <Plus className="w-4 h-4" /> New Automation
          </Button>
        </div>

        {/* List */}
        <div className="space-y-3">
          {displayList.map(automation => (
            <div
              key={automation.id}
              className={`flex items-center gap-4 rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow ${isPlaceholder(automation.id) ? 'opacity-60' : ''}`}
            >
              {/* Toggle */}
              <Switch
                checked={automation.enabled}
                onCheckedChange={() => handleToggle(automation)}
                className="shrink-0"
              />

              {/* Center: name + rule */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap mb-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-sm font-semibold text-gray-900">{automation.name}</span>
                  {isPlaceholder(automation.id) && (
                    <Badge className="text-xs bg-gray-100 text-gray-500 border border-gray-200 ml-1">Example</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <TriggerPill trigger={automation.trigger} />
                  <ArrowRight className="w-3 h-3 text-gray-400 shrink-0" />
                  <ActionPill action={automation.action} />
                  {automation.runCount > 0 && (
                    <span className="text-xs text-gray-400 ml-1">{automation.runCount} runs</span>
                  )}
                </div>
              </div>

              {/* Right: edit / delete */}
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="px-2 h-8 text-gray-400 hover:text-gray-700">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-2 h-8 text-gray-400 hover:text-red-500"
                  onClick={() => handleDelete(automation)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {automations.length === 0 && (
          <p className="text-center text-xs text-gray-400 pt-1">
            The examples above are placeholders. Create your first real automation using the button above.
          </p>
        )}
      </div>

      {/* New Automation Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Automation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="Automation name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Trigger</Label>
              <Select value={form.trigger} onValueChange={v => setForm(f => ({ ...f, trigger: v as TriggerType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRIGGER_META) as TriggerType[]).map(t => (
                    <SelectItem key={t} value={t}>
                      <div>
                        <div className="font-medium">{TRIGGER_META[t].label}</div>
                        <div className="text-xs text-gray-400">{TRIGGER_META[t].description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.trigger && (
                <p className="text-xs text-gray-500">{TRIGGER_META[form.trigger].description}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v as ActionType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTION_META) as ActionType[]).map(a => (
                    <SelectItem key={a} value={a}>{ACTION_META[a].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.enabled}
                onCheckedChange={v => setForm(f => ({ ...f, enabled: v }))}
              />
              <Label className="cursor-pointer select-none">Enable immediately</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} style={{ backgroundColor: '#C9A96E' }} className="text-white hover:opacity-90">
              {saving ? 'Creating…' : 'Create Automation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
