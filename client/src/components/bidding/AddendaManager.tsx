// GC-side manager for SSOT Addenda (deviations from the base plans).
// Create → run the Approval Quorum (client + gc, + designer if assigned) →
// publish to affected subs. See docs/single-source-of-truth-design.md §5/§6a.
//
// Approvals are recorded here by staff for now; dedicated client/designer
// approval surfaces land in later phases. Publishing is gated on quorumMet().

import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Plus, CheckCircle2, Send } from 'lucide-react';
import {
  createAddendum, listAddenda, addApproval, publishIfApproved, quorumMet, requiredRoles,
} from '@/lib/ssot/addenda';
import type { Addendum, ApprovalRole } from '@/lib/ssot/types';

interface Props {
  projectId: string;
  /** True if a designer is assigned — then designer sign-off is part of the quorum. */
  designerAssigned?: boolean;
}

export function AddendaManager({ projectId, designerAssigned = false }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [addenda, setAddenda] = useState<Addendum[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // New-addendum form
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [affects, setAffects] = useState<Set<string>>(new Set());
  const [pricingImpact, setPricingImpact] = useState(true);
  const [notifyNow, setNotifyNow] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setAddenda(await listAddenda(projectId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'trades'), orderBy('name')));
        setTrades(snap.docs.map(d => (d.data() as any).name).filter(Boolean));
      } catch { /* trade list is optional */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const toggleTrade = (t: string) => {
    setAffects(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const submitNew = async () => {
    if (!title.trim() || !description.trim() || affects.size === 0) {
      toast({ title: 'Add a title, description, and at least one affected trade', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      await createAddendum({
        projectId,
        title,
        description,
        affectsTrades: Array.from(affects),
        pricingImpact,
        notifyNow,
        createdByUid: (user as any)?.firebaseUid || user?.id?.toString(),
        createdByName: user?.name || 'GC',
      });
      toast({ title: `Addendum created (draft)` });
      setTitle(''); setDescription(''); setAffects(new Set()); setPricingImpact(true); setNotifyNow(false);
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not create addendum', description: e?.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const recordApproval = async (a: Addendum, role: ApprovalRole) => {
    try {
      await addApproval(projectId, a.id, {
        role,
        uid: (user as any)?.firebaseUid || user?.id?.toString() || 'staff',
        name: user?.name || role,
      });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Could not record approval', description: e?.message, variant: 'destructive' });
    }
  };

  const publish = async (a: Addendum) => {
    const ok = await publishIfApproved(projectId, a.id, designerAssigned);
    if (!ok) {
      toast({
        title: 'Not yet approved by everyone',
        description: `Needs: ${requiredRoles(designerAssigned).join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: `Addendum ${a.number} published to affected subs` });
    await refresh();
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C9A96E]" />
              Plan Deviations (Addenda)
            </CardTitle>
            <CardDescription>
              Record any change from the base plans. Published addenda appear on affected subs’
              bids, who must confirm their bid covers them.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(o => !o)}>
            <Plus className="w-3.5 h-3.5" /> New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {open && (
          <div className="border rounded-lg p-3 bg-gray-50/60 space-y-3">
            <div>
              <Label className="text-xs">Title <span className="text-red-500">*</span></Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Primary bath — tile changed to large-format" />
            </div>
            <div>
              <Label className="text-xs">What changed <span className="text-red-500">*</span></Label>
              <Textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Describe the deviation from the plans so an affected sub can re-price." />
            </div>
            <div>
              <Label className="text-xs">Affected trades <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {trades.length === 0 && <span className="text-xs text-gray-400">No trades found.</span>}
                {trades.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTrade(t)}
                    className={`text-xs px-2 py-1 rounded border ${affects.has(t) ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-gray-200 text-gray-600'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={pricingImpact} onChange={e => setPricingImpact(e.target.checked)} />
                Affects pricing
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={notifyNow} onChange={e => setNotifyNow(e.target.checked)} />
                Notify affected awarded subs now (skip batching)
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={submitNew} disabled={creating} className="text-white" style={{ backgroundColor: '#C9A96E' }}>
                {creating ? 'Creating…' : 'Create draft'}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : addenda.length === 0 ? (
          <p className="text-sm text-gray-400">No addenda yet. The plans are the single source of truth as-is.</p>
        ) : (
          <div className="space-y-2">
            {addenda.map(a => {
              const haveRoles = new Set((a.approvals ?? []).map(x => x.role));
              const needed = requiredRoles(designerAssigned);
              const ready = quorumMet(a, designerAssigned);
              return (
                <div key={a.id} className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">Addendum {a.number}</Badge>
                    <span className="font-medium text-sm">{a.title}</span>
                    {a.pricingImpact && <Badge className="bg-amber-100 text-amber-800 text-[10px]">Pricing</Badge>}
                    <Badge className={`text-[10px] ${a.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {a.status}
                    </Badge>
                    {a.affectsTrades.map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                  </div>
                  {a.description && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{a.description}</p>}

                  {a.status !== 'published' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-gray-500">Approvals:</span>
                      {needed.map(role => (
                        <Button
                          key={role}
                          size="sm"
                          variant={haveRoles.has(role) ? 'secondary' : 'outline'}
                          className="h-7 text-[11px] gap-1"
                          onClick={() => recordApproval(a, role)}
                          disabled={haveRoles.has(role)}
                        >
                          {haveRoles.has(role) && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                          {role}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1 text-white ml-auto"
                        style={{ backgroundColor: ready ? '#C9A96E' : '#cbd5e1' }}
                        onClick={() => publish(a)}
                        disabled={!ready}
                      >
                        <Send className="w-3 h-3" /> Publish
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
