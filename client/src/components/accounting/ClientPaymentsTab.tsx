import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  Plus, Eye, Edit, Trash2, DollarSign, Calendar, CreditCard, 
  ExternalLink, Download, Filter, Search
} from 'lucide-react';

interface ClientPayment {
  id: number;
  projectId: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  checkNumber?: string;
  description?: string;
  notes?: string;
  createdBy: number;
  projectName?: string;
  clientName?: string;
}

export function ClientPaymentsTab() {
  const [newPaymentDialogOpen, setNewPaymentDialogOpen] = useState(false);
  const [editPaymentDialogOpen, setEditPaymentDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<ClientPayment | null>(null);
  const [filterProject, setFilterProject] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state for new payment
  const [paymentForm, setPaymentForm] = useState({
    projectId: '',
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'check',
    checkNumber: '',
    description: '',
    notes: ''
  });

  // Fetch data
  const { data: clientPayments = [], isLoading } = useQuery({
    queryKey: ['/api/client-payments'],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['/api/projects'],
  });

  // Create payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      return await apiRequest('POST', '/api/client-payments', paymentData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-payments'] });
      toast({
        title: "Payment Added",
        description: "Client payment has been recorded successfully.",
      });
      setNewPaymentDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add payment.",
        variant: "destructive",
      });
    },
  });

  // Update payment mutation
  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, ...paymentData }: any) => {
      return await apiRequest('PUT', `/api/client-payments/${id}`, paymentData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-payments'] });
      toast({
        title: "Payment Updated",
        description: "Client payment has been updated successfully.",
      });
      setEditPaymentDialogOpen(false);
      setSelectedPayment(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment.",
        variant: "destructive",
      });
    },
  });

  // Delete payment mutation
  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      return await apiRequest('DELETE', `/api/client-payments/${paymentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/client-payments'] });
      toast({
        title: "Payment Deleted",
        description: "Client payment has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setPaymentForm({
      projectId: '',
      amount: '',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'check',
      checkNumber: '',
      description: '',
      notes: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentForm.projectId || !paymentForm.amount || !paymentForm.paymentDate) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const paymentData = {
      ...paymentForm,
      projectId: parseInt(paymentForm.projectId),
      amount: parseFloat(paymentForm.amount),
      createdBy: 1
    };

    createPaymentMutation.mutate(paymentData);
  };

  const handleEdit = (payment: ClientPayment) => {
    setSelectedPayment(payment);
    setPaymentForm({
      projectId: payment.projectId.toString(),
      amount: payment.amount.toString(),
      paymentDate: payment.paymentDate.split('T')[0],
      paymentMethod: payment.paymentMethod,
      checkNumber: payment.checkNumber || '',
      description: payment.description || '',
      notes: payment.notes || ''
    });
    setEditPaymentDialogOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPayment) return;

    const updateData = {
      id: selectedPayment.id,
      ...paymentForm,
      projectId: parseInt(paymentForm.projectId),
      amount: parseFloat(paymentForm.amount),
    };

    updatePaymentMutation.mutate(updateData);
  };

  // Enhanced payments with project information
  const enhancedPayments = (clientPayments as any[] || []).map((payment: any) => {
    const project = (projects as any[] || []).find((p: any) => p.id === payment.projectId);
    return {
      ...payment,
      projectName: project?.name || 'Unknown Project',
      clientName: project?.clientName || 'Unknown Client'
    };
  });

  // Filter payments
  const filteredPayments = enhancedPayments.filter((payment: any) => {
    const matchesProject = filterProject === 'all' || payment.projectId.toString() === filterProject;
    const matchesSearch = searchTerm === '' || 
      payment.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.description?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesProject && matchesSearch;
  });

  // Calculate totals
  const totalPayments = filteredPayments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
  const averagePayment = filteredPayments.length > 0 ? totalPayments / filteredPayments.length : 0;

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'check': return <CreditCard className="w-4 h-4" />;
      case 'wire': return <DollarSign className="w-4 h-4" />;
      case 'ach': return <DollarSign className="w-4 h-4" />;
      case 'credit_card': return <CreditCard className="w-4 h-4" />;
      default: return <DollarSign className="w-4 h-4" />;
    }
  };

  const getPaymentMethodBadge = (method: string) => {
    const variants: Record<string, any> = {
      check: 'default',
      wire: 'secondary',
      ach: 'outline',
      credit_card: 'destructive'
    };
    return variants[method] || 'default';
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Client Payments</h2>
          <p className="text-gray-600">Track and manage payments received from clients</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setNewPaymentDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Payment
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Payment</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${averagePayment.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Per payment received
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${filteredPayments
                .filter(p => {
                  const paymentMonth = new Date(p.paymentDate).getMonth();
                  const currentMonth = new Date().getMonth();
                  return paymentMonth === currentMonth;
                })
                .reduce((sum, p) => sum + p.amount, 0)
                .toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Current month payments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(filteredPayments.map(p => p.projectId)).size}
            </div>
            <p className="text-xs text-muted-foreground">
              Projects with payments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search payments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {(projects as any[] || []).map((project: any) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>All client payments received</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No payments found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPayments.map((payment: ClientPayment) => (
                <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      {getPaymentMethodIcon(payment.paymentMethod)}
                      <Badge variant={getPaymentMethodBadge(payment.paymentMethod)}>
                        {payment.paymentMethod.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-medium text-lg text-green-600">
                        ${payment.amount.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">
                        {payment.checkNumber && `Check #${payment.checkNumber} • `}
                        {new Date(payment.paymentDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium">{payment.projectName}</div>
                      <div className="text-sm text-gray-600">
                        Client: {payment.clientName}
                      </div>
                    </div>
                    {payment.description && (
                      <div className="text-sm text-gray-600 max-w-xs">
                        {payment.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Navigate to project detail
                        window.open(`/projects/${payment.projectId}`, '_blank');
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(payment)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this payment?')) {
                          deletePaymentMutation.mutate(payment.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Payment Dialog */}
      <Dialog open={newPaymentDialogOpen} onOpenChange={setNewPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Client Payment</DialogTitle>
            <DialogDescription>
              Record a new payment received from a client.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="project">Project *</Label>
                <Select value={paymentForm.projectId} onValueChange={(value) => 
                  setPaymentForm({ ...paymentForm, projectId: value })
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects as any[] || []).map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paymentDate">Payment Date *</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="paymentMethod">Payment Method *</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={(value) => 
                  setPaymentForm({ ...paymentForm, paymentMethod: value })
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="wire">Wire Transfer</SelectItem>
                    <SelectItem value="ach">ACH Transfer</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {paymentForm.paymentMethod === 'check' && (
              <div>
                <Label htmlFor="checkNumber">Check Number</Label>
                <Input
                  id="checkNumber"
                  placeholder="Check number"
                  value={paymentForm.checkNumber}
                  onChange={(e) => setPaymentForm({ ...paymentForm, checkNumber: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Payment description"
                value={paymentForm.description}
                onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createPaymentMutation.isPending}>
                {createPaymentMutation.isPending ? 'Adding...' : 'Add Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={editPaymentDialogOpen} onOpenChange={setEditPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Client Payment</DialogTitle>
            <DialogDescription>
              Update payment information.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            {/* Same form fields as add payment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editProject">Project *</Label>
                <Select value={paymentForm.projectId} onValueChange={(value) => 
                  setPaymentForm({ ...paymentForm, projectId: value })
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects as any[] || []).map((project: any) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="editAmount">Amount *</Label>
                <Input
                  id="editAmount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editPaymentDate">Payment Date *</Label>
                <Input
                  id="editPaymentDate"
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="editPaymentMethod">Payment Method *</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={(value) => 
                  setPaymentForm({ ...paymentForm, paymentMethod: value })
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="check">Check</SelectItem>
                    <SelectItem value="wire">Wire Transfer</SelectItem>
                    <SelectItem value="ach">ACH Transfer</SelectItem>
                    <SelectItem value="credit_card">Credit Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {paymentForm.paymentMethod === 'check' && (
              <div>
                <Label htmlFor="editCheckNumber">Check Number</Label>
                <Input
                  id="editCheckNumber"
                  placeholder="Check number"
                  value={paymentForm.checkNumber}
                  onChange={(e) => setPaymentForm({ ...paymentForm, checkNumber: e.target.value })}
                />
              </div>
            )}

            <div>
              <Label htmlFor="editDescription">Description</Label>
              <Input
                id="editDescription"
                placeholder="Payment description"
                value={paymentForm.description}
                onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="editNotes">Notes</Label>
              <Textarea
                id="editNotes"
                placeholder="Additional notes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updatePaymentMutation.isPending}>
                {updatePaymentMutation.isPending ? 'Updating...' : 'Update Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}