import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, orderBy, query as fsQuery } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, CheckCircle2, XCircle, Clock, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:  { label: 'Awaiting Approval', color: 'bg-amber-100 text-amber-700',  icon: Clock },
  approved: { label: 'Approved',          color: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
  declined: { label: 'Declined',          color: 'bg-red-100 text-red-700',      icon: XCircle },
  void:     { label: 'Void',              color: 'bg-gray-100 text-gray-500',    icon: XCircle },
};

interface ChangeOrdersTabProps {
  projectId: string;
  clientId: string;
  projectBudget?: number;
}

export default function ChangeOrdersTab({ projectId, clientId, projectBudget = 0 }: ChangeOrdersTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [declineNote, setDeclineNote] = useState('');
  const [activeDecline, setActiveDecline] = useState<string | null>(null);

  const { data: changeOrders = [], isLoading } = useQuery({
    queryKey: ['changeOrders', projectId],
    queryFn: async () => {
      const snap = await getDocs(fsQuery(collection(db, 'projects', projectId, 'changeOrders'), orderBy('createdAt', 'desc')));
      return snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null })) as any[];
    },
    enabled: !!projectId,
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ coId, decision }: { coId: string; decision: 'approved' | 'declined' }) => {
      const res = await fetch(`/api/projects/${projectId}/change-orders/${coId}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, decidedBy: clientId, note: declineNote }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (_, { decision }) => {
      queryClient.invalidateQueries({ queryKey: ['changeOrders', projectId] });
      queryClient.invalidateQueries({ queryKey: ['selections', projectId] });
      toast({ title: decision === 'approved' ? 'Change order approved' : 'Change order declined' });
      setActiveDecline(null);
      setDeclineNote('');
    },
    onError: () => toast({ title: 'Error', description: 'Could not process your decision.', variant: 'destructive' }),
  });

  const pending = changeOrders.filter((c: any) => c.status === 'pending');
  const resolved = changeOrders.filter((c: any) => c.status !== 'pending');
  const approvedTotal = changeOrders
    .filter((c: any) => c.status === 'approved')
    .reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
  const pendingTotal = pending.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);

  if (isLoading) return <div className="p-6 text-center text-gray-400">Loading change orders...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Change Orders</h2>
        <p className="text-sm text-gray-500 mt-0.5">Review and approve proposed changes to your project scope or cost.</p>
      </div>

      {/* Budget Impact Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Original Contract</p>
            <p className="text-lg font-bold text-gray-900">${projectBudget.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-green-500" />
              <p className="text-xs text-gray-500">Approved Changes</p>
            </div>
            <p className={`text-lg font-bold ${approvedTotal > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
              {approvedTotal > 0 ? `+$${approvedTotal.toLocaleString()}` : '$0'}
            </p>
          </CardContent>
        </Card>
        <Card style={{ borderColor: '#C9A96E55' }}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Current Total</p>
            <p className="text-lg font-bold" style={{ color: '#92713A' }}>
              ${(projectBudget + approvedTotal).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Actions */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="font-semibold text-gray-800">Pending Your Decision ({pending.length})</h3>
            {pendingTotal > 0 && <span className="text-sm text-orange-600 font-medium">+${pendingTotal.toLocaleString()} if approved</span>}
          </div>
          {pending.map((co: any) => (
            <Card key={co.id} className="border-amber-200">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{co.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{co.description}</p>
                    {co.sourceSelectionId && (
                      <p className="text-xs text-amber-600 mt-1">Auto-generated from selections overage</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xl font-bold ${co.amount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {co.amount > 0 ? `+$${co.amount.toLocaleString()}` : `-$${Math.abs(co.amount).toLocaleString()}`}
                    </p>
                    <p className="text-xs text-gray-400">to contract</p>
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => decisionMutation.mutate({ coId: co.id, decision: 'approved' })}
                    disabled={decisionMutation.isPending}
                    style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setActiveDecline(co.id)}
                    disabled={decisionMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" /> Decline
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* History */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-gray-700 text-sm">History</h3>
          {resolved.map((co: any) => {
            const cfg = STATUS_CONFIG[co.status] || STATUS_CONFIG.void;
            const Icon = cfg.icon;
            return (
              <div key={co.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200">
                <div className="flex items-start gap-3">
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${co.status === 'approved' ? 'text-green-500' : 'text-red-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{co.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{co.createdAt ? new Date(co.createdAt).toLocaleDateString() : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-sm font-semibold ${co.status === 'approved' ? 'text-orange-600' : 'text-gray-400 line-through'}`}>
                    {co.amount > 0 ? `+$${co.amount.toLocaleString()}` : `-$${Math.abs(co.amount || 0).toLocaleString()}`}
                  </span>
                  <Badge className={cfg.color}>{cfg.label}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {changeOrders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No change orders yet</p>
          <p className="text-sm mt-1">Any scope or cost changes will appear here for your review.</p>
        </div>
      )}

      {/* Decline Dialog */}
      <Dialog open={!!activeDecline} onOpenChange={() => { setActiveDecline(null); setDeclineNote(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decline Change Order</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-gray-600">You can add a note explaining why you're declining (optional).</p>
            <Textarea value={declineNote} onChange={e => setDeclineNote(e.target.value)} placeholder="Optional note for the team..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActiveDecline(null); setDeclineNote(''); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => activeDecline && decisionMutation.mutate({ coId: activeDecline, decision: 'declined' })} disabled={decisionMutation.isPending}>
              Decline Change Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
