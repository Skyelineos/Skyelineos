import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Heart, MessageSquare, Clock, CheckCircle2, Lock } from 'lucide-react';
import { PHASES, type BuildPhase } from '@/data/selectionsTemplate';

interface Props {
  projectId: string;
  clientUserId: string;
  phaseDeadlines?: Partial<Record<BuildPhase, Date>>;
}

interface SelectionDoc {
  id: string;
  category?: string;
  subcategory?: string;
  room?: string;
  item?: string;
  phase?: BuildPhase;
  decisionOwner?: string;
  lifecycle?: string;
  gcApproved?: boolean;
  allowanceAmount?: number | null;
  items?: Array<{
    id: string;
    productName: string;
    vendor: string;
    costPerUnit?: number;
    totalCost?: number;
    imageUrls?: string[];
  }>;
  selectedOptionId?: string;
  clientPreference?: { optionId?: string; note?: string; at: any; by: string };
  notes?: string;
}

/**
 * Client-facing selections view — COLLABORATIVE, NOT APPROVAL.
 *
 * The client doesn't have a final approval button. They:
 *   - See the options the designer has put together
 *   - Mark their preference / leave a note ("I love this one", "Can we see a darker stain?")
 *   - Watch the build progress through phases
 *   - See what's been locked in by the contractor
 *
 * Final cost + design sign-off happens by the contractor after bids land,
 * not here.
 */
export default function ClientSelectionsTimeline({ projectId, clientUserId, phaseDeadlines = {} }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState('active');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const { data: selections = [], isLoading } = useQuery<SelectionDoc[]>({
    queryKey: ['client-selections', projectId],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'projects', projectId, 'selections'));
      return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    },
  });

  const active = useMemo(
    () => selections.filter(s =>
      (s.lifecycle === 'Designer-Curating' || s.lifecycle === 'Client-Reviewing' || s.lifecycle === 'Awaiting-Bids') &&
      (s.items?.length || 0) > 0
    ),
    [selections]
  );
  const upcoming = useMemo(
    () => selections.filter(s => s.lifecycle === 'Not Started' || (s.lifecycle === 'Designer-Curating' && (!s.items || s.items.length === 0))),
    [selections]
  );
  const lockedIn = useMemo(
    () => selections.filter(s => s.gcApproved || ['GC-Approved','Ordered','Received','Installed'].includes(s.lifecycle || '')),
    [selections]
  );

  const preferMutation = useMutation({
    mutationFn: async ({ selectionId, optionId, note }: { selectionId: string; optionId?: string; note?: string }) => {
      const ref = doc(db, 'projects', projectId, 'selections', selectionId);
      await updateDoc(ref, {
        clientPreference: { optionId: optionId || null, note: note || null, at: serverTimestamp(), by: clientUserId },
        // Nudge lifecycle forward if currently curating
        lifecycle: 'Client-Reviewing',
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-selections', projectId] });
      toast({ title: 'Sent to your designer', description: "They'll see your preference and follow up." });
    },
    onError: (e: any) => toast({ title: 'Could not send', description: e?.message, variant: 'destructive' }),
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading your selections…</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Your selections at a glance</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="Active right now" value={active.length} tone={active.length > 0 ? 'attention' : 'neutral'} />
            <Stat label="Coming up" value={upcoming.length} />
            <Stat label="Locked in" value={lockedIn.length} />
            <Stat label="Total selections" value={selections.length} />
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Your designer and contractor put options together; you share your preferences here. The contractor signs off on the final cost and design once vendor bids come in.
          </p>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active">
            Active {active.length > 0 && <Badge className="ml-2">{active.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="upcoming" data-testid="tab-upcoming">Coming up</TabsTrigger>
          <TabsTrigger value="locked" data-testid="tab-locked">Locked in</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-3 mt-4">
          {active.length === 0 ? (
            <EmptyState message="No selections are actively being chosen right now. Your designer will surface options as they're ready." />
          ) : active.map(sel => (
            <CollabCard
              key={sel.id}
              sel={sel}
              deadline={sel.phase ? phaseDeadlines[sel.phase as BuildPhase] : undefined}
              draft={noteDrafts[sel.id] || ''}
              setDraft={(v) => setNoteDrafts(prev => ({ ...prev, [sel.id]: v }))}
              onPrefer={(optionId, note) => preferMutation.mutate({ selectionId: sel.id, optionId, note })}
              pending={preferMutation.isPending}
            />
          ))}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3 mt-4">
          {upcoming.length === 0 ? (
            <EmptyState message="No upcoming decisions. We'll surface them as your build progresses." />
          ) : PHASES.map(phase => {
            const items = upcoming.filter(s => s.phase === phase);
            if (!items.length) return null;
            return (
              <Card key={phase}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> {phase}</span>
                    {phaseDeadlines[phase] && <Badge variant="outline">locks {phaseDeadlines[phase]!.toLocaleDateString()}</Badge>}
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
          })}
        </TabsContent>

        <TabsContent value="locked" className="space-y-3 mt-4">
          {lockedIn.length === 0 ? (
            <EmptyState message="No locked-in selections yet." />
          ) : lockedIn.map(sel => {
            const picked = sel.items?.find(o => o.id === sel.selectedOptionId);
            return (
              <Card key={sel.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Lock className="w-4 h-4 text-green-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{sel.item}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {sel.room} · {sel.category}{picked ? ` · ${picked.productName} (${picked.vendor})` : ''}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">{sel.lifecycle}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: any; tone?: 'neutral' | 'attention' }) {
  const cls = tone === 'attention' ? 'text-amber-600' : '';
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

function CollabCard({
  sel, deadline, draft, setDraft, onPrefer, pending,
}: {
  sel: SelectionDoc;
  deadline?: Date;
  draft: string;
  setDraft: (v: string) => void;
  onPrefer: (optionId?: string, note?: string) => void;
  pending: boolean;
}) {
  const opts = sel.items || [];
  const currentPref = sel.clientPreference?.optionId;
  return (
    <Card data-testid={`collab-${sel.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{sel.item}</span>
          {deadline && (
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" /> ideally locked by {deadline.toLocaleDateString()}
            </Badge>
          )}
        </CardTitle>
        <div className="text-xs text-muted-foreground">{sel.room} · {sel.category}</div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sel.notes && <p className="text-sm text-muted-foreground italic">From your designer: "{sel.notes}"</p>}
        {opts.length === 0 ? (
          <div className="text-sm text-muted-foreground p-3 bg-muted/40 rounded-md">
            Your designer is still putting options together. You'll see them here when ready.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {opts.map(o => {
              const isPicked = o.id === currentPref;
              return (
                <div key={o.id} className={`border rounded-md p-3 flex flex-col gap-2 ${isPicked ? 'ring-2 ring-amber-400 bg-amber-50/40' : ''}`}>
                  {o.imageUrls?.[0] && (
                    <img src={o.imageUrls[0]} alt={o.productName} className="w-full h-32 object-cover rounded" />
                  )}
                  <div className="text-sm font-medium">{o.productName}</div>
                  <div className="text-xs text-muted-foreground">{o.vendor}</div>
                  <Button
                    size="sm"
                    variant={isPicked ? 'default' : 'outline'}
                    onClick={() => onPrefer(o.id, draft || undefined)}
                    disabled={pending}
                    data-testid={`btn-prefer-${o.id}`}
                  >
                    <Heart className={`w-4 h-4 mr-1 ${isPicked ? 'fill-current' : ''}`} />
                    {isPicked ? 'This is my pick' : 'I like this one'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <Textarea
          placeholder="Optional note for your designer (e.g. 'can we see a warmer stain?')"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={2}
        />
        <div className="flex justify-between items-center pt-1">
          {sel.clientPreference?.note && (
            <p className="text-xs text-muted-foreground italic">Your last note: "{sel.clientPreference.note}"</p>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPrefer(currentPref || undefined, draft)}
            disabled={pending || !draft.trim()}
            className="ml-auto"
          >
            <MessageSquare className="w-4 h-4 mr-1" /> Send note
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
