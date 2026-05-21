import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Clock, AlertCircle, MessageSquare, Lock } from 'lucide-react';
import { PHASES, PHASE_ORDER, type BuildPhase } from '@/data/selectionsTemplate';

interface Props {
  projectId: string;
  clientUserId: string;
  /** Optional planned dates for each phase to surface what's coming up next */
  phaseDeadlines?: Partial<Record<BuildPhase, Date>>;
}

interface SelectionDoc {
  id: string;
  category: string;
  subcategory?: string;
  room: string;
  item: string;
  phase: BuildPhase;
  decisionOwner: string;
  status: string;
  clientApprovalStatus?: string;
  allowanceAmount?: number | null;
  actualCost?: number | null;
  items?: Array<{
    id: string;
    productName: string;
    vendor: string;
    costPerUnit?: number;
    totalCost?: number;
    imageUrls?: string[];
    status: string;
  }>;
  notes?: string;
}

/**
 * Client-facing selections view.
 *
 * Surfaces only what the client needs to act on, organized by phase,
 * with running pricing transparency.
 *
 * Three tabs:
 *  - "Needs your approval" — designer has presented options, awaiting client
 *  - "Coming up" — items in upcoming phases the client should think about
 *  - "All locked in" — historical log of approved selections + final pricing
 */
export default function ClientSelectionsTimeline({ projectId, clientUserId, phaseDeadlines = {} }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState('approve');

  const { data: selections = [], isLoading } = useQuery<SelectionDoc[]>({
    queryKey: ['client-selections', projectId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'projects', projectId, 'selections'));
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    },
  });

  // Only items the client owns OR has been asked to approve
  const clientFacing = useMemo(
    () => selections.filter(s => s.decisionOwner === 'Client' || s.clientApprovalStatus === 'Checking w/ Client'),
    [selections]
  );

  const needsApproval = clientFacing.filter(s => s.clientApprovalStatus === 'Checking w/ Client');
  const comingUp = clientFacing.filter(s => s.status === 'Not Started' || s.clientApprovalStatus === 'Pending Options');
  const lockedIn = clientFacing.filter(s => s.clientApprovalStatus === 'Approved');

  const approveMutation = useMutation({
    mutationFn: async ({ selectionId, optionId }: { selectionId: string; optionId?: string }) => {
      const ref = doc(db, 'projects', projectId, 'selections', selectionId);
      const update: any = {
        clientApprovalStatus: 'Approved',
        status: 'Selected',
        clientApprovedAt: serverTimestamp(),
        clientApprovedBy: clientUserId,
        updatedAt: serverTimestamp(),
      };
      if (optionId) update.selectedOptionId = optionId;
      await updateDoc(ref, update);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-selections', projectId] });
      toast({ title: 'Approved', description: 'Your designer has been notified.' });
    },
    onError: (e: any) => toast({ title: 'Could not approve', description: e.message, variant: 'destructive' }),
  });

  const totalAllowance = lockedIn.reduce((s, x) => s + (x.allowanceAmount || 0), 0);
  const totalActual = lockedIn.reduce((s, x) => s + (x.actualCost || 0), 0);
  const overUnder = totalActual - totalAllowance;

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading your selections…</div>;

  return (
    <div className="space-y-4">
      {/* Running budget summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your selections at a glance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="Need your approval" value={needsApproval.length} tone={needsApproval.length > 0 ? 'attention' : 'neutral'} />
            <Stat label="Coming up" value={comingUp.length} />
            <Stat label="Locked in" value={lockedIn.length} />
            <Stat
              label="Budget vs. allowance"
              value={overUnder === 0 ? 'On budget' : (overUnder > 0 ? `+$${overUnder.toLocaleString()}` : `-$${Math.abs(overUnder).toLocaleString()}`)}
              tone={overUnder > 0 ? 'over' : 'good'}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="approve" data-testid="tab-approve">
            Needs your approval {needsApproval.length > 0 && <Badge className="ml-2" variant="destructive">{needsApproval.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="coming" data-testid="tab-coming">Coming up</TabsTrigger>
          <TabsTrigger value="locked" data-testid="tab-locked">Locked in</TabsTrigger>
        </TabsList>

        <TabsContent value="approve" className="space-y-3 mt-4">
          {needsApproval.length === 0 ? (
            <EmptyState message="Nothing to approve right now. Your designer will reach out when there's a decision to make." />
          ) : (
            needsApproval.map(sel => (
              <ApprovalCard
                key={sel.id}
                sel={sel}
                deadline={phaseDeadlines[sel.phase]}
                onApprove={(optionId) => approveMutation.mutate({ selectionId: sel.id, optionId })}
                pending={approveMutation.isPending}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="coming" className="space-y-3 mt-4">
          {comingUp.length === 0 ? (
            <EmptyState message="No upcoming decisions. We'll surface them as your build progresses." />
          ) : (
            PHASES.map(phase => {
              const items = comingUp.filter(s => s.phase === phase);
              if (!items.length) return null;
              return (
                <Card key={phase}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Clock className="w-4 h-4" /> {phase}
                      </span>
                      {phaseDeadlines[phase] && (
                        <Badge variant="outline">locks {phaseDeadlines[phase]!.toLocaleDateString()}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1">
                      {items.slice(0, 12).map(s => (
                        <li key={s.id} className="flex items-start gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span><strong>{s.item}</strong> <span className="text-muted-foreground">({s.room})</span></span>
                        </li>
                      ))}
                      {items.length > 12 && <li className="text-muted-foreground">+ {items.length - 12} more</li>}
                    </ul>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="locked" className="space-y-3 mt-4">
          {lockedIn.length === 0 ? (
            <EmptyState message="No locked-in selections yet." />
          ) : (
            lockedIn.map(sel => (
              <Card key={sel.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 text-green-600" />
                    <div>
                      <div className="font-medium text-sm">{sel.item}</div>
                      <div className="text-xs text-muted-foreground">{sel.room} · {sel.category}</div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {sel.allowanceAmount != null && (
                      <div>Allowance ${sel.allowanceAmount.toLocaleString()}</div>
                    )}
                    {sel.actualCost != null && (
                      <div className={sel.actualCost > (sel.allowanceAmount || 0) ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        Actual ${sel.actualCost.toLocaleString()}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: any; tone?: 'neutral' | 'attention' | 'over' | 'good' }) {
  const cls =
    tone === 'attention' ? 'text-amber-600' :
    tone === 'over' ? 'text-destructive' :
    tone === 'good' ? 'text-green-600' : '';
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-center text-sm text-muted-foreground">{message}</CardContent>
    </Card>
  );
}

function ApprovalCard({
  sel, deadline, onApprove, pending,
}: {
  sel: SelectionDoc;
  deadline?: Date;
  onApprove: (optionId?: string) => void;
  pending: boolean;
}) {
  const opts = sel.items || [];
  return (
    <Card data-testid={`approve-${sel.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{sel.item}</span>
          {deadline && (
            <Badge variant="outline" className="gap-1">
              <AlertCircle className="w-3 h-3" /> needs decision by {deadline.toLocaleDateString()}
            </Badge>
          )}
        </CardTitle>
        <div className="text-xs text-muted-foreground">{sel.room} · {sel.category}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sel.notes && <p className="text-sm text-muted-foreground italic">"{sel.notes}"</p>}
        {opts.length === 0 ? (
          <div className="text-sm text-muted-foreground p-3 bg-muted/40 rounded-md">
            Your designer is still putting together options. We'll notify you when they're ready.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {opts.map(o => (
              <div key={o.id} className="border rounded-md p-3 flex flex-col gap-2">
                {o.imageUrls?.[0] && (
                  <img src={o.imageUrls[0]} alt={o.productName} className="w-full h-32 object-cover rounded" />
                )}
                <div className="text-sm font-medium">{o.productName}</div>
                <div className="text-xs text-muted-foreground">{o.vendor}</div>
                <div className="text-sm">
                  {priceLabel(sel, o)}
                </div>
                <Button size="sm" onClick={() => onApprove(o.id)} disabled={pending} data-testid={`btn-pick-${o.id}`}>
                  <CheckCircle2 className="w-4 h-4 mr-1" /> Pick this one
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm">
            <MessageSquare className="w-4 h-4 mr-1" /> Ask a question
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function priceLabel(sel: SelectionDoc, opt: SelectionDoc['items'][number]) {
  const allowance = sel.allowanceAmount ?? 0;
  const total = opt.totalCost ?? opt.costPerUnit ?? 0;
  if (!allowance || !total) return total ? <span className="text-muted-foreground">${total.toLocaleString()}</span> : null;
  const delta = total - allowance;
  if (delta === 0) return <span className="text-green-700 font-medium">Included in allowance</span>;
  if (delta > 0) return <span className="text-amber-700 font-medium">Upgrade +${delta.toLocaleString()}</span>;
  return <span className="text-green-700 font-medium">Credit -${Math.abs(delta).toLocaleString()}</span>;
}
