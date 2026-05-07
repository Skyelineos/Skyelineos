import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, FileText, TrendingUp, AlertCircle, Search, Filter } from 'lucide-react';
import AddPaymentModal from './AddPaymentModal';
import PaymentHistoryCard from './PaymentHistoryCard';
import POPaymentTracker from './POPaymentTracker';

interface PaymentDashboardProps {
  projectId: string | number;
}

export default function PaymentDashboard({ projectId }: PaymentDashboardProps) {
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Fetch invoices for the project
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: [`/api/invoices/project/${projectId}`]
  });

  // Fetch purchase orders for the project
  const { data: purchaseOrders = [], isLoading: posLoading } = useQuery({
    queryKey: [`/api/purchase-orders/project/${projectId}`]
  });

  // Filter invoices based on search and status
  const filteredInvoices = invoices.filter((invoice: any) => {
    const matchesSearch = invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.trade.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         invoice.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate dashboard metrics
  const totalInvoiceAmount = invoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
  const totalPaid = invoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.totalPaid || '0'), 0);
  const totalRemaining = totalInvoiceAmount - totalPaid;
  const paymentProgress = totalInvoiceAmount > 0 ? (totalPaid / totalInvoiceAmount) * 100 : 0;

  // Group invoices by status
  const invoicesByStatus = invoices.reduce((acc: any, invoice: any) => {
    acc[invoice.status] = (acc[invoice.status] || 0) + 1;
    return acc;
  }, {});

  // Group POs by payment status
  const posByStatus = purchaseOrders.reduce((acc: any, po: any) => {
    const status = po.poStatus || 'unpaid';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  const handleAddPayment = (invoice: any) => {
    setSelectedInvoice(invoice);
    setShowAddPayment(true);
  };

  const handleClosePaymentModal = () => {
    setShowAddPayment(false);
    setSelectedInvoice(null);
  };

  if (invoicesLoading || posLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalInvoiceAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round(paymentProgress)}% of total
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${totalRemaining.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Remaining to collect
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active POs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchaseOrders.length}</div>
            <p className="text-xs text-muted-foreground">
              Purchase orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Badges */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline" className="text-green-600">
          {invoicesByStatus.paid || 0} Paid
        </Badge>
        <Badge variant="outline" className="text-orange-600">
          {invoicesByStatus.partial || 0} Partial
        </Badge>
        <Badge variant="outline" className="text-theme-primary">
          {invoicesByStatus.approved || 0} Approved
        </Badge>
        <Badge variant="outline" className="text-yellow-600">
          {invoicesByStatus.pending || 0} Pending
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Payment Tracking Tabs */}
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices ({filteredInvoices.length})</TabsTrigger>
          <TabsTrigger value="pos">Purchase Orders ({purchaseOrders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          {filteredInvoices.length > 0 ? (
            <div className="grid gap-4">
              {filteredInvoices.map((invoice: any) => (
                <PaymentHistoryCard
                  key={invoice.id}
                  invoice={invoice}
                  onAddPayment={() => handleAddPayment(invoice)}
                  onViewDetails={() => {}}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No invoices found matching your criteria</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="pos" className="space-y-4">
          {purchaseOrders.length > 0 ? (
            <div className="grid gap-4">
              {purchaseOrders.map((po: any) => (
                <POPaymentTracker
                  key={po.id}
                  purchaseOrder={po}
                  onViewInvoice={(invoiceId) => {}}
                  onLinkInvoice={(poId) => {}}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No purchase orders found</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Payment Modal */}
      {showAddPayment && selectedInvoice && (
        <AddPaymentModal
          isOpen={showAddPayment}
          onClose={handleClosePaymentModal}
          invoice={selectedInvoice}
          projectId={projectId}
        />
      )}
    </div>
  );
}