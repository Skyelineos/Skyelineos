import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { 
  DollarSign, FileText, Clock, AlertCircle, CheckCircle, Eye, 
  Plus, Edit, Download, Filter, Search, CreditCard, Building2,
  ExternalLink, Receipt, Calendar
} from 'lucide-react';

interface PurchaseOrder {
  id: number;
  projectId: number;
  contactId: number;
  poNumber: string;
  trade: string;
  description: string;
  amount: number;
  status: string;
  createdAt: string;
  signedAt?: string;
  projectName?: string;
  contractorName?: string;
  invoicedAmount: number;
  paidAmount: number;
  remainingBalance: number;
  linkedInvoices: Invoice[];
}

interface Invoice {
  id: number;
  projectId: number;
  contactId: number;
  poId?: number;
  invoiceNumber: string;
  description: string;
  amount: number;
  trade: string;
  status: string;
  submittedDate: string;
  dueDate?: string;
  totalPaid: number;
  balanceRemaining: number;
  contractorName?: string;
  projectName?: string;
}

export function SubcontractorPaymentsTab() {
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTrade, setFilterTrade] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'check',
    checkNumber: '',
    notes: ''
  });

  // Fetch data
  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ['/api/purchase-orders'],
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/invoices'],
  });

  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });

  const { data: contacts = [] } = useQuery<any[]>({
    queryKey: ['/api/contacts'],
  });

  // Add payment mutation
  const addPaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      return await apiRequest('POST', `/api/invoices/${selectedInvoice?.id}/payments`, paymentData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      toast({
        title: "Payment Added",
        description: "Payment has been recorded successfully.",
      });
      setPaymentDialogOpen(false);
      resetPaymentForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add payment.",
        variant: "destructive",
      });
    },
  });

  const resetPaymentForm = () => {
    setPaymentForm({
      amount: '',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'check',
      checkNumber: '',
      notes: ''
    });
  };

  // Enhanced POs with invoice data
  const enhancedPOs = purchaseOrders.map((po: PurchaseOrder) => {
    const project = projects.find((p: any) => p.id === po.projectId);
    const contractor = contacts.find((c: any) => c.id === po.contactId);
    const linkedInvoices = invoices.filter((inv: Invoice) => inv.poId === po.id);
    
    const invoicedAmount = linkedInvoices.reduce((sum: number, inv: Invoice) => sum + inv.amount, 0);
    const paidAmount = linkedInvoices.reduce((sum: number, inv: Invoice) => sum + (inv.totalPaid || 0), 0);
    const remainingBalance = po.amount - paidAmount;

    return {
      ...po,
      projectName: project?.name || 'Unknown Project',
      contractorName: contractor?.company || contractor?.name || 'Unknown Contractor',
      invoicedAmount,
      paidAmount,
      remainingBalance,
      linkedInvoices
    };
  });

  // Enhanced invoices with project and contractor data
  const enhancedInvoices = invoices.map((invoice: Invoice) => {
    const project = projects.find((p: any) => p.id === invoice.projectId);
    const contractor = contacts.find((c: any) => c.id === invoice.contactId);
    
    return {
      ...invoice,
      projectName: project?.name || 'Unknown Project',
      contractorName: contractor?.company || contractor?.name || 'Unknown Contractor',
      balanceRemaining: invoice.balanceRemaining || (invoice.amount - (invoice.totalPaid || 0))
    };
  });

  // Filter data
  const filteredPOs = enhancedPOs.filter((po: PurchaseOrder) => {
    const matchesStatus = filterStatus === 'all' || po.status === filterStatus;
    const matchesTrade = filterTrade === 'all' || po.trade === filterTrade;
    const matchesSearch = searchTerm === '' || 
      po.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.contractorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesTrade && matchesSearch;
  });

  const filteredInvoices = enhancedInvoices.filter((invoice: Invoice) => {
    const matchesStatus = filterStatus === 'all' || invoice.status === filterStatus;
    const matchesTrade = filterTrade === 'all' || invoice.trade === filterTrade;
    const matchesSearch = searchTerm === '' || 
      invoice.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.contractorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesTrade && matchesSearch;
  });

  // Calculate totals
  const totalPOValue = filteredPOs.reduce((sum: number, po: PurchaseOrder) => sum + po.amount, 0);
  const totalInvoiced = filteredPOs.reduce((sum: number, po: PurchaseOrder) => sum + po.invoicedAmount, 0);
  const totalPaid = filteredPOs.reduce((sum: number, po: PurchaseOrder) => sum + po.paidAmount, 0);
  const totalOutstanding = filteredInvoices.reduce((sum: number, inv: Invoice) => sum + inv.balanceRemaining, 0);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      'draft': 'secondary',
      'sent': 'outline',
      'signed': 'default',
      'completed': 'default',
      'pending': 'secondary',
      'approved': 'default',
      'paid': 'default',
      'overdue': 'destructive'
    };
    
    const colors: Record<string, string> = {
      'draft': 'bg-gray-100 text-gray-800',
      'sent': 'bg-blue-100 text-blue-800',
      'signed': 'bg-green-100 text-green-800',
      'completed': 'bg-green-100 text-green-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'approved': 'bg-blue-100 text-blue-800',
      'paid': 'bg-green-100 text-green-800',
      'overdue': 'bg-red-100 text-red-800'
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handlePayInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPaymentForm({
      ...paymentForm,
      amount: invoice.balanceRemaining.toString()
    });
    setPaymentDialogOpen(true);
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedInvoice || !paymentForm.amount) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    const paymentData = {
      amount: parseFloat(paymentForm.amount),
      paymentDate: paymentForm.paymentDate,
      paymentMethod: paymentForm.paymentMethod,
      checkNumber: paymentForm.checkNumber,
      notes: paymentForm.notes,
      paidBy: 'Admin'
    };

    addPaymentMutation.mutate(paymentData);
  };

  const getUniqueValues = (items: any[], key: string) => {
    const uniqueSet = new Set(items.map(item => item[key]).filter(Boolean));
    return Array.from(uniqueSet);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subcontractor Payments</h2>
          <p className="text-gray-600">Track POs, invoices, and payments to subcontractors</p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total PO Value</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalPOValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {filteredPOs.length} purchase orders
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">${totalInvoiced.toLocaleString()}</div>
            <p className="text-xs text-muted-foreference">
              {filteredInvoices.length} invoices received
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Payments processed
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">${totalOutstanding.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting payment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search POs, invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {getUniqueValues([...filteredPOs, ...filteredInvoices], 'status').map((status) => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterTrade} onValueChange={setFilterTrade}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by trade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Trades</SelectItem>
              {getUniqueValues([...filteredPOs, ...filteredInvoices], 'trade').map((trade) => (
                <SelectItem key={trade} value={trade}>{trade}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Purchase Orders Section */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Purchase Orders with Invoice Status</CardTitle>
          <CardDescription>POs and their associated invoices and payment status</CardDescription>
        </CardHeader>
        <CardContent>
          {posLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : filteredPOs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No purchase orders found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPOs.map((po: PurchaseOrder) => (
                <div key={po.id} className="border rounded-lg p-4 space-y-3">
                  {/* PO Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">{po.poNumber}</div>
                        <div className="text-sm text-gray-600">{po.trade}</div>
                      </div>
                      <div>
                        <div className="font-medium">{po.contractorName}</div>
                        <div className="text-sm text-gray-600">{po.projectName}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">${po.amount.toLocaleString()}</div>
                        <div className="text-sm text-gray-600">PO Amount</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(po.status)}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/projects/${po.projectId}`, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Payment Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Payment Progress</span>
                      <span>{Math.round((po.paidAmount / po.amount) * 100)}%</span>
                    </div>
                    <Progress value={(po.paidAmount / po.amount) * 100} className="h-2" />
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Invoiced: ${po.invoicedAmount.toLocaleString()}</span>
                      <span>Paid: ${po.paidAmount.toLocaleString()}</span>
                      <span>Remaining: ${po.remainingBalance.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Linked Invoices */}
                  {po.linkedInvoices.length > 0 && (
                    <div className="border-t pt-3">
                      <div className="text-sm font-medium mb-2">Linked Invoices ({po.linkedInvoices.length})</div>
                      <div className="space-y-2">
                        {po.linkedInvoices.map((invoice: Invoice) => (
                          <div key={invoice.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center space-x-3">
                              <div>
                                <div className="font-medium text-sm">{invoice.invoiceNumber}</div>
                                <div className="text-xs text-gray-600">
                                  {new Date(invoice.submittedDate).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-medium">${invoice.amount.toLocaleString()}</div>
                                <div className="text-xs text-gray-600">
                                  Balance: ${invoice.balanceRemaining.toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {getStatusBadge(invoice.status)}
                              {invoice.status === 'approved' && invoice.balanceRemaining > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePayInvoice(invoice)}
                                >
                                  <DollarSign className="w-4 h-4 mr-1" />
                                  Pay
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Standalone Invoices (not linked to POs) */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Standalone Invoices</CardTitle>
          <CardDescription>Invoices not linked to purchase orders</CardDescription>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvoices
                .filter((invoice: Invoice) => !invoice.poId)
                .map((invoice: Invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">{invoice.invoiceNumber}</div>
                        <div className="text-sm text-gray-600">{invoice.trade}</div>
                      </div>
                      <div>
                        <div className="font-medium">{invoice.contractorName}</div>
                        <div className="text-sm text-gray-600">{invoice.projectName}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">${invoice.amount.toLocaleString()}</div>
                        <div className="text-sm text-gray-600">
                          Balance: ${invoice.balanceRemaining.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusBadge(invoice.status)}
                      {invoice.status === 'approved' && invoice.balanceRemaining > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePayInvoice(invoice)}
                        >
                          <DollarSign className="w-4 h-4 mr-1" />
                          Pay
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/projects/${invoice.projectId}`, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record payment for invoice {selectedInvoice?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-medium">{selectedInvoice.invoiceNumber}</div>
                  <div className="text-sm text-gray-600">
                    {selectedInvoice.contractorName} • {selectedInvoice.trade}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">${selectedInvoice.amount.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">
                    Balance: ${selectedInvoice.balanceRemaining.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmitPayment} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paymentAmount">Payment Amount *</Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  required
                />
              </div>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
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
            </div>

            <div>
              <Label htmlFor="paymentNotes">Notes</Label>
              <Textarea
                id="paymentNotes"
                placeholder="Payment notes"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addPaymentMutation.isPending}>
                {addPaymentMutation.isPending ? 'Processing...' : 'Record Payment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}