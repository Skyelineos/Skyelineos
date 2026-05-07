import { useMemo } from 'react';
import { useFinancialData, calculateFinancialSummary } from '../../hooks/useFinancialData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FinancialDataViewProps {
  projectId: number;
  className?: string;
}

/**
 * Component for displaying real-time financial data for a project
 * Uses Firebase Firestore for real-time updates with React Query caching
 */
export function FinancialDataView({ projectId, className = '' }: FinancialDataViewProps) {
  const { data: financials, isLoading, error } = useFinancialData(projectId);
  
  const summary = useMemo(() => 
    calculateFinancialSummary(financials || []), 
    [financials]
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={className}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load financial data: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No data state
  if (!financials || financials.length === 0) {
    return (
      <div className={className}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Project Financials
            </CardTitle>
            <CardDescription>
              Real-time financial tracking for project #{projectId}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No financial data found for this project.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);

  const getPaymentStatus = (amount: number, paid: number) => {
    const percentage = amount > 0 ? (paid / amount) * 100 : 0;
    if (percentage >= 100) return { status: 'Paid', variant: 'success' as const };
    if (percentage >= 50) return { status: 'Partial', variant: 'secondary' as const };
    return { status: 'Outstanding', variant: 'destructive' as const };
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Financial Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Summary
          </CardTitle>
          <CardDescription>
            Real-time financial tracking for project #{projectId}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(summary.totalAmount)}
              </div>
              <div className="text-sm text-muted-foreground">Total Amount</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.totalPaid)}
              </div>
              <div className="text-sm text-muted-foreground">Total Paid</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(summary.totalOutstanding)}
              </div>
              <div className="text-sm text-muted-foreground">Outstanding</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      {Object.keys(summary.categories).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Category Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(summary.categories)
                .sort(([,a], [,b]) => b.amount - a.amount)
                .map(([category, data]) => (
                <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{category}</div>
                    <div className="text-sm text-muted-foreground">
                      {data.count} line item{data.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-medium">{formatCurrency(data.amount)}</div>
                    <Badge variant={getPaymentStatus(data.amount, data.paid).variant}>
                      {formatCurrency(data.paid)} paid
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5" />
            Line Items
          </CardTitle>
          <CardDescription>
            {financials.length} financial record{financials.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {financials
              .sort((a, b) => new Date(b.dateIncurred).getTime() - new Date(a.dateIncurred).getTime())
              .map((financial) => {
                const paymentStatus = getPaymentStatus(financial.amount, financial.paidToDate);
                return (
                  <div key={financial.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1 space-y-1">
                      <div className="font-medium">{financial.lineItem}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{financial.category}</Badge>
                        <span>{financial.dateIncurred}</span>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="font-medium">{formatCurrency(financial.amount)}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant={paymentStatus.variant}>
                          {paymentStatus.status}
                        </Badge>
                        {financial.paidToDate > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {formatCurrency(financial.paidToDate)} paid
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}