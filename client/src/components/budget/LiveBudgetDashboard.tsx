import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  PieChart,
  Calculator,
  Target,
  Activity,
  Zap
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPieChart, Cell, Pie } from 'recharts';

interface LiveBudgetDashboardProps {
  projectId: number;
}

interface TradeData {
  trade: string;
  estimated: number;
  invoiced: number;
  paid: number;
  remaining: number;
  variance: number;
  variancePercent: number;
  status: 'under' | 'over' | 'on-track' | 'complete';
}

interface BudgetSummary {
  totalEstimate: number;
  totalInvoiced: number;
  totalPaidToSubs: number;
  totalReceivedFromClient: number;
  remainingFromClient: number;
  overallVariance: number;
  overallVariancePercent: number;
  profitMargin: number;
  cashFlowStatus: 'positive' | 'negative' | 'neutral';
}

export default function LiveBudgetDashboard({ projectId }: LiveBudgetDashboardProps) {
  const [activeView, setActiveView] = useState<'overview' | 'trades' | 'charts'>('overview');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch approved estimates
  const { data: estimates = [] } = useQuery({
    queryKey: ['/api/estimates/approved', projectId],
    refetchInterval: autoRefresh ? 30000 : false, // Refresh every 30 seconds
  });

  // Fetch invoices
  const { data: invoices = [] } = useQuery({
    queryKey: ['/api/invoices/project', projectId],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch client payments
  const { data: clientPayments = [] } = useQuery({
    queryKey: ['/api/projects', projectId, 'client-payments'],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fetch purchase orders
  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['/api/purchase-orders/project', projectId],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Calculate trade-level budget data
  const tradeData: TradeData[] = useMemo(() => {
    const trades = new Map<string, TradeData>();

    // Process estimates to get baseline
    estimates.forEach((estimate: any) => {
      const trade = estimate.trade || 'General';
      if (!trades.has(trade)) {
        trades.set(trade, {
          trade,
          estimated: 0,
          invoiced: 0,
          paid: 0,
          remaining: 0,
          variance: 0,
          variancePercent: 0,
          status: 'on-track'
        });
      }
      
      const tradeInfo = trades.get(trade)!;
      tradeInfo.estimated += estimate.totalCost || 0;
    });

    // Process Purchase Orders and their linked invoices
    purchaseOrders.forEach((po: any) => {
      const trade = po.trade || 'General';
      if (!trades.has(trade)) {
        trades.set(trade, {
          trade,
          estimated: 0,
          invoiced: 0,
          paid: 0,
          remaining: 0,
          variance: 0,
          variancePercent: 0,
          status: 'on-track'
        });
      }
      
      const tradeInfo = trades.get(trade)!;
      
      // Find invoices linked to this PO
      const linkedInvoices = invoices.filter((invoice: any) => {
        // Check if invoice is linked to this PO by matching trade and contactId
        return invoice.trade === po.trade && invoice.contactId === po.contactId;
      });
      
      // Sum up invoice amounts for this PO
      const totalInvoiced = linkedInvoices.reduce((sum: number, invoice: any) => sum + (invoice.amount || 0), 0);
      const totalPaid = linkedInvoices
        .filter((invoice: any) => invoice.status === 'paid')
        .reduce((sum: number, invoice: any) => sum + (invoice.amount || 0), 0);
      
      tradeInfo.invoiced += totalInvoiced;
      tradeInfo.paid += totalPaid;
    });

    // Process any standalone invoices not linked to POs
    invoices.forEach((invoice: any) => {
      const trade = invoice.trade || 'General';
      const hasMatchingPO = purchaseOrders.some((po: any) => 
        po.trade === invoice.trade && po.contactId === invoice.contactId
      );
      
      // Only process if no matching PO found (standalone invoice)
      if (!hasMatchingPO) {
        if (!trades.has(trade)) {
          trades.set(trade, {
            trade,
            estimated: 0,
            invoiced: 0,
            paid: 0,
            remaining: 0,
            variance: 0,
            variancePercent: 0,
            status: 'on-track'
          });
        }
        
        const tradeInfo = trades.get(trade)!;
        tradeInfo.invoiced += invoice.amount || 0;
        
        if (invoice.status === 'paid') {
          tradeInfo.paid += invoice.amount || 0;
        }
      }
    });

    // Calculate variance and status for each trade
    trades.forEach((tradeInfo, trade) => {
      tradeInfo.remaining = tradeInfo.estimated - tradeInfo.paid;
      tradeInfo.variance = tradeInfo.invoiced - tradeInfo.estimated;
      tradeInfo.variancePercent = tradeInfo.estimated > 0 ? (tradeInfo.variance / tradeInfo.estimated) * 100 : 0;
      
      if (tradeInfo.paid >= tradeInfo.estimated) {
        tradeInfo.status = 'complete';
      } else if (tradeInfo.variancePercent > 10) {
        tradeInfo.status = 'over';
      } else if (tradeInfo.variancePercent < -5) {
        tradeInfo.status = 'under';
      } else {
        tradeInfo.status = 'on-track';
      }
    });

    return Array.from(trades.values()).sort((a, b) => b.estimated - a.estimated);
  }, [estimates, invoices, purchaseOrders]);

  // Calculate budget summary
  const budgetSummary: BudgetSummary = useMemo(() => {
    const totalEstimate = tradeData.reduce((sum, trade) => sum + trade.estimated, 0);
    const totalInvoiced = tradeData.reduce((sum, trade) => sum + trade.invoiced, 0);
    const totalPaidToSubs = tradeData.reduce((sum, trade) => sum + trade.paid, 0);
    const totalReceivedFromClient = clientPayments.reduce((sum: number, payment: any) => sum + (payment.amount || 0), 0);
    const remainingFromClient = totalEstimate - totalReceivedFromClient;
    const overallVariance = totalInvoiced - totalEstimate;
    const overallVariancePercent = totalEstimate > 0 ? (overallVariance / totalEstimate) * 100 : 0;
    const profitMargin = totalEstimate > 0 ? ((totalReceivedFromClient - totalPaidToSubs) / totalReceivedFromClient) * 100 : 0;
    
    let cashFlowStatus: 'positive' | 'negative' | 'neutral' = 'neutral';
    const cashFlow = totalReceivedFromClient - totalPaidToSubs;
    if (cashFlow > 0) cashFlowStatus = 'positive';
    else if (cashFlow < 0) cashFlowStatus = 'negative';

    return {
      totalEstimate,
      totalInvoiced,
      totalPaidToSubs,
      totalReceivedFromClient,
      remainingFromClient,
      overallVariance,
      overallVariancePercent,
      profitMargin,
      cashFlowStatus
    };
  }, [tradeData, clientPayments]);

  // Chart data
  const chartData = tradeData.map(trade => ({
    name: trade.trade,
    estimated: trade.estimated,
    invoiced: trade.invoiced,
    paid: trade.paid,
    variance: trade.variance
  }));

  const pieData = tradeData.map(trade => ({
    name: trade.trade,
    value: trade.estimated,
    color: getTradeColor(trade.trade)
  }));

  function getTradeColor(trade: string): string {
    const colors = {
      'Foundation': '#8B5CF6',
      'Framing': '#06B6D4',
      'Electrical': '#F59E0B',
      'Plumbing': '#10B981',
      'HVAC': '#EF4444',
      'Roofing': '#6B7280',
      'Insulation': '#EC4899',
      'Drywall': '#84CC16',
      'Flooring': '#F97316',
      'Painting': '#3B82F6',
      'General': '#64748B'
    };
    return colors[trade as keyof typeof colors] || '#64748B';
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'over':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'under':
        return <TrendingDown className="w-4 h-4 text-theme-primary" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'complete':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'over':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'under':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  }

  function getVarianceColor(variance: number): string {
    if (variance > 0) return 'text-red-600';
    if (variance < 0) return 'text-green-600';
    return 'text-gray-600';
  }

  function getCashFlowColor(status: string): string {
    switch (status) {
      case 'positive':
        return 'text-green-600';
      case 'negative':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Auto-Refresh Toggle */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Live Budget Dashboard</h2>
          <p className="text-gray-600">Real-time project financial tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="w-4 h-4 mr-2" />
            {autoRefresh ? 'Live' : 'Manual'}
          </Button>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-500">
              {autoRefresh ? 'Auto-refresh active' : 'Auto-refresh paused'}
            </span>
          </div>
        </div>
      </div>

      {/* Budget Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Target className="w-4 h-4 text-theme-primary" />
              Total Estimate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">
              {formatCurrency(budgetSummary.totalEstimate)}
            </div>
            <div className="text-sm text-gray-500">
              {tradeData.length} trade categories
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              Received from Client
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(budgetSummary.totalReceivedFromClient)}
            </div>
            <div className="text-sm text-gray-500">
              {formatCurrency(budgetSummary.remainingFromClient)} remaining
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-purple-600" />
              Paid to Subs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(budgetSummary.totalPaidToSubs)}
            </div>
            <div className="text-sm text-gray-500">
              {formatCurrency(budgetSummary.totalInvoiced)} invoiced
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              Cash Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getCashFlowColor(budgetSummary.cashFlowStatus)}`}>
              {formatCurrency(budgetSummary.totalReceivedFromClient - budgetSummary.totalPaidToSubs)}
            </div>
            <div className="text-sm text-gray-500">
              {budgetSummary.profitMargin.toFixed(1)}% profit margin
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Variance Alert */}
      {Math.abs(budgetSummary.overallVariancePercent) > 5 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600" />
              <div>
                <div className="font-medium text-orange-800">
                  Budget Variance Alert
                </div>
                <div className="text-sm text-orange-700">
                  Project is {budgetSummary.overallVariancePercent > 0 ? 'over' : 'under'} budget by{' '}
                  {formatCurrency(Math.abs(budgetSummary.overallVariance))} ({Math.abs(budgetSummary.overallVariancePercent).toFixed(1)}%)
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs value={activeView} onValueChange={(value) => setActiveView(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">By Trade</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Budget Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Budget Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Estimated</span>
                    <span className="font-medium">{formatCurrency(budgetSummary.totalEstimate)}</span>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Invoiced</span>
                    <span className="font-medium">{formatCurrency(budgetSummary.totalInvoiced)}</span>
                  </div>
                  <Progress 
                    value={budgetSummary.totalEstimate > 0 ? (budgetSummary.totalInvoiced / budgetSummary.totalEstimate) * 100 : 0} 
                    className="h-2"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Paid</span>
                    <span className="font-medium">{formatCurrency(budgetSummary.totalPaidToSubs)}</span>
                  </div>
                  <Progress 
                    value={budgetSummary.totalEstimate > 0 ? (budgetSummary.totalPaidToSubs / budgetSummary.totalEstimate) * 100 : 0} 
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Project Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Project Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Cash Flow Status</span>
                  <Badge variant="outline" className={getCashFlowColor(budgetSummary.cashFlowStatus)}>
                    {budgetSummary.cashFlowStatus}
                  </Badge>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Overall Variance</span>
                  <span className={`font-medium ${getVarianceColor(budgetSummary.overallVariance)}`}>
                    {budgetSummary.overallVariance >= 0 ? '+' : ''}{formatCurrency(budgetSummary.overallVariance)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Profit Margin</span>
                  <span className={`font-medium ${budgetSummary.profitMargin >= 15 ? 'text-green-600' : budgetSummary.profitMargin >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {budgetSummary.profitMargin.toFixed(1)}%
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Completed Trades</span>
                  <span className="font-medium">
                    {tradeData.filter(t => t.status === 'complete').length} / {tradeData.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trades" className="space-y-4">
          <div className="grid gap-4">
            {tradeData.map((trade, index) => {
              // Get POs and linked invoices for this trade
              const tradePOs = purchaseOrders.filter((po: any) => po.trade === trade.trade);
              const tradeInvoices = invoices.filter((invoice: any) => invoice.trade === trade.trade);
              
              return (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getTradeColor(trade.trade) }}
                        />
                        <CardTitle className="text-lg">{trade.trade}</CardTitle>
                        {getStatusIcon(trade.status)}
                      </div>
                      <Badge variant="outline" className={getStatusColor(trade.status)}>
                        {trade.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                      <div>
                        <div className="text-gray-500">Estimated</div>
                        <div className="font-medium">{formatCurrency(trade.estimated)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Invoiced</div>
                        <div className="font-medium">{formatCurrency(trade.invoiced)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Paid</div>
                        <div className="font-medium">{formatCurrency(trade.paid)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Variance</div>
                        <div className={`font-medium ${getVarianceColor(trade.variance)}`}>
                          {trade.variance >= 0 ? '+' : ''}{formatCurrency(trade.variance)}
                          {trade.estimated > 0 && (
                            <span className="ml-1 text-xs">
                              ({trade.variancePercent >= 0 ? '+' : ''}{trade.variancePercent.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* PO and Invoice Details */}
                    {tradePOs.length > 0 && (
                      <div className="border-t pt-4">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          Purchase Orders & Invoices
                        </div>
                        <div className="space-y-2">
                          {tradePOs.map((po: any, poIndex: number) => {
                            const poInvoices = tradeInvoices.filter((inv: any) => inv.contactId === po.contactId);
                            const totalInvoiced = poInvoices.reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                            const totalPaid = poInvoices
                              .filter((inv: any) => inv.status === 'paid')
                              .reduce((sum: number, inv: any) => sum + (inv.amount || 0), 0);
                            
                            return (
                              <div key={poIndex} className="bg-gray-50 p-3 rounded-lg">
                                <div className="flex justify-between items-start">
                                  <div className="text-sm">
                                    <div className="font-medium">PO #{po.id} - {po.contactName}</div>
                                    <div className="text-gray-500">PO Amount: {formatCurrency(po.amount)}</div>
                                  </div>
                                  <div className="text-sm text-right">
                                    <div className="font-medium">
                                      Invoiced: {formatCurrency(totalInvoiced)}
                                    </div>
                                    <div className="text-gray-500">
                                      Paid: {formatCurrency(totalPaid)}
                                    </div>
                                  </div>
                                </div>
                                {poInvoices.length > 0 && (
                                  <div className="mt-2 text-xs text-gray-600">
                                    {poInvoices.length} invoice(s) linked to this PO
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {trade.estimated > 0 && (
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Progress</span>
                          <span>{((trade.paid / trade.estimated) * 100).toFixed(1)}% complete</span>
                        </div>
                        <Progress 
                          value={(trade.paid / trade.estimated) * 100} 
                          className="h-2"
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="charts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Budget vs Actual by Trade</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                    <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                    <Bar dataKey="estimated" fill="#3B82F6" name="Estimated" />
                    <Bar dataKey="invoiced" fill="#EF4444" name="Invoiced" />
                    <Bar dataKey="paid" fill="#10B981" name="Paid" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Budget Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}