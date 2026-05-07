import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { DollarSign, Calendar, CreditCard, FileText, Link } from 'lucide-react';

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: any;
  projectId: number;
}

export default function AddPaymentModal({ isOpen, onClose, invoice, projectId }: AddPaymentModalProps) {
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'check',
    notes: '',
    paidBy: 'Project Manager'
  });
  const [linkToPO, setLinkToPO] = useState(false);
  const [selectedPO, setSelectedPO] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get available POs for linking
  const { data: availablePOs = [] } = useQuery({
    queryKey: [`/api/purchase-orders/available/${projectId}`],
    enabled: isOpen && linkToPO
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', `/api/invoices/${invoice.id}/payments`, data);
    },
    onSuccess: () => {
      toast({
        title: "Payment Added",
        description: "Payment has been successfully recorded and invoice status updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add payment",
        variant: "destructive",
      });
    }
  });

  const linkToPOMutation = useMutation({
    mutationFn: async (poId: string) => {
      return apiRequest('POST', `/api/invoices/${invoice.id}/link-po/${poId}`, {});
    },
    onSuccess: () => {
      toast({
        title: "Invoice Linked",
        description: "Invoice has been successfully linked to purchase order.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to link invoice to PO",
        variant: "destructive",
      });
    }
  });

  const resetForm = () => {
    setPaymentData({
      amount: '',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'check',
      notes: '',
      paidBy: 'Project Manager'
    });
    setLinkToPO(false);
    setSelectedPO('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const payment = {
      ...paymentData,
      amount: parseFloat(paymentData.amount)
    };

    try {
      // Link to PO first if requested
      if (linkToPO && selectedPO) {
        await linkToPOMutation.mutateAsync(selectedPO);
      }

      // Then add payment
      await addPaymentMutation.mutateAsync(payment);
    } catch (error) {
      console.error('Error in payment submission:', error);
    }
  };

  const remainingBalance = invoice ? invoice.balanceRemaining || invoice.amount : 0;
  const totalPaid = invoice ? parseFloat(invoice.totalPaid || '0') : 0;
  const paymentAmount = parseFloat(paymentData.amount || '0');
  const newBalance = remainingBalance - paymentAmount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Add Payment to Invoice
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <div className="space-y-6">
            {/* Invoice Summary */}
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="text-lg">Invoice Summary</CardTitle>
                <CardDescription>
                  {invoice.invoiceNumber} • {invoice.trade} • {invoice.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm text-gray-600">Invoice Amount</Label>
                    <p className="text-lg font-semibold">${invoice.amount?.toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-gray-600">Amount Paid</Label>
                    <p className="text-lg font-semibold text-green-600">${totalPaid.toLocaleString()}</p>
                  </div>
                </div>
                <div className="pt-2 border-t">
                  <Label className="text-sm text-gray-600">Balance Remaining</Label>
                  <p className="text-xl font-bold text-theme-primary">${remainingBalance.toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Payment Amount
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                    className="mt-1"
                    required
                  />
                  {paymentAmount > 0 && (
                    <p className="text-sm text-gray-600 mt-1">
                      New balance: ${newBalance.toLocaleString()}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="paymentDate" className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Payment Date
                  </Label>
                  <Input
                    id="paymentDate"
                    type="date"
                    value={paymentData.paymentDate}
                    onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                    className="mt-1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="paymentMethod" className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Payment Method
                  </Label>
                  <Select
                    value={paymentData.paymentMethod}
                    onValueChange={(value) => setPaymentData({ ...paymentData, paymentMethod: value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="wire">Wire Transfer</SelectItem>
                      <SelectItem value="ach">ACH</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="paidBy">Paid By</Label>
                  <Input
                    id="paidBy"
                    value={paymentData.paidBy}
                    onChange={(e) => setPaymentData({ ...paymentData, paidBy: e.target.value })}
                    placeholder="Who made the payment?"
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Link to PO Option */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="linkToPO"
                    checked={linkToPO}
                    onChange={(e) => setLinkToPO(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="linkToPO" className="flex items-center gap-2">
                    <Link className="w-4 h-4" />
                    Link to Purchase Order
                  </Label>
                </div>

                {linkToPO && (
                  <div>
                    <Label htmlFor="selectedPO">Select Purchase Order</Label>
                    <Select value={selectedPO} onValueChange={setSelectedPO}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose a PO to link..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePOs.map((po: any) => (
                          <SelectItem key={po.id} value={po.id.toString()}>
                            {po.poNumber} - {po.trade} - ${po.amount?.toLocaleString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="notes" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Add any payment notes or reference information..."
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="mt-1"
                  rows={3}
                />
              </div>

              {/* Payment Status Preview */}
              {paymentAmount > 0 && (
                <Card className="bg-gray-50 bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-theme-primary">New invoice status:</span>
                      <Badge variant={newBalance <= 0 ? "default" : "secondary"}>
                        {newBalance <= 0 ? 'Paid' : 'Partial'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={addPaymentMutation.isPending || linkToPOMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addPaymentMutation.isPending || linkToPOMutation.isPending}
                >
                  {addPaymentMutation.isPending || linkToPOMutation.isPending ? 'Processing...' : 'Add Payment'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}