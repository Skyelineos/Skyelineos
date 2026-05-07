import { useState, useMemo } from 'react';
import { useFinancialData } from '../../hooks/useFinancialData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, DollarSign, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { forecastCashFlow, identifyCashFlowIssues, type ScheduleTask, type CashFlowForecastPoint } from '../../utils/forecast';
import type { FirebaseFinancial } from '../../../../shared/schema';

interface FinancialDashboardProps {
  projectId: number;
  className?: string;
  schedule?: ScheduleTask[]; // Optional schedule data for forecasting
}

interface ChartDataPoint {
  date: string;
  cumulativeCashFlow: number;
  formattedDate: string;
}

/**
 * Comprehensive Financial Dashboard for project financial tracking
 * Features table view with date filtering and cumulative cash flow chart
 */
export function FinancialDashboard({ projectId, className = '', schedule = [] }: FinancialDashboardProps) {
  const { data: financials, isLoading, error } = useFinancialData(projectId);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showForecast, setShowForecast] = useState<boolean>(true);

  // Format currency using accounting format
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format negative amounts with parentheses (accounting style)
  const formatAccountingCurrency = (amount: number): string => {
    const absAmount = Math.abs(amount);
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(absAmount);
    
    return amount < 0 ? `(${formatted})` : formatted;
  };

  // Filter financial data by date range
  const filteredFinancials = useMemo(() => {
    if (!financials) return [];

    return financials.filter((financial) => {
      const incurredDate = new Date(financial.dateIncurred);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      if (start && incurredDate < start) return false;
      if (end && incurredDate > end) return false;
      return true;
    });
  }, [financials, startDate, endDate]);

  // Calculate cash flow forecast data combining historical and forecast
  const { chartData, cashFlowIssues } = useMemo(() => {
    if (!financials || financials.length === 0) {
      return { chartData: [], cashFlowIssues: [] };
    }

    // Generate forecast points
    const forecastPoints = forecastCashFlow(schedule, financials);
    const issues = identifyCashFlowIssues(forecastPoints);
    
    // Convert forecast points to chart data format
    const chartPoints: (ChartDataPoint & { 
      forecast?: number; 
      historical?: number; 
      isForecasted?: boolean;
    })[] = forecastPoints.map(point => ({
      date: point.date,
      cumulativeCashFlow: point.cumulative,
      forecast: point.forecast,
      historical: point.historical,
      isForecasted: !point.historical || point.forecast !== undefined,
      formattedDate: new Date(point.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    }));

    return { chartData: chartPoints, cashFlowIssues: issues };
  }, [financials, schedule]);

  // Calculate totals for the filtered data
  const totals = useMemo(() => {
    const totalAmount = filteredFinancials.reduce((sum, f) => sum + f.amount, 0);
    const totalPaid = filteredFinancials.reduce((sum, f) => sum + f.paidToDate, 0);
    const totalBalance = totalAmount - totalPaid;

    return { totalAmount, totalPaid, totalBalance };
  }, [filteredFinancials]);

  const getBalanceStatus = (balance: number) => {
    if (balance === 0) return { variant: 'success' as const, text: 'Paid' };
    if (balance > 0) return { variant: 'destructive' as const, text: 'Outstanding' };
    return { variant: 'secondary' as const, text: 'Overpaid' };
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="h-64 w-full" />
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
              Financial Dashboard - Project #{projectId}
            </CardTitle>
            <CardDescription>
              Comprehensive financial tracking and cash flow analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No financial data found for this project. Add financial records to see analysis.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header and Date Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Financial Dashboard - Project #{projectId}
          </CardTitle>
          <CardDescription>
            Real-time financial tracking with {financials.length} records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Date Range Filters and Forecast Toggle */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="start-date" className="text-sm font-medium">
                  Date Range:
                </Label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 max-w-lg">
                <div>
                  <Label htmlFor="start-date" className="sr-only">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="Start date"
                    className="w-full"
                  />
                </div>
                <div>
                  <Label htmlFor="end-date" className="sr-only">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder="End date"
                    className="w-full"
                  />
                </div>
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Clear filters
                </button>
              )}
              
              {/* Forecast Toggle */}
              {schedule.length > 0 && (
                <div className="flex items-center gap-2 ml-4">
                  <Switch
                    id="show-forecast"
                    checked={showForecast}
                    onCheckedChange={setShowForecast}
                  />
                  <Label htmlFor="show-forecast" className="text-sm font-medium">
                    Show Forecast
                  </Label>
                </div>
              )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {formatAccountingCurrency(totals.totalAmount)}
                </div>
                <div className="text-sm text-muted-foreground">Total Amount</div>
              </div>
              <div className="text-center p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {formatAccountingCurrency(totals.totalPaid)}
                </div>
                <div className="text-sm text-muted-foreground">Total Paid</div>
              </div>
              <div className="text-center p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/20">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {formatAccountingCurrency(totals.totalBalance)}
                </div>
                <div className="text-sm text-muted-foreground">Balance</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash Flow Issues Alert */}
      {cashFlowIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Cash Flow Alerts
            </CardTitle>
            <CardDescription>
              Potential issues identified in your cash flow forecast
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cashFlowIssues.map((issue, index) => (
                <Alert key={index} variant={issue.severity === 'high' ? 'destructive' : 'default'}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{issue.date}:</strong> {issue.description}
                    {issue.amount && ` - $${issue.amount.toLocaleString()}`}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Financial Records</CardTitle>
          <CardDescription>
            {filteredFinancials.length} of {financials.length} records
            {(startDate || endDate) && ' (filtered)'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-semibold text-muted-foreground">Line Item</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Category</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Amount</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Paid To Date</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Balance</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Date Incurred</th>
                </tr>
              </thead>
              <tbody>
                {filteredFinancials
                  .sort((a, b) => new Date(b.dateIncurred).getTime() - new Date(a.dateIncurred).getTime())
                  .map((financial) => {
                    const balance = financial.amount - financial.paidToDate;
                    const balanceStatus = getBalanceStatus(balance);
                    
                    return (
                      <tr key={financial.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                        <td className="p-3">
                          <div className="font-medium text-foreground">{financial.lineItem}</div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {financial.category}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className="font-semibold text-foreground">
                            {formatAccountingCurrency(financial.amount)}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className="text-green-600 dark:text-green-400 font-semibold">
                            {formatAccountingCurrency(financial.paidToDate)}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className={`font-mono font-semibold ${
                              balance > 0 ? 'text-red-600 dark:text-red-400' : 
                              balance < 0 ? 'text-blue-600 dark:text-blue-400' : 
                              'text-green-600 dark:text-green-400'
                            }`}>
                              {formatAccountingCurrency(balance)}
                            </span>
                            <Badge variant={balanceStatus.variant} className="text-xs">
                              {balanceStatus.text}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-sm text-muted-foreground">
                            {new Date(financial.dateIncurred).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Cash Flow Chart with Forecast */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Cumulative Cash Flow {showForecast && schedule.length > 0 ? '& Forecast' : ''}
            </CardTitle>
            <CardDescription>
              {showForecast && schedule.length > 0 
                ? 'Historical cash flow with projected future payments from scheduled tasks'
                : 'Visual representation of cash flow over time based on payment dates'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="formattedDate"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={Math.max(0, Math.floor(chartData.length / 8))}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => formatCurrency(value).replace('$', '$')}
                  />
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => {
                      const { payload } = props;
                      const isForecasted = payload?.isForecasted;
                      const label = isForecasted ? 'Forecasted Cash Flow' : 'Historical Cash Flow';
                      return [formatCurrency(value), label];
                    }}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  />
                  
                  {/* Historical cash flow line */}
                  <Line 
                    type="monotone" 
                    dataKey="cumulativeCashFlow" 
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { payload } = props;
                      return payload?.isForecasted ? null : { 
                        fill: 'hsl(var(--primary))', 
                        strokeWidth: 2, 
                        r: 4 
                      };
                    }}
                    connectNulls={false}
                    activeDot={{ r: 6, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                  />
                  
                  {/* Forecast line (if enabled and schedule provided) */}
                  {showForecast && schedule.length > 0 && (
                    <Line 
                      type="monotone" 
                      dataKey="cumulativeCashFlow" 
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={(props: any) => {
                        const { payload } = props;
                        return payload?.isForecasted ? { 
                          fill: 'hsl(var(--muted-foreground))', 
                          strokeWidth: 2, 
                          r: 3 
                        } : null;
                      }}
                      connectNulls={false}
                      activeDot={{ 
                        r: 5, 
                        stroke: 'hsl(var(--muted-foreground))', 
                        strokeWidth: 2,
                        fill: 'hsl(var(--background))'
                      }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* Chart Legend */}
            {showForecast && schedule.length > 0 && (
              <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-primary"></div>
                  <span className="text-sm text-muted-foreground">Historical</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-muted-foreground border-dashed border-t-2 border-muted-foreground"></div>
                  <span className="text-sm text-muted-foreground">Forecast</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}