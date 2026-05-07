import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DollarSign, Calendar, Receipt, Plus, Eye } from 'lucide-react';
import { format } from 'date-fns';

interface PaymentHistoryCardProps {
  invoice: any;
  onAddPayment: () => void;
  onViewDetails: () => void;
  showActions?: boolean;
}

export default function PaymentHistoryCard({ 
  invoice, 
  onAddPayment, 
  onViewDetails, 
  showActions = true 
}: PaymentHistoryCardProps) {
  
  const totalAmount = invoice.amount || 0;
  const totalPaid = parseFloat(invoice.totalPaid || '0');
  const balanceRemaining = parseFloat(invoice.balanceRemaining || totalAmount.toString());
  const paymentProgress = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
  
  // Parse payments array with error handling
  const payments = (() => {
    try {
      return invoice.payments && invoice.payments !== '' ? JSON.parse(invoice.payments) : [];
    } catch (error) {
      console.warn('Failed to parse payments JSON:', error);
      return [];
    }
  })();
  
  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'partial':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'approved':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return '✓';
      case 'partial':
        return '⚡';
      case 'approved':
        return '👍';
      case 'pending':
        return '⏳';
      default:
        return '•';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="w-5 h-5" />
              {invoice.invoiceNumber}
            </CardTitle>
            <CardDescription>
              {invoice.trade} • {invoice.description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(invoice.status)}>
              {getStatusIcon(invoice.status)} {invoice.status}
            </Badge>
            {showActions && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={onViewDetails}>
                  <Eye className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={onAddPayment}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Payment Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Payment Progress</span>
            <span className="font-medium">{Math.round(paymentProgress)}%</span>
          </div>
          <Progress value={paymentProgress} className="h-2" />
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Amount</span>
              <p className="font-semibold">${totalAmount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-600">Paid</span>
              <p className="font-semibold text-green-600">${totalPaid.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-600">Remaining</span>
              <p className="font-semibold text-theme-primary">${balanceRemaining.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Recent Payments */}
        {payments.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Recent Payments</h4>
            <div className="space-y-2">
              {payments.slice(-3).map((payment: any, index: number) => (
                <div key={payment.id || index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm">
                      {format(new Date(payment.paymentDate), 'MMM dd, yyyy')}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {payment.paymentMethod}
                    </Badge>
                  </div>
                  <span className="text-sm font-medium">
                    ${payment.amount.toLocaleString()}
                  </span>
                </div>
              ))}
              {payments.length > 3 && (
                <p className="text-xs text-gray-500 text-center">
                  +{payments.length - 3} more payments
                </p>
              )}
            </div>
          </div>
        )}

        {/* No Payments Message */}
        {payments.length === 0 && (
          <div className="text-center p-4 border-2 border-dashed border-gray-200 rounded-lg">
            <DollarSign className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No payments recorded yet</p>
            {showActions && (
              <Button variant="outline" size="sm" onClick={onAddPayment} className="mt-2">
                <Plus className="w-4 h-4 mr-1" />
                Add First Payment
              </Button>
            )}
          </div>
        )}

        {/* Invoice Details */}
        <div className="pt-3 border-t text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Submitted:</span>
            <span>{format(new Date(invoice.submittedDate), 'MMM dd, yyyy')}</span>
          </div>
          {invoice.workPeriod && (
            <div className="flex justify-between">
              <span>Work Period:</span>
              <span>{invoice.workPeriod}</span>
            </div>
          )}
          {invoice.poId && (
            <div className="flex justify-between">
              <span>Linked PO:</span>
              <span className="text-theme-primary">#{invoice.poId}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}