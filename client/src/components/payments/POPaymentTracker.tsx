import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { DollarSign, FileText, Clock, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

interface POPaymentTrackerProps {
  purchaseOrder: any;
  linkedInvoices?: any[];
  onViewInvoice?: (invoiceId: number) => void;
  onLinkInvoice?: (poId: number) => void;
  className?: string;
}

export default function POPaymentTracker({ 
  purchaseOrder, 
  linkedInvoices = [], 
  onViewInvoice, 
  onLinkInvoice,
  className = "" 
}: POPaymentTrackerProps) {
  
  const po = purchaseOrder;
  const totalAmount = po.amount || 0;
  const totalPaid = parseFloat(po.totalPaid || '0');
  const balanceRemaining = parseFloat(po.balanceRemaining || totalAmount.toString());
  const paymentProgress = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
  
  // Parse applied invoices with error handling
  const appliedInvoices = (() => {
    try {
      return po.appliedInvoices && po.appliedInvoices !== '' ? JSON.parse(po.appliedInvoices) : [];
    } catch (error) {
      console.warn('Failed to parse appliedInvoices JSON:', error);
      return [];
    }
  })();
  
  // Get status color and icon
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'partial':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'unpaid':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4" />;
      case 'partial':
        return <Clock className="w-4 h-4" />;
      case 'unpaid':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <Card className={`${className} hover:shadow-md transition-shadow`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {po.poNumber}
            </CardTitle>
            <CardDescription>
              {po.trade} • {po.description}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(po.poStatus || 'unpaid')}>
              {getStatusIcon(po.poStatus || 'unpaid')}
              {po.poStatus || 'unpaid'}
            </Badge>
            {onLinkInvoice && (
              <Button variant="outline" size="sm" onClick={() => onLinkInvoice(po.id)}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Payment Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Invoice Progress</span>
            <span className="font-medium">{Math.round(paymentProgress)}%</span>
          </div>
          <Progress value={paymentProgress} className="h-2" />
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-gray-600">PO Amount</span>
              <p className="font-semibold">${totalAmount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-600">Invoiced</span>
              <p className="font-semibold text-green-600">${totalPaid.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-600">Remaining</span>
              <p className="font-semibold text-theme-primary">${balanceRemaining.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Applied Invoices */}
        {appliedInvoices.length > 0 && (
          <div className="space-y-3">
            <Separator />
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Applied Invoices ({appliedInvoices.length})
            </h4>
            <div className="space-y-2">
              {appliedInvoices.map((invoice: any, index: number) => (
                <div key={invoice.invoiceId || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium">{invoice.invoiceNumber}</p>
                      <p className="text-xs text-gray-500">
                        ${invoice.totalPaid.toLocaleString()} of ${invoice.amount.toLocaleString()} paid
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        invoice.balanceRemaining <= 0 ? 'text-green-600' : 'text-orange-600'
                      }`}
                    >
                      {invoice.balanceRemaining <= 0 ? 'Paid' : 'Partial'}
                    </Badge>
                    {onViewInvoice && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => onViewInvoice(invoice.invoiceId)}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Invoices Message */}
        {appliedInvoices.length === 0 && (
          <div className="text-center p-4 border-2 border-dashed border-gray-200 rounded-lg">
            <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No invoices linked to this PO</p>
            {onLinkInvoice && (
              <Button variant="outline" size="sm" onClick={() => onLinkInvoice(po.id)} className="mt-2">
                <ExternalLink className="w-4 h-4 mr-1" />
                Link Invoice
              </Button>
            )}
          </div>
        )}

        {/* PO Details */}
        <div className="pt-3 border-t text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Created:</span>
            <span>{format(new Date(po.createdAt), 'MMM dd, yyyy')}</span>
          </div>
          {po.sentDate && (
            <div className="flex justify-between">
              <span>Sent:</span>
              <span>{format(new Date(po.sentDate), 'MMM dd, yyyy')}</span>
            </div>
          )}
          {po.signedDate && (
            <div className="flex justify-between">
              <span>Signed:</span>
              <span>{format(new Date(po.signedDate), 'MMM dd, yyyy')}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>Subcontractor:</span>
            <span className="text-theme-primary">{po.subcontractorName}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}