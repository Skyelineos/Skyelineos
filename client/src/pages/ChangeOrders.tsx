import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot, addDoc, updateDoc,
  doc, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Search, FileText, MoreVertical, CheckCircle, XCircle, Eye,
  TrendingUp, Clock, DollarSign, Calendar
} from 'lucide-react';

type COStatus = 'pending' | 'approved' | 'rejected' | 'voided';
type COType = 'addition' | 'credit' | 'allowance';

interface ChangeOrder {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  amount: number;
  status: COStatus;
  type: COType;
  reason?: string;
  createdAt?: unknown;
  approvedAt?: unknown;
  approvedBy?: string;
}

interface Project {
  id: string;
  name: string;
}

interface Client {
  id: string;
  name: string;
}

type COFormData = {
  title: string;
  description: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  amount: string;
  type: COType;
  reason: string;
};

const defaultForm = (): COFormData => ({
  title: '',
  description: '',
  projectId: '',
  projectName: '',
  clientId: '',
  clientName: '',
  amount: '',
  type: 'addition',
  reason: ''
});

function statusBadge(status: COStatus): string {
  switch (status) {
    case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'approved': return 'bg-green-100 text-green-700 border-green-200';
    case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
    case 'voided': return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function typeBadge(type: COType): string {
  switch (type) {
    case 'addition': return 'bg-blue-100 text-blue-700';
    case 'credit': return 'bg-purple-100 text-purple-700';
    case 'allowance': return 'bg-teal-100 text-teal-700';
  }
}

function amountClass(type: COType): string {
  return type === 'credit' ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold';
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
}

function isThisMonth(co: ChangeOrder): boolean {
  if (!co.createdAt) return false;
  const now = new Date();
  // Firestore Timestamps have .toDate()
  const coDate = typeof co.createdAt === 'object' && co.createdAt !== null && 'toDate' in co.createdAt
    ? (co.createdAt as { toDate: () => Date }).toDate()
    : new Date(co.createdAt as string);
  return coDate.getMonth() === now.getMonth() && coDate.getFullYear() === now.getFullYear();
}

export default function ChangeOrders() {
  return (
    <AppLayout>
      <ChangeOrdersContent />
    </AppLayout>
  );
}

export function ChangeOrdersContent({ projectId: scopedProjectId }: { projectId?: string } = {}) {
  const { toast } = useToast();

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedCO, setSelectedCO] = useState<ChangeOrder | null>(null);

  // Prefill new-CO form with the scoped project (if any).
  const seededForm = (): COFormData => {
    const f = defaultForm();
    if (scopedProjectId) {
      const proj = projects.find(p => p.id === scopedProjectId);
      f.projectId = scopedProjectId;
      f.projectName = proj?.name || '';
    }
    return f;
  };
  const [formData, setFormData] = useState<COFormData>(defaultForm());
  const [isSaving, setIsSaving] = useState(false);

  // Subscribe to changeOrders
  useEffect(() => {
    const q = query(collection(db, 'changeOrders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setChangeOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChangeOrder)));
      setIsLoading(false);
    }, () => setIsLoading(false));
    return unsub;
  }, []);

  // Subscribe to projects
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'projects'), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name: string }).name })));
    });
    return unsub;
  }, []);

  // Subscribe to clients
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(d => ({ id: d.id, name: (d.data() as { name: string }).name })));
    });
    return unsub;
  }, []);

  const handleProjectChange = (projectId: string) => {
    const proj = projects.find(p => p.id === projectId);
    setFormData(prev => ({ ...prev, projectId: projectId === 'none' ? '' : projectId, projectName: proj?.name || '' }));
  };

  const handleClientChange = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    setFormData(prev => ({ ...prev, clientId: clientId === 'none' ? '' : clientId, clientName: client?.name || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'changeOrders'), {
        title: formData.title,
        description: formData.description,
        projectId: formData.projectId,
        projectName: formData.projectName,
        clientId: formData.clientId,
        clientName: formData.clientName,
        amount: parseFloat(formData.amount) || 0,
        type: formData.type,
        reason: formData.reason,
        status: 'pending' as COStatus,
        createdAt: serverTimestamp()
      });
      setDialogOpen(false);
      setFormData(seededForm());
      toast({ title: 'Change order created' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create change order',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async (co: ChangeOrder) => {
    try {
      await updateDoc(doc(db, 'changeOrders', co.id), {
        status: 'approved',
        approvedAt: serverTimestamp()
      });
      toast({ title: 'Change order approved' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve',
        variant: 'destructive'
      });
    }
  };

  const handleReject = async (co: ChangeOrder) => {
    if (!confirm(`Reject change order "${co.title}"?`)) return;
    try {
      await updateDoc(doc(db, 'changeOrders', co.id), { status: 'rejected' });
      toast({ title: 'Change order rejected' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reject',
        variant: 'destructive'
      });
    }
  };

  const handleVoid = async (co: ChangeOrder) => {
    if (!confirm(`Void change order "${co.title}"?`)) return;
    try {
      await updateDoc(doc(db, 'changeOrders', co.id), { status: 'voided' });
      toast({ title: 'Change order voided' });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to void',
        variant: 'destructive'
      });
    }
  };

  // Filtered list
  const filtered = changeOrders.filter(co => {
    const matchSearch = searchTerm === '' ||
      co.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (co.projectName && co.projectName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (co.clientName && co.clientName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchStatus = statusFilter === 'all' || co.status === statusFilter;
    const matchScoped = !scopedProjectId || co.projectId === scopedProjectId;
    const matchProject = projectFilter === 'all' || co.projectId === projectFilter;
    return matchScoped && matchSearch && matchStatus && matchProject;
  });

  // Stats
  const totalAmount = changeOrders.reduce((sum, co) => sum + (co.amount || 0), 0);
  const pendingAmount = changeOrders
    .filter(co => co.status === 'pending')
    .reduce((sum, co) => sum + (co.amount || 0), 0);
  const approvedAmount = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + (co.amount || 0), 0);
  const thisMonthAmount = changeOrders
    .filter(co => isThisMonth(co))
    .reduce((sum, co) => sum + (co.amount || 0), 0);

  return (
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Change Orders</h1>
            {pendingAmount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 text-sm">
                {formatCurrency(pendingAmount)} pending
              </Badge>
            )}
          </div>
          <Button
            onClick={() => { setFormData(seededForm()); setDialogOpen(true); }}
            className="text-white"
            style={{ backgroundColor: '#C9A96E', borderColor: '#C9A96E' }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Change Order
          </Button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-gray-600 font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-500" />
                Total Value
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              <p className="text-xs text-gray-500 mt-1">{changeOrders.length} orders total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-gray-600 font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-amber-600">{formatCurrency(pendingAmount)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {changeOrders.filter(co => co.status === 'pending').length} awaiting approval
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-gray-600 font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Approved
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-green-600">{formatCurrency(approvedAmount)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {changeOrders.filter(co => co.status === 'approved').length} approved
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm text-gray-600 font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                This Month
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold">{formatCurrency(thisMonthAmount)}</p>
              <p className="text-xs text-gray-500 mt-1">
                {changeOrders.filter(co => isThisMonth(co)).length} orders this month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search change orders..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
          {!scopedProjectId && (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Table / List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="animate-pulse flex gap-4">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-1/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/6" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No change orders found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter !== 'all' || projectFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first change order to get started'}
              </p>
              {!searchTerm && statusFilter === 'all' && projectFilter === 'all' && (
                <Button
                  onClick={() => { setFormData(seededForm()); setDialogOpen(true); }}
                  className="text-white"
                  style={{ backgroundColor: '#C9A96E', borderColor: '#C9A96E' }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Change Order
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(co => (
              <Card key={co.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Left: title + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-medium truncate">{co.title}</span>
                        <Badge className={`text-xs ${typeBadge(co.type)}`}>{co.type}</Badge>
                        <Badge className={`text-xs border ${statusBadge(co.status)}`}>
                          {co.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
                        {co.projectName && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {co.projectName}
                          </span>
                        )}
                        {co.clientName && (
                          <span>{co.clientName}</span>
                        )}
                        {co.createdAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {typeof co.createdAt === 'object' && co.createdAt !== null && 'toDate' in co.createdAt
                              ? (co.createdAt as { toDate: () => Date }).toDate().toLocaleDateString()
                              : String(co.createdAt)
                            }
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className={`text-right text-base ${amountClass(co.type)} min-w-[80px]`}>
                      {co.type === 'credit' ? '-' : '+'}{formatCurrency(co.amount || 0)}
                    </div>

                    {/* Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setSelectedCO(co); setViewDialogOpen(true); }}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {co.status === 'pending' && (
                          <>
                            <DropdownMenuItem onClick={() => handleApprove(co)} className="text-green-700">
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleReject(co)} className="text-red-600">
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        {(co.status === 'pending' || co.status === 'approved') && (
                          <DropdownMenuItem onClick={() => handleVoid(co)} className="text-gray-600">
                            Void
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New Change Order</DialogTitle>
              <DialogDescription>Create a new change order for a project</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="co-title">Title *</Label>
                <Input
                  id="co-title"
                  value={formData.title}
                  onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="co-description">Description</Label>
                <Textarea
                  id="co-description"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Project</Label>
                  {scopedProjectId ? (
                    <Input value={formData.projectName || 'This project'} disabled className="bg-gray-50" />
                  ) : (
                    <Select value={formData.projectId || 'none'} onValueChange={handleProjectChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No project</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Client</Label>
                  <Select value={formData.clientId || 'none'} onValueChange={handleClientChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No client</SelectItem>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={formData.type} onValueChange={v => setFormData(prev => ({ ...prev, type: v as COType }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="addition">Addition</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                      <SelectItem value="allowance">Allowance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="co-amount">Amount ($) *</Label>
                  <Input
                    id="co-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="co-reason">Reason</Label>
                <Textarea
                  id="co-reason"
                  value={formData.reason}
                  onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                  rows={2}
                  placeholder="Reason for change order"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="text-white"
                  style={{ backgroundColor: '#C9A96E', borderColor: '#C9A96E' }}
                >
                  {isSaving ? 'Creating...' : 'Create Change Order'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* View Details Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change Order Details</DialogTitle>
            </DialogHeader>
            {selectedCO && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`border ${statusBadge(selectedCO.status)}`}>{selectedCO.status}</Badge>
                  <Badge className={typeBadge(selectedCO.type)}>{selectedCO.type}</Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Title</p>
                  <p className="font-semibold">{selectedCO.title}</p>
                </div>
                {selectedCO.description && (
                  <div>
                    <p className="text-sm text-gray-500">Description</p>
                    <p className="text-sm">{selectedCO.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Project</p>
                    <p className="text-sm font-medium">{selectedCO.projectName || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Client</p>
                    <p className="text-sm font-medium">{selectedCO.clientName || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className={`text-xl font-bold ${amountClass(selectedCO.type)}`}>
                    {selectedCO.type === 'credit' ? '-' : '+'}{formatCurrency(selectedCO.amount || 0)}
                  </p>
                </div>
                {selectedCO.reason && (
                  <div>
                    <p className="text-sm text-gray-500">Reason</p>
                    <p className="text-sm">{selectedCO.reason}</p>
                  </div>
                )}
                {selectedCO.status === 'pending' && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      className="flex-1 text-white bg-green-600 hover:bg-green-700"
                      onClick={() => { handleApprove(selectedCO); setViewDialogOpen(false); }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 text-red-600 border-red-300 hover:bg-red-50"
                      onClick={() => { handleReject(selectedCO); setViewDialogOpen(false); }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}
