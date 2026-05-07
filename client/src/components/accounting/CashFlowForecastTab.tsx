import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, Area, AreaChart, ComposedChart
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Calendar, DollarSign, AlertTriangle, 
  CheckCircle, Download, Target, ArrowUpRight, ArrowDownRight,
  Building2, Users, Receipt, CreditCard
} from 'lucide-react';

interface CashFlowItem {
  date: string;
  type: 'incoming' | 'outgoing';
  category: string;
  description: string;
  amount: number;
  probability: number;
  source: string;
  projectId?: number;
  projectName?: string;
}

interface CashFlowPeriod {
  period: string;
  date: string;
  expectedIncoming: number;
  expectedOutgoing: number;
  netCashFlow: number;
  cumulativeBalance: number;
  incomingCount: number;
  outgoingCount: number;
  confidence: number;
}

export function CashFlowForecastTab() {
  const [forecastPeriod, setForecastPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(80);

  // Fetch data
  const { data: projects = [] } = useQuery({ queryKey: ['/api/projects'] });
  const { data: clientPayments = [] } = useQuery({ queryKey: ['/api/client-payments'] });
  const { data: invoices = [] } = useQuery({ queryKey: ['/api/invoices'] });
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['/api/purchase-orders'] });

  // Generate cash flow forecast data
  const generateCashFlowForecast = (): CashFlowItem[] => {
    const items: CashFlowItem[] = [];
    const today = new Date();

    // Projected client payments based on project schedules and milestones
    projects.forEach((project: any) => {
      if (project.status === 'active' || project.status === 'in_progress') {
        const totalPaid = clientPayments
          .filter((p: any) => p.projectId === project.id)
          .reduce((sum: number, p: any) => sum + p.amount, 0);
        
        const remainingBalance = (project.estimatedBudget || 0) - totalPaid;
        
        if (remainingBalance > 0) {
          // Generate milestone payments (simplified logic)
          const milestones = [0.3, 0.5, 0.8, 1.0]; // 30%, 50%, 80%, 100%
          const currentProgress = totalPaid / (project.estimatedBudget || 1);
          
          milestones.forEach((milestone, index) => {
            if (milestone > currentProgress) {
              const daysFromNow = (index + 1) * 30; // Rough estimation
              const paymentDate = new Date(today);
              paymentDate.setDate(paymentDate.getDate() + daysFromNow);
              
              const paymentAmount = (project.estimatedBudget || 0) * (milestone - currentProgress);
              
              items.push({
                date: paymentDate.toISOString().split('T')[0],
                type: 'incoming',
                category: 'Client Payment',
                description: `${project.name} - ${Math.round(milestone * 100)}% milestone`,
                amount: paymentAmount,
                probability: milestone <= 0.5 ? 0.9 : milestone <= 0.8 ? 0.7 : 0.5,
                source: 'Project Milestone',
                projectId: project.id,
                projectName: project.name
              });
              
              // Only add first upcoming milestone per project
              return;
            }
          });
        }
      }
    });

    // Projected subcontractor payments based on POs and invoices
    purchaseOrders.forEach((po: any) => {
      if (po.status === 'signed' || po.status === 'active') {
        const poInvoices = invoices.filter((inv: any) => inv.poId === po.id);
        const totalInvoiced = poInvoices.reduce((sum: number, inv: any) => sum + inv.amount, 0);
        const totalPaid = poInvoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
        
        const remainingBalance = po.amount - totalPaid;
        
        if (remainingBalance > 0) {
          // Estimate when payment will be due (30-60 days from PO date)
          const paymentDate = new Date(po.createdAt);
          paymentDate.setDate(paymentDate.getDate() + (Math.random() * 30 + 30)); // 30-60 days
          
          items.push({
            date: paymentDate.toISOString().split('T')[0],
            type: 'outgoing',
            category: 'Subcontractor Payment',
            description: `${po.trade} - PO ${po.poNumber}`,
            amount: remainingBalance,
            probability: 0.8,
            source: 'Purchase Order',
            projectId: po.projectId
          });
        }
      }
    });

    // Outstanding invoices
    (invoices as any[] || []).forEach((invoice: any) => {
      if (invoice.status === 'approved' && (invoice.balanceRemaining || 0) > 0) {
        const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : new Date();
        if (!invoice.dueDate) {
          dueDate.setDate(dueDate.getDate() + 30); // Default 30 days
        }
        
        items.push({
          date: dueDate.toISOString().split('T')[0],
          type: 'outgoing',
          category: 'Invoice Payment',
          description: `${invoice.trade} - Invoice ${invoice.invoiceNumber}`,
          amount: invoice.balanceRemaining || invoice.amount,
          probability: 0.95,
          source: 'Outstanding Invoice',
          projectId: invoice.projectId
        });
      }
    });

    // Add some recurring expenses (simplified)
    for (let i = 1; i <= 12; i++) {
      const expenseDate = new Date(today);
      expenseDate.setMonth(expenseDate.getMonth() + i);
      
      items.push({
        date: expenseDate.toISOString().split('T')[0],
        type: 'outgoing',
        category: 'Operating Expenses',
        description: 'Monthly operating costs',
        amount: 15000,
        probability: 0.99,
        source: 'Recurring Expense'
      });
    }

    return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const cashFlowItems = generateCashFlowForecast();

  // Group by period and calculate cumulative balances
  const cashFlowByPeriod = useMemo((): CashFlowPeriod[] => {
    const periods: CashFlowPeriod[] = [];
    const today = new Date();
    let cumulativeBalance = 0;

    // Calculate current balance (simplified)
    const currentBalance = (clientPayments as any[] || []).reduce((sum: number, p: any) => sum + p.amount, 0) -
                          (invoices as any[] || []).reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
    cumulativeBalance = currentBalance;

    // Generate periods based on selection
    const periodCount = forecastPeriod === 'week' ? 12 : forecastPeriod === 'month' ? 12 : 4;
    const periodLength = forecastPeriod === 'week' ? 7 : forecastPeriod === 'month' ? 30 : 90;

    for (let i = 0; i < periodCount; i++) {
      const periodStart = new Date(today);
      periodStart.setDate(periodStart.getDate() + (i * periodLength));
      
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + periodLength - 1);

      const periodItems = cashFlowItems.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= periodStart && itemDate <= periodEnd;
      });

      const incoming = periodItems
        .filter(item => item.type === 'incoming')
        .reduce((sum, item) => sum + (item.amount * item.probability), 0);

      const outgoing = periodItems
        .filter(item => item.type === 'outgoing')
        .reduce((sum, item) => sum + (item.amount * item.probability), 0);

      const netCashFlow = incoming - outgoing;
      cumulativeBalance += netCashFlow;

      const incomingCount = periodItems.filter(item => item.type === 'incoming').length;
      const outgoingCount = periodItems.filter(item => item.type === 'outgoing').length;
      
      // Calculate confidence based on item probabilities
      const avgProbability = periodItems.length > 0 ? 
        periodItems.reduce((sum, item) => sum + item.probability, 0) / periodItems.length : 1;

      let periodLabel: string;
      if (forecastPeriod === 'week') {
        periodLabel = `Week ${i + 1}`;
      } else if (forecastPeriod === 'month') {
        periodLabel = periodStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      } else {
        periodLabel = `Q${i + 1} ${periodStart.getFullYear()}`;
      }

      periods.push({
        period: periodLabel,
        date: periodStart.toISOString().split('T')[0],
        expectedIncoming: incoming,
        expectedOutgoing: outgoing,
        netCashFlow,
        cumulativeBalance,
        incomingCount,
        outgoingCount,
        confidence: avgProbability * 100
      });
    }

    return periods;
  }, [cashFlowItems, forecastPeriod, clientPayments, invoices]);

  // Calculate summary metrics
  const totalIncoming = cashFlowByPeriod.reduce((sum, period) => sum + period.expectedIncoming, 0);
  const totalOutgoing = cashFlowByPeriod.reduce((sum, period) => sum + period.expectedOutgoing, 0);
  const netProjection = totalIncoming - totalOutgoing;
  const worstCaseBalance = Math.min(...cashFlowByPeriod.map(p => p.cumulativeBalance));
  const bestCaseBalance = Math.max(...cashFlowByPeriod.map(p => p.cumulativeBalance));

  // Risk assessment
  const riskLevel = worstCaseBalance < 0 ? 'high' : worstCaseBalance < 50000 ? 'medium' : 'low';
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      default: return 'text-green-600';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'high': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'medium': return <TrendingDown className="w-4 h-4 text-yellow-600" />;
      default: return <CheckCircle className="w-4 h-4 text-green-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cash Flow Forecast</h2>
          <p className="text-gray-600">Projected cash inflows and outflows</p>
        </div>
        <div className="flex gap-2">
          <Select value={forecastPeriod} onValueChange={(value: any) => setForecastPeriod(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="quarter">Quarterly</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Incoming</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalIncoming.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Next {forecastPeriod === 'week' ? '12 weeks' : forecastPeriod === 'month' ? '12 months' : '4 quarters'}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expected Outgoing</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${totalOutgoing.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Projected expenses
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Projection</CardTitle>
            {netProjection >= 0 ? 
              <TrendingUp className="h-4 w-4 text-green-600" /> :
              <TrendingDown className="h-4 w-4 text-red-600" />
            }
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProjection >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${netProjection.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Net cash flow
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Worst Case</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${worstCaseBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${worstCaseBalance.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Lowest projected balance
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Level</CardTitle>
            {getRiskIcon(riskLevel)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRiskColor(riskLevel)}`}>
              {riskLevel.toUpperCase()}
            </div>
            <p className="text-xs text-muted-foreground">
              Cash flow risk
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cash Flow Chart */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Cash Flow Projection</CardTitle>
          <CardDescription>
            Expected cash inflows and outflows by {forecastPeriod}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={cashFlowByPeriod}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [
                  `$${Number(value).toLocaleString()}`, 
                  String(name).charAt(0).toUpperCase() + String(name).slice(1).replace(/([A-Z])/g, ' $1')
                ]} 
              />
              <Legend />
              <Bar dataKey="expectedIncoming" fill="#10B981" name="Expected Incoming" />
              <Bar dataKey="expectedOutgoing" fill="#EF4444" name="Expected Outgoing" />
              <Line type="monotone" dataKey="cumulativeBalance" stroke="#3B82F6" strokeWidth={3} name="Cumulative Balance" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow by Period */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Period Breakdown</CardTitle>
            <CardDescription>Detailed cash flow by {forecastPeriod}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {cashFlowByPeriod.slice(0, 6).map((period, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-medium">{period.period}</div>
                    <Badge variant={period.netCashFlow >= 0 ? 'default' : 'destructive'}>
                      {period.confidence.toFixed(0)}% confidence
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-green-600 font-medium">
                        +${period.expectedIncoming.toLocaleString()}
                      </div>
                      <div className="text-gray-600">
                        {period.incomingCount} incoming items
                      </div>
                    </div>
                    <div>
                      <div className="text-red-600 font-medium">
                        -${period.expectedOutgoing.toLocaleString()}
                      </div>
                      <div className="text-gray-600">
                        {period.outgoingCount} outgoing items
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 pt-2 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Net Cash Flow:</span>
                      <span className={`font-bold ${period.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${period.netCashFlow.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Running Balance:</span>
                      <span className={`font-bold ${period.cumulativeBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${period.cumulativeBalance.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Cash Flow Events */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Upcoming Cash Flow Events</CardTitle>
            <CardDescription>Next 30 days projected cash movements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {cashFlowItems
                .filter(item => {
                  const itemDate = new Date(item.date);
                  const thirtyDaysFromNow = new Date();
                  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                  return itemDate <= thirtyDaysFromNow;
                })
                .slice(0, 10)
                .map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${item.type === 'incoming' ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <div className="font-medium text-sm">{item.description}</div>
                        <div className="text-xs text-gray-600">
                          {new Date(item.date).toLocaleDateString()} • {item.category}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${item.type === 'incoming' ? 'text-green-600' : 'text-red-600'}`}>
                        {item.type === 'incoming' ? '+' : '-'}${item.amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-600">
                        {Math.round(item.probability * 100)}% probability
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Analysis */}
      {riskLevel !== 'low' && (
        <Card className="bg-gray-50 border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              Cash Flow Risk Analysis
            </CardTitle>
            <CardDescription>
              Recommendations to improve cash flow projections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {riskLevel === 'high' && worstCaseBalance < 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">High Risk: Potential Cash Shortfall</div>
                  <div className="text-sm text-red-700 mt-1">
                    Projected balance may go negative by ${Math.abs(worstCaseBalance).toLocaleString()}. 
                    Consider accelerating client payments or delaying non-critical expenses.
                  </div>
                </div>
              )}
              
              {riskLevel === 'medium' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="font-medium text-yellow-800">Medium Risk: Tight Cash Flow</div>
                  <div className="text-sm text-yellow-700 mt-1">
                    Cash flow projections show minimal buffer. Monitor closely and consider establishing a credit line.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-theme-primary">{
                    cashFlowItems.filter(item => item.type === 'incoming' && item.probability < 0.8).length
                  }</div>
                  <div className="text-sm text-gray-600">Uncertain Receipts</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{
                    cashFlowItems.filter(item => item.type === 'outgoing' && new Date(item.date) < new Date(Date.now() + 30*24*60*60*1000)).length
                  }</div>
                  <div className="text-sm text-gray-600">Due in 30 Days</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round((cashFlowItems.filter(item => item.probability >= 0.8).length / cashFlowItems.length) * 100)}%
                  </div>
                  <div className="text-sm text-gray-600">High Confidence</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}