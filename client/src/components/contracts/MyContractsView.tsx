import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileSignature, AlertTriangle, FileText, Calendar, DollarSign, GitPullRequest, Check, X } from 'lucide-react';
import { listenContractsForOtherUid } from '@/lib/contracts/firestore';
import {
  type Contract,
  CONTRACT_TYPE_LABEL, CONTRACT_STATUS_LABEL,
  contractTotal, contractPaid, contractOutstanding,
} from '@/lib/contracts/types';
import { ChangeOrderRequestModal } from './ChangeOrderRequestModal';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';

function fmt(n: number) {
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// Read-only view of every contract the current portal user is a party to.
// Used by ClientPortal, SubcontractorPortal, DesignerPortal — same component,
// scoped by Firebase Auth uid.
export function MyContractsView({ userId, audience }: {
  userId: string;
  audience: 'client' | 'sub' | 'designer';
}) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [coRequestTarget, setCoRequestTarget] = useState<Contract | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!userId) return;
    return listenContractsForOtherUid(userId, setContracts);
  }, [userId]);

  // Client-side approve/decline of pending COs that Tyler has forwarded.
  const approveCo = async (c: Contract, coId: string) => {
    const updated = (c.changeOrders || []).map(co =>
      co.id === coId
        ? { ...co, status: 'approved' as const, approvedAt: new Date().toISOString(), approvedBy: user?.name || user?.email || 'client' }
        : co);
    try {
      await updateDoc(doc(db, 'contracts', c.id), { changeOrders: updated, updatedAt: serverTimestamp() } as any);
      toast({ title: 'Change order approved' });
    } catch (e: any) {
      toast({ title: 'Approve failed', description: e?.message || 'Unknown', variant: 'destructive' });
    }
  };
  const declineCo = async (c: Contract, coId: string) => {
    const reason = prompt('Reason for decline (optional)?') || '';
    const updated = (c.changeOrders || []).map(co =>
      co.id === coId
        ? { ...co, status: 'rejected' as const, rejectedAt: new Date().toISOString(), rejectedBy: user?.name || user?.email || 'client', rejectionReason: reason }
        : co);
    try {
      await updateDoc(doc(db, 'contracts', c.id), { changeOrders: updated, updatedAt: serverTimestamp() } as any);
      toast({ title: 'Change order declined' });
    } catch (e: any) {
      toast({ title: 'Decline failed', description: e?.message || 'Unknown', variant: 'destructive' });
    }
  };

  if (contracts.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-gray-400">
          <FileSignature className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No contracts on file yet</p>
          <p className="text-sm mt-1">
            When {audience === 'client' ? 'Tyler' : 'Skyeline Homes'} drafts your contract, it will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {contracts.map(c => (
        <Card key={c.id}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-gray-900">{CONTRACT_TYPE_LABEL[c.type]}</h3>
                  <Badge variant="outline" className="text-xs">{CONTRACT_STATUS_LABEL[c.status]}</Badge>
                  {c.budgetMode === 'soft' && (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Soft budget
                    </Badge>
                  )}
                </div>
                {c.projectName && (
                  <p className="text-sm text-gray-500 mt-1">Project: {c.projectName}</p>
                )}
                {c.trade && <p className="text-xs text-gray-400">Trade: {c.trade}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Sub-side: submit a price change against this contract */}
                {audience === 'sub' && c.type === 'subcontractor' && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setCoRequestTarget(c)}
                    className="gap-1.5"
                  >
                    <GitPullRequest className="w-3.5 h-3.5" />
                    Request price change
                  </Button>
                )}
                {c.signedDocumentUrl && (
                  <a
                    href={c.signedDocumentUrl} target="_blank" rel="noreferrer"
                    className="text-xs inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    View signed document
                  </a>
                )}
              </div>
            </div>

            {/* Money summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat icon={<DollarSign className="w-3.5 h-3.5" />} label="Total" value={fmt(contractTotal(c))} />
              <Stat icon={<DollarSign className="w-3.5 h-3.5" />} label="Paid" value={fmt(contractPaid(c))} />
              <Stat icon={<DollarSign className="w-3.5 h-3.5" />} label="Outstanding" value={fmt(contractOutstanding(c))} accent />
              <Stat icon={<Calendar className="w-3.5 h-3.5" />} label="Effective" value={c.effectiveDate || c.signedAt || '—'} />
            </div>

            {/* Draw schedule (read-only) */}
            {(c.drawSchedule || []).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Payment schedule</h4>
                <div className="divide-y divide-gray-100 border border-gray-200 rounded text-sm">
                  {c.drawSchedule.map(m => {
                    const amt = m.amount ?? (m.pctOfContract ? (contractTotal(c) * m.pctOfContract) / 100 : 0);
                    return (
                      <div key={m.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                        <span className="col-span-6 text-gray-800">{m.label}</span>
                        <span className="col-span-2 text-xs text-gray-500 text-right tabular-nums">
                          {m.pctOfContract != null ? `${m.pctOfContract}%` : ''}
                        </span>
                        <span className="col-span-2 text-right tabular-nums">{fmt(amt)}</span>
                        <span className="col-span-2 text-right">
                          <Badge variant="outline" className={`text-[10px] ${
                            m.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200' :
                            m.status === 'invoiced' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            m.status === 'ready_to_invoice' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                            {m.status === 'ready_to_invoice' ? 'Ready' : m.status}
                          </Badge>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bid breakdown — every line item that made up the contract.
                Visible to client + sub audiences so they can see exactly
                how the total was assembled. */}
            {c.type === 'client_build' && (c.lineItems || []).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  How the bid breaks down
                </h4>
                <div className="border border-gray-200 rounded text-sm">
                  <div className="divide-y divide-gray-100">
                    {c.lineItems.map((l, i) => (
                      <div key={l.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                        <span className="col-span-1 text-xs text-gray-400 tabular-nums text-right">{i + 1}</span>
                        <span className="col-span-6 text-gray-800">{l.category}</span>
                        <span className="col-span-3 text-xs text-gray-400">{l.description || ''}</span>
                        <span className="col-span-2 text-right tabular-nums font-medium">{fmt(l.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 border-t-2 border-gray-200 bg-gray-50">
                    <span className="col-span-10 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">Subtotal</span>
                    <span className="col-span-2 text-right tabular-nums font-bold">{fmt(c.lineItems.reduce((s, l) => s + l.amount, 0))}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Selection deadlines (client audience) */}
            {audience === 'client' && c.type === 'client_build' && (() => {
              const pending = (c.allowances || []).filter(a => !a.resolved && a.dueDate);
              if (pending.length === 0) return null;
              return (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Selections you need to make
                  </h4>
                  <div className="space-y-1.5">
                    {pending.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')).map(a => {
                      const due = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                      const days = Math.round((due - Date.now()) / 86400000);
                      const overdue = days < 0;
                      const soon = days >= 0 && days <= 14;
                      return (
                        <div key={a.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded border ${
                          overdue ? 'bg-red-50 border-red-200' : soon ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{a.category}</p>
                            <p className="text-xs text-gray-500">{a.description}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-xs font-semibold ${overdue ? 'text-red-700' : soon ? 'text-amber-700' : 'text-gray-600'}`}>
                              Due {a.dueDate}
                            </p>
                            <p className="text-[11px] text-gray-500">{overdue ? `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue` : `in ${days} day${days === 1 ? '' : 's'}`}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Allowances (client only) */}
            {c.type === 'client_build' && (c.allowances || []).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Allowance items</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {c.allowances.map(a => (
                    <div key={a.id} className={`text-sm border rounded px-3 py-2 ${a.resolved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{a.category}</span>
                        <span className="tabular-nums text-xs">{fmt(a.amount)}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">{a.description}</div>
                      <div className="text-[10px] mt-1 uppercase tracking-wide">
                        {a.resolved ? <span className="text-green-700">Resolved</span> : <span className="text-amber-700">Pending selection</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change orders */}
            {(c.changeOrders || []).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Change orders</h4>
                <div className="space-y-1 text-sm">
                  {c.changeOrders.map(co => {
                    const visibleToClient = co.adminAcceptedForClient || co.source !== 'sub';
                    const clientCanAct = audience === 'client' && co.status === 'pending' && visibleToClient;
                    return (
                      <div key={co.id} className="border-b border-gray-100 py-1.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <span><span className="font-medium">CO #{co.number}:</span> {co.description}</span>
                            {co.submittedByName && (
                              <span className="text-[10px] text-gray-400 ml-2">
                                from {co.submittedByName}{co.trade ? ` (${co.trade})` : ''}
                              </span>
                            )}
                          </div>
                          <span className="flex items-center gap-2 flex-shrink-0">
                            <span className="tabular-nums">{fmt(co.amount)}</span>
                            <Badge variant="outline" className={`text-[10px] ${
                              co.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                              co.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {co.status}
                            </Badge>
                          </span>
                        </div>
                        {clientCanAct && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50" onClick={() => approveCo(c, co.id)}>
                              <Check className="w-3 h-3" />
                              Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => declineCo(c, co.id)}>
                              <X className="w-3 h-3" />
                              Decline
                            </Button>
                          </div>
                        )}
                        {co.status === 'rejected' && co.rejectionReason && (
                          <p className="text-[11px] text-red-600 mt-1 italic">Declined: {co.rejectionReason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {coRequestTarget && (
        <ChangeOrderRequestModal
          open={!!coRequestTarget}
          onClose={() => setCoRequestTarget(null)}
          subContract={coRequestTarget}
          submitterName={user?.name || user?.email || 'Subcontractor'}
          submitterContactId={(coRequestTarget.other?.contactId) || undefined}
        />
      )}
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-gray-500">{icon}{label}</div>
      <div className={`text-base font-bold tabular-nums ${accent ? 'text-gray-900' : 'text-gray-700'} mt-0.5`}>{value}</div>
    </div>
  );
}
