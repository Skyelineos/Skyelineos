import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isValid } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

import { useAuth } from '@/hooks/use-auth';
import PaymentDashboard from '../payments/PaymentDashboard';
import LiveBudgetDashboard from './LiveBudgetDashboard';

// Helper function to safely format dates
const formatDate = (date: any, formatString: string, fallback: string = 'N/A'): string => {
  if (!date) return fallback;
  const dateObj = new Date(date);
  return isValid(dateObj) ? format(dateObj, formatString) : fallback;
};
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  Edit, 
  Trash2,
  CreditCard,
  Receipt,
  Calculator,
  FileText,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

const clientPaymentSchema = z.object({
  projectId: z.number(),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentDate: z.string(),
  paymentMethod: z.enum(['check', 'wire', 'ach', 'credit_card']),
  checkNumber: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.number(),
});

type ClientPaymentFormData = z.infer<typeof clientPaymentSchema>;

interface BudgetTabProps {
  projectId: number;
}

export default function BudgetTab({ projectId }: BudgetTabProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);

  // Early return with loading if no user
  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading user information...</div>
      </div>
    );
  }

  // Fetch budget summary
  const { data: budgetSummary = {}, isLoading: summaryLoading } = useQuery({
    queryKey: ['/api/projects', projectId, 'budget-summary'],
    enabled: !!projectId,
  });

  // Fetch client payments
  const { data: clientPayments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ['/api/projects', projectId, 'client-payments'],
    enabled: !!projectId,
  });

  // Fetch subcontractor invoices  
  const { data: subInvoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['/api/projects', projectId, 'invoices'],
    enabled: !!projectId,
  });

  const form = useForm<ClientPaymentFormData>({
    resolver: zodResolver(clientPaymentSchema),
    defaultValues: {
      projectId,
      amount: 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'check',
      checkNumber: '',
      description: '',
      notes: '',
      createdBy: typeof user.id === 'string' ? parseInt(user.id) : user.id || 1,
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: (data: ClientPaymentFormData) => apiRequest('/api/client-payments', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'client-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'budget-summary'] });
      setShowAddPayment(false);
      form.reset();
      toast({
        title: "Success",
        description: "Client payment recorded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to record client payment",
        variant: "destructive",
      });
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ClientPaymentFormData> }) => 
      apiRequest(`/api/client-payments/${id}`, 'PUT', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'client-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'budget-summary'] });
      setEditingPayment(null);
      toast({
        title: "Success",
        description: "Client payment updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update client payment",
        variant: "destructive",
      });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/client-payments/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'client-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'budget-summary'] });
      toast({
        title: "Success",
        description: "Client payment deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete client payment",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ClientPaymentFormData) => {
    if (editingPayment) {
      updatePaymentMutation.mutate({ id: editingPayment.id, data });
    } else {
      createPaymentMutation.mutate(data);
    }
  };

  const handleEdit = (payment: any) => {
    setEditingPayment(payment);
    form.reset({
      ...payment,
      paymentDate: formatDate(payment.paymentDate, 'yyyy-MM-dd', new Date().toISOString().split('T')[0]),
    });
    setShowAddPayment(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this payment?')) {
      deletePaymentMutation.mutate(id);
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'check': return 'Check';
      case 'wire': return 'Wire Transfer';
      case 'ach': return 'ACH';
      case 'credit_card': return 'Credit Card';
      default: return method;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (summaryLoading || paymentsLoading || invoicesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading budget information...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-gray-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Budget</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency((budgetSummary as any)?.totalEstimate || 0)}
                </p>
              </div>
              <Calculator className="h-8 w-8 text-theme-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Client Payments to Date</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency((budgetSummary as any)?.totalClientPayments || 0)}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Costs to Date</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency((budgetSummary as any)?.totalSubInvoices || 0)}
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Remaining to Bill to Client</p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(budgetSummary?.remainingToInvoiceClient || 0)}
                </p>
              </div>
              <FileText className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Remaining Estimated Costs</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(budgetSummary?.remainingToPaySubs || 0)}
                </p>
              </div>
              <Receipt className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Projected Margin</p>
                <p className={`text-2xl font-bold ${(budgetSummary?.projectedMargin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(budgetSummary?.projectedMargin || 0)}
                </p>
              </div>
              <DollarSign className={`h-8 w-8 ${(budgetSummary?.projectedMargin || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Client Payment Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Payments Received</span>
                <span>{Math.round(((budgetSummary?.totalClientPayments || 0) / (budgetSummary?.totalEstimate || 1)) * 100)}%</span>
              </div>
              <Progress 
                value={((budgetSummary?.totalClientPayments || 0) / (budgetSummary?.totalEstimate || 1)) * 100} 
                className="h-3" 
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Subcontractor Payment Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Invoices Paid</span>
                <span>{Math.round(((budgetSummary?.totalSubInvoices || 0) / (budgetSummary?.totalEstimate || 1)) * 100)}%</span>
              </div>
              <Progress 
                value={((budgetSummary?.totalSubInvoices || 0) / (budgetSummary?.totalEstimate || 1)) * 100} 
                className="h-3" 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="live-dashboard" className="space-y-4">
        <TabsList>
          <TabsTrigger value="live-dashboard">Live Budget Dashboard</TabsTrigger>
          <TabsTrigger value="payments">Client Payments to Date</TabsTrigger>
          <TabsTrigger value="invoices">Total Costs to Date</TabsTrigger>
          <TabsTrigger value="payment-tracking">Payment Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="live-dashboard" className="space-y-4">
          <LiveBudgetDashboard projectId={projectId} />
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Client Payments to Date</h3>
            <Dialog open={showAddPayment} onOpenChange={setShowAddPayment}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingPayment ? 'Edit Client Payment' : 'Record Client Payment'}
                  </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="paymentDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="paymentMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Method</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="check">Check</SelectItem>
                                <SelectItem value="wire">Wire Transfer</SelectItem>
                                <SelectItem value="ach">ACH</SelectItem>
                                <SelectItem value="credit_card">Credit Card</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="checkNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Check Number (if applicable)</FormLabel>
                            <FormControl>
                              <Input placeholder="Check #" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input placeholder="Payment description" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Additional notes..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowAddPayment(false);
                          setEditingPayment(null);
                          form.reset();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                      >
                        {editingPayment ? 'Update' : 'Record'} Payment
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="bg-gray-50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="text-left p-4 font-medium">Date</th>
                      <th className="text-left p-4 font-medium">Amount</th>
                      <th className="text-left p-4 font-medium">Method</th>
                      <th className="text-left p-4 font-medium">Description</th>
                      <th className="text-left p-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientPayments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-500">
                          No client payments recorded yet
                        </td>
                      </tr>
                    ) : (
                      clientPayments.map((payment: any) => (
                        <tr key={payment.id} className="border-b border-gray-100">
                          <td className="p-4">{formatDate(payment.paymentDate, 'MMM d, yyyy')}</td>
                          <td className="p-4 font-medium text-green-600">{formatCurrency(payment.amount)}</td>
                          <td className="p-4">
                            <Badge variant="outline">{getPaymentMethodLabel(payment.paymentMethod)}</Badge>
                          </td>
                          <td className="p-4">{payment.description || '—'}</td>
                          <td className="p-4">
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(payment)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(payment.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <h3 className="text-lg font-semibold">Total Costs to Date</h3>
          
          <Card className="bg-gray-50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="text-left p-4 font-medium">Subcontractor</th>
                      <th className="text-left p-4 font-medium">Trade</th>
                      <th className="text-left p-4 font-medium">Amount</th>
                      <th className="text-left p-4 font-medium">Status</th>
                      <th className="text-left p-4 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-500">
                          No subcontractor invoices yet
                        </td>
                      </tr>
                    ) : (
                      subInvoices.map((invoice: any) => (
                        <tr key={invoice.id} className="border-b border-gray-100">
                          <td className="p-4">{invoice.contactName || 'Unknown'}</td>
                          <td className="p-4">{invoice.trade}</td>
                          <td className="p-4 font-medium">{formatCurrency(invoice.amount)}</td>
                          <td className="p-4">
                            <Badge 
                              variant={
                                invoice.status === 'paid' ? 'default' :
                                invoice.status === 'approved' ? 'secondary' :
                                invoice.status === 'disputed' ? 'destructive' : 'outline'
                              }
                            >
                              {invoice.status}
                            </Badge>
                          </td>
                          <td className="p-4">{formatDate(invoice.submittedDate, 'MMM d, yyyy')}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment-tracking" className="space-y-4">
          <PaymentDashboard projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}