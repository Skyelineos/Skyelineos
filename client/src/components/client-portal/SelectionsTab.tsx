import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, orderBy, query as fsQuery } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_selection:    { label: 'Awaiting Options',    color: 'bg-gray-100 text-gray-600' },
  pending_approval:     { label: 'Ready to Approve',    color: 'bg-amber-100 text-amber-700' },
  pending_change_order: { label: 'Change Order Needed', color: 'bg-orange-100 text-orange-700' },
  approved:             { label: 'Approved',            color: 'bg-green-100 text-green-700' },
  ordered:              { label: 'Ordered',             color: 'bg-blue-100 text-blue-700' },
  installed:            { label: 'Installed',           color: 'bg-purple-100 text-purple-700' },
};

interface SelectionsTabProps {
  projectId: string;
  clientId: string;
}

export default function SelectionsTab({ projectId, clientId }: SelectionsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<{ selectionId: string; option: any; overage: number } | null>(null);

  const { data: selections = [], isLoading } = useQuery({
    queryKey: ['selections', projectId],
    queryFn: async () => {
      const snap = await getDocs(fsQuery(collection(db, 'projects', projectId, 'selections'), orderBy('createdAt', 'asc')));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    },
    enabled: !!projectId,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ selectionId, optionId }: { selectionId: string; optionId: string }) => {
      const res = await fetch(`/api/projects/${projectId}/selections/${selectionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId, approvedBy: clientId }),
      });
      if (!res.ok) throw new Error('Failed to approve');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['selections', projectId] });
      queryClient.invalidateQueries({ queryKey: ['changeOrders', projectId] });
      if (data.changeOrderId) {
        toast({ title: 'Selection approved — change order created', description: 'This selection exceeds the allowance. A change order has been sent for your review.' });
      } else {
        toast({ title: 'Selection approved', description: 'Your choice has been confirmed.' });
      }
      setConfirmApprove(null);
      setExpandedId(null);
    },
    onError: () => toast({ title: 'Error', description: 'Could not approve selection.', variant: 'destructive' }),
  });

  const handleOptionApprove = (selection: any, option: any) => {
    const overage = (option.totalCost || 0) - (selection.allowanceAmount || 0);
    if (overage > 0) {
      setConfirmApprove({ selectionId: selection.id, option, overage });
    } else {
      approveMutation.mutate({ selectionId: selection.id, optionId: option.id });
    }
  };

  const approvedCount = selections.filter(s => ['approved', 'ordered', 'installed'].includes(s.status)).length;
  const totalAllowance = selections.reduce((sum: number, s: any) => sum + (s.allowanceAmount || 0), 0);
  const approvedCost = selections
    .filter((s: any) => s.selectedOptionId)
    .reduce((sum: number, s: any) => {
      const opt = s.options?.find((o: any) => o.id === s.selectedOptionId);
      return sum + (opt?.totalCost || 0);
    }, 0);

  if (isLoading) return <div className="p-6 text-center text-gray-400">Loading selections...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Finish Selections</h2>
          <p className="text-sm text-gray-500 mt-0.5">Review and approve your finish selections. Approve quickly to keep bids accurate.</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Completed</p>
          <p className="text-2xl font-bold text-gray-900">{approvedCount}<span className="text-sm text-gray-400 font-normal">/{selections.length}</span></p>
        </div>
      </div>

      {/* Allowance summary */}
      {totalAllowance > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Total Allowances</span>
              <span className="font-semibold">${totalAllowance.toLocaleString()}</span>
            </div>
            <Progress value={Math.min((approvedCost / totalAllowance) * 100, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>${approvedCost.toLocaleString()} selected</span>
              <span>{approvedCost > totalAllowance
                ? `$${(approvedCost - totalAllowance).toLocaleString()} over budget`
                : `$${(totalAllowance - approvedCost).toLocaleString()} remaining`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {selections.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No selections yet</p>
          <p className="text-sm mt-1">Your designer will post finish options here for your review.</p>
        </div>
      )}

      {/* Selection Categories */}
      {selections.map((sel: any) => {
        const isExpanded = expandedId === sel.id;
        const statusCfg = STATUS_CONFIG[sel.status] || STATUS_CONFIG.pending_selection;
        const selectedOption = sel.options?.find((o: any) => o.id === sel.selectedOptionId);
        const isPending = sel.status === 'pending_approval';

        return (
          <Card key={sel.id} className={isPending ? 'border-amber-200 shadow-sm' : ''}>
            <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : sel.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="text-base">{sel.category}</CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Allowance: ${(sel.allowanceAmount || 0).toLocaleString()}
                      {sel.allowanceUnit && sel.allowanceUnit !== 'lump_sum' ? ` ${sel.allowanceUnit}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3">
                {sel.notes && <p className="text-sm text-gray-600 italic border-l-2 border-amber-300 pl-3">{sel.notes}</p>}

                {(!sel.options || sel.options.length === 0) && (
                  <p className="text-sm text-gray-400 text-center py-4">Your designer hasn't posted options yet.</p>
                )}

                {sel.options?.map((option: any) => {
                  const isSelected = option.id === sel.selectedOptionId;
                  const overage = (option.totalCost || 0) - (sel.allowanceAmount || 0);

                  return (
                    <div key={option.id} className={`rounded-xl border p-4 transition-all ${
                      isSelected ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-amber-200'
                    }`}>
                      <div className="flex gap-4">
                        {option.imageUrl && (
                          <img src={option.imageUrl} alt={option.name} className="w-20 h-20 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                        )}
                        {!option.imageUrl && (
                          <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="h-6 w-6 text-gray-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-gray-900">{option.name}</p>
                              {option.vendor && <p className="text-xs text-gray-500">{option.vendor}{option.sku ? ` · SKU: ${option.sku}` : ''}</p>}
                              {option.description && <p className="text-sm text-gray-600 mt-1">{option.description}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-bold text-gray-900">${(option.totalCost || 0).toLocaleString()}</p>
                              {option.costPerUnit && (
                                <p className="text-xs text-gray-400">${option.costPerUnit}/{option.unit || 'unit'}</p>
                              )}
                              {overage > 0 && (
                                <p className="text-xs text-orange-600 font-medium mt-0.5">+${overage.toLocaleString()} over allowance</p>
                              )}
                              {overage <= 0 && option.totalCost > 0 && (
                                <p className="text-xs text-green-600 font-medium mt-0.5">Within allowance</p>
                              )}
                            </div>
                          </div>

                          {option.aiRenderUrl && (
                            <div className="mt-2">
                              <img src={option.aiRenderUrl} alt="AI Rendering" className="rounded-lg w-full max-h-48 object-cover" />
                              <p className="text-xs text-gray-400 mt-1">AI rendering</p>
                            </div>
                          )}

                          {isSelected ? (
                            <div className="flex items-center gap-1 mt-2 text-green-600 text-sm font-medium">
                              <CheckCircle2 className="h-4 w-4" /> Your approved selection
                            </div>
                          ) : (
                            sel.status === 'pending_approval' && (
                              <Button size="sm" className="mt-2" onClick={() => handleOptionApprove(sel, option)}
                                style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
                                {overage > 0 ? `Approve (+$${overage.toLocaleString()} change order)` : 'Approve This Selection'}
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Overage Confirm Dialog */}
      <Dialog open={!!confirmApprove} onOpenChange={() => setConfirmApprove(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Selection Exceeds Allowance
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-gray-600">
            <p>The selection <strong>{confirmApprove?.option?.name}</strong> costs <strong>${(confirmApprove?.option?.totalCost || 0).toLocaleString()}</strong>, which is <strong className="text-orange-600">${(confirmApprove?.overage || 0).toLocaleString()} over</strong> your allowance.</p>
            <p>Approving will automatically create a <strong>Change Order</strong> for the overage amount that will be added to your contract total.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApprove(null)}>Cancel</Button>
            <Button
              onClick={() => confirmApprove && approveMutation.mutate({ selectionId: confirmApprove.selectionId, optionId: confirmApprove.option.id })}
              disabled={approveMutation.isPending}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            >
              Approve + Create Change Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
