import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { formatCurrency } from '@/lib/utils';
import { format, addDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
// Dynamic import to avoid loading Stripe when not needed
const loadStripeAsync = async () => {
  try {
    const { loadStripe } = await import('@stripe/stripe-js');
    return loadStripe;
  } catch (error) {
    console.warn('Stripe.js could not be loaded:', error);
    return null;
  }
};
import { 
  CreditCard, 
  DollarSign, 
  Calendar, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  Send,
  Eye,
  Download,
  Banknote,
  Wallet
} from 'lucide-react';

// Lazy load Stripe only when needed and if key is available
const getStripePromise = async () => {
  if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
    return null;
  }
  
  try {
    const loadStripeFn = await loadStripeAsync();
    if (!loadStripeFn) return null;
    
    return await loadStripeFn(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
  } catch (error) {
    console.error('Failed to load Stripe:', error);
    return null;
  }
};

const paymentSchema = z.object({
  invoiceId: z.number(),
  purchaseOrderId: z.number().optional(),
  projectId: z.number(),
  vendorId: z.number(),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentMethod: z.enum(['check', 'ach', 'wire', 'credit_card']),
  scheduledDate: z.string(),
  notes: z.string().optional(),
  createdBy: z.number(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentProcessingCenterProps {
  projectId: number;
}

export default function PaymentProcessingCenter({ projectId }: PaymentProcessingCenterProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showSchedulePayment, setShowSchedulePayment] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      projectId,
      amount: 0,
      paymentMethod: 'check',
      scheduledDate: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
      notes: '',
      createdBy: 1, // Mock user ID
    },
  });

  // Fetch payment processing records
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: [`/api/financial/payment-processing/${projectId}`],
    refetchInterval: 30000,
  });

  // Fetch approved invoices ready for payment
  const { data: approvedInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: [`/api/financial/approved-invoices/${projectId}`],
    refetchInterval: 30000,
  });

  // Fetch payment statistics
  const { data: paymentStats, isLoading: statsLoading } = useQuery({
    queryKey: [`/api/financial/payment-stats/${projectId}`],
    refetchInterval: 60000,
  });

  // Schedule payment mutation
  const schedulePaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const response = await apiRequest('/api/financial/schedule-payment', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/payment-processing/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/approved-invoices/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/payment-stats/${projectId}`] });
      setShowSchedulePayment(false);
      setSelectedInvoice(null);
      form.reset();
      toast({
        title: "Success",
        description: "Payment scheduled successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to schedule payment",
        variant: "destructive",
      });
    },
  });

  // Process payment mutation
  const processPaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const response = await apiRequest(`/api/financial/process-payment/${paymentId}`, {
        method: 'POST',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/payment-processing/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/payment-stats/${projectId}`] });
      toast({
        title: "Success",
        description: "Payment processed successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to process payment",
        variant: "destructive",
      });
    },
  });

  // Cancel payment mutation
  const cancelPaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      const response = await apiRequest(`/api/financial/cancel-payment/${paymentId}`, {
        method: 'POST',
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financial/payment-processing/${projectId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/financial/payment-stats/${projectId}`] });
      toast({
        title: "Success",
        description: "Payment cancelled successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to cancel payment",
        variant: "destructive",
      });
    },
  });

  // Process Stripe payment
  const processStripePayment = async (amount: number, vendorId: number) => {
    try {
      const stripe = await getStripePromise();
      if (!stripe) {
        throw new Error('Stripe payment processing is not configured. Please contact administrator.');
      }

      const response = await apiRequest('/api/create-payment-intent', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });

      const { clientSecret } = response;
      
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: {
            // This would typically come from Stripe Elements
            // For now, we'll handle this in the mutation
          }
        }
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return result;
    } catch (error) {
      throw error;
    }
  };

  const onSubmit = (data: PaymentFormData) => {
    if (selectedInvoice) {
      data.invoiceId = selectedInvoice.id;
      data.vendorId = selectedInvoice.vendorId;
      data.amount = parseFloat(selectedInvoice.amount);
    }
    schedulePaymentMutation.mutate(data);
  };

  const handleSchedulePayment = (invoice: any) => {
    setSelectedInvoice(invoice);
    form.reset({
      ...form.getValues(),
      invoiceId: invoice.id,
      vendorId: invoice.vendorId,
      amount: parseFloat(invoice.amount),
    });
    setShowSchedulePayment(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Calendar className="w-4 h-4" />;
      case 'processing':
        return <Clock className="w-4 h-4" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case 'check':
        return <Banknote className="w-4 h-4" />;
      case 'ach':
        return <Wallet className="w-4 h-4" />;
      case 'wire':
        return <Send className="w-4 h-4" />;
      case 'credit_card':
        return <CreditCard className="w-4 h-4" />;
      default:
        return <DollarSign className="w-4 h-4" />;
    }
  };

  const filteredPayments = payments?.filter(payment => 
    filterStatus === 'all' || payment.status === filterStatus
  ) || [];

  if (paymentsLoading || invoicesLoading || statsLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payment Processing Center</h2>
          <p className="text-gray-600">Manage vendor payments and process transactions</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Scheduled Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">
              {payments?.filter(p => p.status === 'scheduled').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              {formatCurrency(
                payments?.filter(p => p.status === 'scheduled')
                  .reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {payments?.filter(p => p.status === 'processing').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              {formatCurrency(
                payments?.filter(p => p.status === 'processing')
                  .reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {payments?.filter(p => p.status === 'completed').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              {formatCurrency(
                payments?.filter(p => p.status === 'completed')
                  .reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {payments?.filter(p => p.status === 'failed').length || 0}
            </div>
            <div className="text-sm text-gray-500">
              {formatCurrency(
                payments?.filter(p => p.status === 'failed')
                  .reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="payments">Payment Queue</TabsTrigger>
          <TabsTrigger value="invoices">Approved Invoices</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Payment Processing Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Invoice #</th>
                      <th className="text-left p-2">Vendor</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Method</th>
                      <th className="text-left p-2">Scheduled</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Reference</th>
                      <th className="text-center p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map((payment, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">INV-{payment.invoiceId}</td>
                        <td className="p-2">{payment.vendorName}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(payment.amount)}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {getPaymentMethodIcon(payment.paymentMethod)}
                            <span className="capitalize">{payment.paymentMethod.replace('_', ' ')}</span>
                          </div>
                        </td>
                        <td className="p-2">{format(new Date(payment.scheduledDate), 'MMM d, yyyy')}</td>
                        <td className="p-2">
                          <Badge className={getStatusColor(payment.status)}>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(payment.status)}
                              {payment.status}
                            </div>
                          </Badge>
                        </td>
                        <td className="p-2">{payment.paymentReference || '-'}</td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {payment.status === 'scheduled' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => processPaymentMutation.mutate(payment.id)}
                                disabled={processPaymentMutation.isPending}
                                title="Process Payment"
                              >
                                <Play className="w-4 h-4" />
                              </Button>
                            )}
                            {payment.status === 'processing' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Processing..."
                                disabled
                              >
                                <Clock className="w-4 h-4" />
                              </Button>
                            )}
                            {payment.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => processPaymentMutation.mutate(payment.id)}
                                disabled={processPaymentMutation.isPending}
                                title="Retry Payment"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            )}
                            {(payment.status === 'scheduled' || payment.status === 'processing') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelPaymentMutation.mutate(payment.id)}
                                disabled={cancelPaymentMutation.isPending}
                                title="Cancel Payment"
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Approved Invoices Ready for Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Invoice #</th>
                      <th className="text-left p-2">Vendor</th>
                      <th className="text-right p-2">Amount</th>
                      <th className="text-left p-2">Due Date</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-center p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvedInvoices?.map((invoice, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">INV-{invoice.id}</td>
                        <td className="p-2">{invoice.vendorName}</td>
                        <td className="p-2 text-right font-medium">{formatCurrency(invoice.amount)}</td>
                        <td className="p-2">{format(new Date(invoice.dueDate), 'MMM d, yyyy')}</td>
                        <td className="p-2">{invoice.description}</td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View Invoice"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSchedulePayment(invoice)}
                              title="Schedule Payment"
                            >
                              <Calendar className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Download Invoice"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Payment Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Total Payments This Month</span>
                    <span className="font-medium">{paymentStats?.totalPayments || 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Total Amount Processed</span>
                    <span className="font-medium">{formatCurrency(paymentStats?.totalAmount || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Average Processing Time</span>
                    <span className="font-medium">{paymentStats?.averageProcessingTime || '0'} hours</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span>Success Rate</span>
                    <span className="font-medium text-green-600">{paymentStats?.successRate || 0}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {paymentStats?.paymentMethods?.map((method: any, index: number) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center gap-2">
                        {getPaymentMethodIcon(method.method)}
                        <span className="capitalize">{method.method.replace('_', ' ')}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{method.count} payments</div>
                        <div className="text-sm text-gray-500">{formatCurrency(method.amount)}</div>
                      </div>
                    </div>
                  )) || (
                    <div className="text-center py-8 text-gray-500">
                      No payment method statistics available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Schedule Payment Dialog */}
      <Dialog open={showSchedulePayment} onOpenChange={setShowSchedulePayment}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Payment</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {selectedInvoice && (
                <div className="p-3 bg-gray-50 rounded">
                  <div className="font-medium">Invoice: INV-{selectedInvoice.id}</div>
                  <div className="text-sm text-gray-500">
                    {selectedInvoice.vendorName} • {formatCurrency(selectedInvoice.amount)}
                  </div>
                </div>
              )}
              
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="ach">ACH Transfer</SelectItem>
                        <SelectItem value="wire">Wire Transfer</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scheduled Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
                      <Textarea placeholder="Optional payment notes" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => {
                  setShowSchedulePayment(false);
                  setSelectedInvoice(null);
                  form.reset();
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={schedulePaymentMutation.isPending}>
                  Schedule Payment
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}