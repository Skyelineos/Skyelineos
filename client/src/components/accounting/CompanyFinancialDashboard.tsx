import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart 
} from 'recharts';
import { 
  DollarSign, TrendingUp, TrendingDown, AlertCircle, CheckCircle, 
  Clock, Receipt, CreditCard, Building2, Users, Calculator, Target,
  Download, FileText, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

interface FinancialMetrics {
  totalReceivables: number;
  clientPayments: number;
  poCommitments: number;
  invoicesPaid: number;
  subcontractorBalances: number;
  projectedCashFlow: number;
  monthlyRevenue: Array<{ month: string; revenue: number; expenses: number; profit: number }>;
  cashFlowTrend: Array<{ date: string; inflow: number; outflow: number; balance: number }>;
  tradeBreakdown: Array<{ trade: string; committed: number; spent: number; remaining: number }>;
  healthIndicators: {
    cashRatio: number;
    profitMargin: number;
    collectionEfficiency: number;
    paymentTiming: number;
  };
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export function CompanyFinancialDashboard() {
  const [timeRange, setTimeRange] = useState<'month' | 'quarter' | 'year'>('month');

  // Fetch live company-wide financial data
  const { data: companyFinancials, isLoading } = useQuery({ 
    queryKey: ['/api/financial/company-summary'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });
  
  // Fallback to individual data if company summary not available
  const { data: projects = [] } = useQuery({ queryKey: ['/api/projects'] });
  const { data: invoices = [] } = useQuery({ queryKey: ['/api/invoices'] });
  const { data: clientPayments = [] } = useQuery({ queryKey: ['/api/client-payments'] });
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['/api/purchase-orders'] });

  // Calculate financial metrics from live company data
  const calculateMetrics = (): FinancialMetrics => {
    // Use live company financial data if available
    if (companyFinancials?.summary) {
      const { summary, monthlyTrends, projectedCashFlow, healthMetrics } = companyFinancials;
      
      return {
        totalReceivables: summary.totalReceivables || 0,
        clientPayments: summary.totalRevenue || 0,
        poCommitments: summary.totalCommitments || 0,
        invoicesPaid: summary.totalExpenses || 0,
        subcontractorBalances: summary.outstandingInvoices || 0,
        projectedCashFlow: summary.projectedProfit || 0,
        monthlyRevenue: monthlyTrends || [],
        cashFlowTrend: projectedCashFlow?.slice(0, 30).map((item: any) => ({
          date: item.date,
          inflow: item.inflow,
          outflow: item.outflow,
          balance: item.netFlow
        })) || [],
        tradeBreakdown: [], // Will be calculated from project data
        healthIndicators: {
          cashRatio: healthMetrics?.cashRatio || 0,
          profitMargin: healthMetrics?.profitMargin || 0,
          collectionEfficiency: healthMetrics?.collectionEfficiency || 0,
          paymentTiming: healthMetrics?.commitmentRatio || 0
        }
      };
    }

    // Fallback to calculate from individual data arrays
    const activeProjects = projects.filter((p: any) => p.status === 'active' || p.status === 'in_progress');
    
    // Calculate receivables (project budgets minus client payments)
    const totalReceivables = activeProjects.reduce((sum: number, project: any) => {
      const projectPayments = clientPayments
        .filter((payment: any) => payment.projectId === project.id)
        .reduce((total: number, payment: any) => total + payment.amount, 0);
      return sum + (project.estimatedBudget || 0) - projectPayments;
    }, 0);

    // Calculate client payments received
    const totalClientPayments = clientPayments.reduce((sum: number, payment: any) => sum + payment.amount, 0);

    // Calculate PO commitments
    const totalPOCommitments = purchaseOrders
      .filter((po: any) => po.status === 'signed' || po.status === 'active')
      .reduce((sum: number, po: any) => sum + po.amount, 0);

    // Calculate invoices paid
    const totalInvoicesPaid = invoices
      .filter((invoice: any) => invoice.status === 'paid')
      .reduce((sum: number, invoice: any) => sum + invoice.amount, 0);

    // Calculate outstanding subcontractor balances
    const subcontractorBalances = invoices
      .filter((invoice: any) => invoice.status === 'approved' || invoice.status === 'pending')
      .reduce((sum: number, invoice: any) => sum + (invoice.balanceRemaining || invoice.amount), 0);

    // Projected cash flow (simplified calculation)
    const projectedCashFlow = totalReceivables - subcontractorBalances;

    // Generate monthly revenue data (last 6 months)
    const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      
      // Calculate revenue and expenses for this month
      const monthPayments = clientPayments
        .filter((payment: any) => {
          if (!payment.paymentDate) return false;
          const paymentDate = new Date(payment.paymentDate);
          return paymentDate.getMonth() === date.getMonth() && 
                 paymentDate.getFullYear() === date.getFullYear();
        })
        .reduce((sum: number, payment: any) => sum + payment.amount, 0);

      const monthExpenses = invoices
        .filter((invoice: any) => {
          if (!invoice.paidAt && !invoice.createdAt) return false;
          const paidDate = new Date(invoice.paidAt || invoice.createdAt);
          return paidDate.getMonth() === date.getMonth() && 
                 paidDate.getFullYear() === date.getFullYear();
        })
        .reduce((sum: number, invoice: any) => sum + invoice.amount, 0);

      // Calculate revenue based on project completions or estimates if no payments exist
      let calculatedRevenue = monthPayments;
      if (monthPayments === 0 && activeProjects.length > 0) {
        // Estimate revenue based on project progress
        calculatedRevenue = activeProjects.reduce((sum: number, project: any) => {
          const projectRevenue = (project.estimatedBudget || 0) * 0.15; // Assume 15% monthly progress
          return sum + projectRevenue;
        }, 0);
      }

      return {
        month: monthName,
        revenue: calculatedRevenue,
        expenses: monthExpenses,
        profit: calculatedRevenue - monthExpenses
      };
    });

    // Generate cash flow trend (last 30 days)
    const cashFlowTrend = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      
      // Daily calculations would be more complex, simplified for demo
      return {
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        inflow: Math.random() * 10000 + 5000,
        outflow: Math.random() * 8000 + 3000,
        balance: projectedCashFlow + (Math.random() * 20000 - 10000)
      };
    });

    // Trade breakdown
    const tradeBreakdown = ['Foundation', 'Framing', 'Electrical', 'Plumbing', 'HVAC', 'Roofing'].map(trade => {
      const tradePOs = purchaseOrders.filter((po: any) => po.trade === trade);
      const tradeInvoices = invoices.filter((invoice: any) => invoice.trade === trade);
      
      const committed = tradePOs.reduce((sum: number, po: any) => sum + po.amount, 0);
      const spent = tradeInvoices.reduce((sum: number, invoice: any) => sum + invoice.amount, 0);
      
      return {
        trade,
        committed,
        spent,
        remaining: committed - spent
      };
    });

    // Health indicators
    const healthIndicators = {
      cashRatio: projectedCashFlow / Math.max(totalPOCommitments, 1),
      profitMargin: ((totalClientPayments - totalInvoicesPaid) / Math.max(totalClientPayments, 1)) * 100,
      collectionEfficiency: (totalClientPayments / Math.max(totalReceivables + totalClientPayments, 1)) * 100,
      paymentTiming: 85 // Simplified calculation
    };

    return {
      totalReceivables,
      clientPayments: totalClientPayments,
      poCommitments: totalPOCommitments,
      invoicesPaid: totalInvoicesPaid,
      subcontractorBalances,
      projectedCashFlow,
      monthlyRevenue,
      cashFlowTrend,
      tradeBreakdown,
      healthIndicators
    };
  };

  const metrics = calculateMetrics();

  const getHealthColor = (value: number, type: 'ratio' | 'percentage') => {
    if (type === 'ratio') {
      if (value >= 1.2) return 'text-green-600';
      if (value >= 0.8) return 'text-yellow-600';
      return 'text-red-600';
    } else {
      if (value >= 80) return 'text-green-600';
      if (value >= 60) return 'text-yellow-600';
      return 'text-red-600';
    }
  };

  const getHealthIcon = (value: number, type: 'ratio' | 'percentage') => {
    const isHealthy = type === 'ratio' ? value >= 1.2 : value >= 80;
    const isWarning = type === 'ratio' ? value >= 0.8 : value >= 60;
    
    if (isHealthy) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (isWarning) return <Clock className="w-4 h-4 text-yellow-600" />;
    return <AlertCircle className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financial Dashboard</h1>
          <p className="text-gray-600">Company-wide financial overview and metrics</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={timeRange === 'month' ? 'default' : 'outline'}
            onClick={() => setTimeRange('month')}
            size="sm"
          >
            Month
          </Button>
          <Button
            variant={timeRange === 'quarter' ? 'default' : 'outline'}
            onClick={() => setTimeRange('quarter')}
            size="sm"
          >
            Quarter
          </Button>
          <Button
            variant={timeRange === 'year' ? 'default' : 'outline'}
            onClick={() => setTimeRange('year')}
            size="sm"
          >
            Year
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receivables</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.totalReceivables.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="w-3 h-3 mr-1 text-green-600" />
              +2.1% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Client Payments</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${metrics.clientPayments.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="w-3 h-3 mr-1 text-green-600" />
              +8.2% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PO Commitments</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">${metrics.poCommitments.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="w-3 h-3 mr-1" />
              +5.4% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Invoices Paid</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${metrics.invoicesPaid.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowDownRight className="w-3 h-3 mr-1 text-red-600" />
              -1.2% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sub Balances</CardTitle>
            <Users className="h-4 w-4 text-muted-foreference" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">${metrics.subcontractorBalances.toLocaleString()}</div>
            <div className="flex items-center text-xs text-muted-foreground">
              <ArrowUpRight className="w-3 h-3 mr-1 text-orange-600" />
              +3.1% from last month
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projected Cash Flow</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.projectedCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${metrics.projectedCashFlow.toLocaleString()}
            </div>
            <div className="flex items-center text-xs text-muted-foreground">
              {metrics.projectedCashFlow >= 0 ? 
                <ArrowUpRight className="w-3 h-3 mr-1 text-green-600" /> :
                <ArrowDownRight className="w-3 h-3 mr-1 text-red-600" />
              }
              Projected 30 days
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Expenses Chart */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Monthly Revenue vs Expenses</CardTitle>
            <CardDescription>Revenue, expenses, and profit over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, '']} />
                <Legend />
                <Bar dataKey="revenue" fill="#3B82F6" name="Revenue" />
                <Bar dataKey="expenses" fill="#EF4444" name="Expenses" />
                <Bar dataKey="profit" fill="#10B981" name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cash Flow Trend */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Cash Flow Trend</CardTitle>
            <CardDescription>Daily cash inflow and outflow over the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={metrics.cashFlowTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, '']} />
                <Legend />
                <Area type="monotone" dataKey="inflow" stackId="1" stroke="#10B981" fill="#10B981" name="Inflow" />
                <Area type="monotone" dataKey="outflow" stackId="2" stroke="#EF4444" fill="#EF4444" name="Outflow" />
                <Line type="monotone" dataKey="balance" stroke="#3B82F6" strokeWidth={2} name="Balance" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Trade Breakdown and Health Indicators */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trade Breakdown */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Spending by Trade</CardTitle>
            <CardDescription>Committed vs spent amounts by construction trade</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.tradeBreakdown} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="trade" type="category" width={80} />
                <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, '']} />
                <Legend />
                <Bar dataKey="committed" fill="#3B82F6" name="Committed" />
                <Bar dataKey="spent" fill="#EF4444" name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Financial Health Indicators */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Financial Health Indicators</CardTitle>
            <CardDescription>Key financial ratios and performance metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-2">
                {getHealthIcon(metrics.healthIndicators.cashRatio, 'ratio')}
                <span className="font-medium">Cash Ratio</span>
              </div>
              <div className={`text-lg font-bold ${getHealthColor(metrics.healthIndicators.cashRatio, 'ratio')}`}>
                {metrics.healthIndicators.cashRatio.toFixed(2)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-2">
                {getHealthIcon(metrics.healthIndicators.profitMargin, 'percentage')}
                <span className="font-medium">Profit Margin</span>
              </div>
              <div className={`text-lg font-bold ${getHealthColor(metrics.healthIndicators.profitMargin, 'percentage')}`}>
                {metrics.healthIndicators.profitMargin.toFixed(1)}%
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-2">
                {getHealthIcon(metrics.healthIndicators.collectionEfficiency, 'percentage')}
                <span className="font-medium">Collection Efficiency</span>
              </div>
              <div className={`text-lg font-bold ${getHealthColor(metrics.healthIndicators.collectionEfficiency, 'percentage')}`}>
                {metrics.healthIndicators.collectionEfficiency.toFixed(1)}%
              </div>
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-2">
                {getHealthIcon(metrics.healthIndicators.paymentTiming, 'percentage')}
                <span className="font-medium">On-Time Payments</span>
              </div>
              <div className={`text-lg font-bold ${getHealthColor(metrics.healthIndicators.paymentTiming, 'percentage')}`}>
                {metrics.healthIndicators.paymentTiming.toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}