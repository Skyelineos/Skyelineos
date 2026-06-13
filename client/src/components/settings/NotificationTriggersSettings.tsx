// Admin config UI for the customizable notification engine.
//
// Per trigger × audience (Clients / Subs / Designers / PMs / Team), edit a flow:
// an ordered list of steps with per-step delay, channel toggles
// (in-app/email/SMS/push), message templates (email subject/body, SMS body),
// and an optional condition. Saves to settings/notificationRules (read by the
// backend fireTrigger engine). Includes a live "send test" through the real
// pipeline. SMS still always honors an individual's STOP/opt-out.

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Bell, Plus, Trash2, Save, Send, Clock, Mail, MessageSquare, Smartphone, Inbox } from 'lucide-react';

type Channel = 'inApp' | 'email' | 'sms' | 'push';
interface FlowCondition { type: 'always' | 'equals' | 'notEquals' | 'exists' | 'notExists'; field?: string; value?: string; }
interface FlowStep {
  id: string;
  delayMinutes: number;
  channels: Record<Channel, boolean>;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  inAppTitle?: string;
  inAppBody?: string;
  condition?: FlowCondition;
  forceSms?: boolean;
}
interface Flow { enabled: boolean; steps: FlowStep[]; }
interface TriggerVariable { name: string; description: string; }
interface TriggerDef { key: string; label: string; description: string; audiences: string[]; variables: TriggerVariable[]; critical?: boolean; }
type FlowsMap = Record<string, Record<string, Flow>>;

const AUDIENCE_LABEL: Record<string, string> = {
  client: 'Clients', sub: 'Subs', designer: 'Designers', pm: 'PMs', team: 'Team',
};
const CHANNEL_META: { key: Channel; label: string; Icon: any }[] = [
  { key: 'inApp', label: 'In-app', Icon: Inbox },
  { key: 'email', label: 'Email', Icon: Mail },
  { key: 'sms', label: 'Text', Icon: MessageSquare },
  { key: 'push', label: 'Push', Icon: Smartphone },
];

async function authedFetch(path: string, init?: RequestInit) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

function newStep(): FlowStep {
  return {
    id: `step${Date.now()}`,
    delayMinutes: 0,
    channels: { inApp: true, email: true, sms: false, push: true },
    emailSubject: '',
    emailBody: '',
    smsBody: '',
    condition: { type: 'always' },
  };
}

export function NotificationTriggersSettings() {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState<{ triggers: TriggerDef[]; audiences: string[]; defaults: FlowsMap } | null>(null);
  const [flows, setFlows] = useState<FlowsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedTrigger, setSelectedTrigger] = useState<string>('');
  const [selectedAudience, setSelectedAudience] = useState<string>('');
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  // Load the code-owned catalog (and seed defaults if the rules doc is empty).
  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch('/api/notifications/catalog');
        if (!res.ok) throw new Error(`Catalog ${res.status}`);
        const data = await res.json();
        setCatalog(data);
        if (data.triggers?.[0]) {
          setSelectedTrigger(data.triggers[0].key);
          setSelectedAudience(data.triggers[0].audiences[0]);
        }
        // Seed defaults server-side so the rules doc exists for editing.
        await authedFetch('/api/notifications/rules/init', { method: 'POST', body: '{}' });
      } catch (e: any) {
        toast({ title: 'Could not load trigger catalog', description: e?.message || '', variant: 'destructive' });
      }
    })();
  }, [toast]);

  // Live-subscribe to the saved rules. Don't clobber unsaved local edits.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'notificationRules'), (snap) => {
      const data = snap.data() as any;
      if (data?.flows && !dirtyRef.current) setFlows(data.flows);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const currentTrigger = useMemo(
    () => catalog?.triggers.find(t => t.key === selectedTrigger),
    [catalog, selectedTrigger],
  );

  // Effective flow being edited (saved → default fallback).
  const flow: Flow | null = useMemo(() => {
    if (!selectedTrigger || !selectedAudience) return null;
    return flows[selectedTrigger]?.[selectedAudience]
      || catalog?.defaults?.[selectedTrigger]?.[selectedAudience]
      || { enabled: true, steps: [newStep()] };
  }, [flows, catalog, selectedTrigger, selectedAudience]);

  function mutateFlow(updater: (f: Flow) => Flow) {
    setFlows(prev => {
      const base = prev[selectedTrigger]?.[selectedAudience]
        || catalog?.defaults?.[selectedTrigger]?.[selectedAudience]
        || { enabled: true, steps: [newStep()] };
      const next = updater(JSON.parse(JSON.stringify(base)));
      return {
        ...prev,
        [selectedTrigger]: { ...(prev[selectedTrigger] || {}), [selectedAudience]: next },
      };
    });
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'notificationRules'), {
        flows,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || null,
      }, { merge: true });
      setDirty(false);
      toast({ title: 'Notification rules saved' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    try {
      const res = await authedFetch('/api/notifications/test', {
        method: 'POST',
        body: JSON.stringify({ triggerKey: selectedTrigger, audience: selectedAudience }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || `Test ${res.status}`);
      toast({ title: 'Test sent', description: 'Sent to your account via the channels configured below (respecting your own prefs + opt-out).' });
    } catch (e: any) {
      toast({ title: 'Test failed', description: e?.message || '', variant: 'destructive' });
    }
  }

  if (loading || !catalog) {
    return <Card className="bg-gray-50"><CardContent className="py-10 text-center text-gray-500">Loading notification triggers…</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center"><Bell className="mr-2 h-5 w-5" /> Notification Triggers</CardTitle>
          <CardDescription>
            For each event and audience, choose which channels fire (in-app, email, text, push) and customize the message.
            Add delayed or conditional follow-up steps to build a full flow. Texts always honor an individual's STOP/opt-out.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
          {/* Trigger list */}
          <div className="space-y-1">
            {catalog.triggers.map(t => (
              <button
                key={t.key}
                onClick={() => { setSelectedTrigger(t.key); setSelectedAudience(t.audiences[0]); }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${selectedTrigger === t.key ? 'bg-[#141414] text-white' : 'hover:bg-gray-200 text-gray-800'}`}
              >
                {t.label}
                {t.critical && <span className="ml-1 text-[10px] opacity-70">• critical</span>}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="space-y-4">
            {currentTrigger && flow && (
              <>
                <div>
                  <p className="text-sm text-gray-600">{currentTrigger.description}</p>
                  {/* Audience selector */}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {currentTrigger.audiences.map(aud => (
                      <button
                        key={aud}
                        onClick={() => setSelectedAudience(aud)}
                        className={`px-3 py-1 rounded-full text-xs border ${selectedAudience === aud ? 'bg-[#C9A96E] border-[#C9A96E] text-[#141414] font-semibold' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                      >
                        {AUDIENCE_LABEL[aud] || aud}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Variables */}
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Variables:</span>{' '}
                  {currentTrigger.variables.map(v => (
                    <code key={v.name} title={v.description} className="mx-0.5 px-1 py-0.5 bg-gray-200 rounded">{`{${v.name}}`}</code>
                  ))}
                </div>

                {/* Enabled toggle */}
                <div className="flex items-center justify-between border rounded-lg p-3 bg-white">
                  <div>
                    <Label className="font-medium">Enable for {AUDIENCE_LABEL[selectedAudience] || selectedAudience}</Label>
                    <p className="text-xs text-gray-500">Master switch for this event + audience.</p>
                  </div>
                  <Switch checked={flow.enabled} onCheckedChange={(v) => mutateFlow(f => ({ ...f, enabled: v }))} />
                </div>

                {/* Steps */}
                {flow.steps.map((step, idx) => (
                  <div key={step.id} className="border rounded-lg p-3 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Step {idx + 1}{idx === 0 ? '' : ' (follow-up)'}</span>
                      {flow.steps.length > 1 && (
                        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => mutateFlow(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    {/* Delay */}
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <Label className="text-xs">Send after</Label>
                      <Input type="number" min={0} className="w-24 h-8"
                        value={step.delayMinutes}
                        onChange={(e) => mutateFlow(f => { f.steps[idx].delayMinutes = Math.max(0, Number(e.target.value) || 0); return f; })} />
                      <span className="text-xs text-gray-500">minutes ({step.delayMinutes === 0 ? 'immediately' : `${step.delayMinutes} min later`})</span>
                    </div>

                    {/* Channels */}
                    <div className="flex flex-wrap gap-2">
                      {CHANNEL_META.map(({ key, label, Icon }) => (
                        <button key={key}
                          onClick={() => mutateFlow(f => { f.steps[idx].channels[key] = !f.steps[idx].channels[key]; return f; })}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border ${step.channels[key] ? 'bg-[#141414] text-white border-[#141414]' : 'border-gray-300 text-gray-500'}`}>
                          <Icon className="h-3.5 w-3.5" /> {label}
                        </button>
                      ))}
                    </div>

                    {/* Email template */}
                    {step.channels.email && (
                      <div className="space-y-1">
                        <Label className="text-xs">Email subject</Label>
                        <Input className="h-8" value={step.emailSubject}
                          onChange={(e) => mutateFlow(f => { f.steps[idx].emailSubject = e.target.value; return f; })} />
                        <Label className="text-xs">Email body</Label>
                        <Textarea rows={3} value={step.emailBody}
                          onChange={(e) => mutateFlow(f => { f.steps[idx].emailBody = e.target.value; return f; })} />
                      </div>
                    )}

                    {/* SMS template */}
                    {step.channels.sms && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Text message</Label>
                          <label className="flex items-center gap-1 text-[11px] text-gray-500">
                            <input type="checkbox" checked={!!step.forceSms}
                              onChange={(e) => mutateFlow(f => { f.steps[idx].forceSms = e.target.checked; return f; })} />
                            Force (ignore SMS opt-in pref; STOP still honored)
                          </label>
                        </div>
                        <Textarea rows={2} value={step.smsBody}
                          onChange={(e) => mutateFlow(f => { f.steps[idx].smsBody = e.target.value; return f; })} />
                      </div>
                    )}

                    {/* In-app template */}
                    {step.channels.inApp && (
                      <div className="space-y-1">
                        <Label className="text-xs">In-app title</Label>
                        <Input className="h-8" value={step.inAppTitle || ''} placeholder="(defaults to email subject)"
                          onChange={(e) => mutateFlow(f => { f.steps[idx].inAppTitle = e.target.value; return f; })} />
                      </div>
                    )}

                    {/* Condition */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
                      <Label className="text-xs text-gray-500">Only if</Label>
                      <Select value={step.condition?.type || 'always'}
                        onValueChange={(v) => mutateFlow(f => { f.steps[idx].condition = { ...(f.steps[idx].condition || {}), type: v as any }; return f; })}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="always">Always send</SelectItem>
                          <SelectItem value="exists">Field is set</SelectItem>
                          <SelectItem value="notExists">Field is empty</SelectItem>
                          <SelectItem value="equals">Field equals</SelectItem>
                          <SelectItem value="notEquals">Field ≠</SelectItem>
                        </SelectContent>
                      </Select>
                      {step.condition && step.condition.type !== 'always' && (
                        <>
                          <Input className="h-8 w-28" placeholder="variable" value={step.condition.field || ''}
                            onChange={(e) => mutateFlow(f => { f.steps[idx].condition!.field = e.target.value; return f; })} />
                          {(step.condition.type === 'equals' || step.condition.type === 'notEquals') && (
                            <Input className="h-8 w-28" placeholder="value" value={step.condition.value || ''}
                              onChange={(e) => mutateFlow(f => { f.steps[idx].condition!.value = e.target.value; return f; })} />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}

                <Button variant="outline" size="sm" onClick={() => mutateFlow(f => ({ ...f, steps: [...f.steps, newStep()] }))}>
                  <Plus className="h-4 w-4 mr-1" /> Add follow-up step
                </Button>

                <Separator />
                <div className="flex items-center gap-2">
                  <Button onClick={handleSave} disabled={saving || !dirty} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
                    <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                  </Button>
                  <Button variant="outline" onClick={handleTest}>
                    <Send className="h-4 w-4 mr-1" /> Send test to me
                  </Button>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
