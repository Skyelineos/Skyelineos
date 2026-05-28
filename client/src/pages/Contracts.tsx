import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import {
  FileSignature, Plus, Search, Filter, AlertTriangle, CheckCircle2, Clock,
} from 'lucide-react';
import {
  listenAllContracts, createContract, deleteContract,
} from '@/lib/contracts/firestore';
import {
  type Contract, type ContractType, type ContractStatus,
  CONTRACT_TYPE_LABEL, CONTRACT_STATUS_LABEL,
  contractTotal, contractPaid, contractOutstanding,
} from '@/lib/contracts/types';
import { ContractEditor } from '@/components/contracts/ContractEditor';

function fmtCurrency(n: number) {
  if (!Number.isFinite(n)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function statusBadgeClass(s: ContractStatus): string {
  switch (s) {
    case 'draft':     return 'bg-gray-100 text-gray-700 border-gray-200';
    case 'sent':      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'signed':    return 'bg-green-50 text-green-800 border-green-200';
    case 'active':    return 'bg-green-100 text-green-900 border-green-300';
    case 'completed': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'closed':    return 'bg-gray-50 text-gray-500 border-gray-200';
    case 'cancelled': return 'bg-red-50 text-red-700 border-red-200';
  }
}

export default function ContractsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Contract[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ContractType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all');
  const [editing, setEditing] = useState<Contract | null>(null);
  const [creating, setCreating] = useState<ContractType | null>(null);

  useEffect(() => {
    return listenAllContracts(setRows);
  }, []);

  // URL filters: ?employee=<uid> jumps you to that person's employment
  // agreement, or opens the create flow if they don't have one yet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const empUid = params.get('employee');
    if (empUid) {
      setTypeFilter('employee');
      const existing = rows.find(r => r.type === 'employee' && r.other?.userId === empUid);
      if (existing) setEditing(existing);
      else if (rows.length > 0) setCreating('employee');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(c => {
      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!s) return true;
      return (
        c.other?.name?.toLowerCase().includes(s)
        || c.projectName?.toLowerCase().includes(s)
        || c.trade?.toLowerCase().includes(s)
        || c.scope?.toLowerCase().includes(s)
      );
    });
  }, [rows, search, typeFilter, statusFilter]);

  const totals = useMemo(() => {
    const t = { contractValue: 0, paid: 0, outstanding: 0, count: filtered.length };
    for (const c of filtered) {
      t.contractValue += contractTotal(c);
      t.paid += contractPaid(c);
      t.outstanding += contractOutstanding(c);
    }
    return t;
  }, [filtered]);

  const startCreate = (type: ContractType) => {
    setCreating(type);
    setEditing(null);
  };

  const handleCreate = async (data: Omit<Contract, 'id' | 'createdAt'>) => {
    try {
      const id = await createContract({ ...data, createdBy: user?.firebaseUid || user?.email || 'unknown' });
      toast({ title: 'Contract created', description: `${CONTRACT_TYPE_LABEL[data.type]} drafted.` });
      setCreating(null);
      const fresh = rows.find(r => r.id === id);
      if (fresh) setEditing(fresh);
    } catch (e: any) {
      toast({ title: 'Create failed', description: e?.message || 'Unknown', variant: 'destructive' });
    }
  };

  const handleDelete = async (c: Contract) => {
    const ok = await confirm({
      title: `Delete this ${CONTRACT_TYPE_LABEL[c.type]}?`,
      description: 'This cannot be undone.',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteContract(c.id);
      toast({ title: 'Contract deleted' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message || 'Unknown', variant: 'destructive' });
    }
  };

  if (editing) {
    return (
      <AppLayout>
        <ContractEditor
          contract={editing}
          onBack={() => setEditing(null)}
        />
      </AppLayout>
    );
  }
  if (creating) {
    return (
      <AppLayout>
        <ContractEditor
          newContractType={creating}
          onCancel={() => setCreating(null)}
          onSave={handleCreate}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <FileSignature className="w-7 h-7 text-[#C9A96E]" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
              <p className="text-sm text-gray-500">Build agreements, sub agreements, designer agreements — and the payments tied to them.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value="new" onValueChange={(v) => v !== 'new' && startCreate(v as ContractType)}>
              <SelectTrigger className="w-[230px]">
                <SelectValue placeholder="+ New Contract" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new" disabled>+ New Contract…</SelectItem>
                <SelectItem value="client_build">Client Build Agreement</SelectItem>
                <SelectItem value="subcontractor">Subcontractor Agreement</SelectItem>
                <SelectItem value="designer">Designer Agreement</SelectItem>
                <SelectItem value="employee">Employment Agreement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Contracts" value={String(totals.count)} icon={<FileSignature className="w-4 h-4" />} />
          <SummaryTile label="Total Value" value={fmtCurrency(totals.contractValue)} icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} />
          <SummaryTile label="Paid" value={fmtCurrency(totals.paid)} icon={<CheckCircle2 className="w-4 h-4 text-blue-600" />} />
          <SummaryTile label="Outstanding" value={fmtCurrency(totals.outstanding)} icon={<Clock className="w-4 h-4 text-amber-600" />} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search by party, project, trade…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
            <SelectTrigger className="w-[210px]">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="client_build">Client Build</SelectItem>
              <SelectItem value="subcontractor">Subcontractor</SelectItem>
              <SelectItem value="designer">Designer</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-400">
                <FileSignature className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No contracts yet</p>
                <p className="text-sm mt-1">Start by creating a Client Build Agreement.</p>
                <Button className="mt-4" onClick={() => startCreate('client_build')}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  New Client Build Agreement
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Party</th>
                      <th className="px-4 py-2.5">Project</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Value</th>
                      <th className="px-4 py-2.5 text-right">Paid</th>
                      <th className="px-4 py-2.5 text-right">Outstanding</th>
                      <th className="px-4 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(c => {
                      const isSoft = c.budgetMode === 'soft';
                      return (
                        <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(c)}>
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium text-gray-700">{CONTRACT_TYPE_LABEL[c.type]}</span>
                            {c.type === 'subcontractor' && c.trade && (
                              <div className="text-xs text-gray-400 mt-0.5">{c.trade}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{c.other?.name || '—'}</div>
                            {c.other?.company && c.other.company !== c.other.name && (
                              <div className="text-xs text-gray-500">{c.other.company}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{c.projectName || (c.type === 'employee' ? '— (HR)' : '—')}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${statusBadgeClass(c.status)}`}>
                              {CONTRACT_STATUS_LABEL[c.status]}
                            </Badge>
                            {isSoft && (
                              <Badge variant="outline" className="text-[10px] ml-1.5 bg-amber-50 text-amber-700 border-amber-200">
                                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                Soft
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(contractTotal(c))}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtCurrency(contractPaid(c))}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtCurrency(contractOutstanding(c))}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm" variant="ghost"
                              className="text-red-500 hover:text-red-600 h-7 px-2"
                              onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
                            >
                              ×
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function SummaryTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-wider">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
