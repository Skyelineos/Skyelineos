import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard, 
  FileText, 
  Target,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  PieChart,
  Calculator,
  Zap
} from 'lucide-react';

// Import all financial management components
import CostVarianceAnalysis from './CostVarianceAnalysis';
import CashFlowForecasting from './CashFlowForecasting';
import ProfitMarginAnalysis from './ProfitMarginAnalysis';
import AutomatedPOSystem from './AutomatedPOSystem';
import InvoiceMatchingSystem from './InvoiceMatchingSystem';
import PaymentProcessingCenter from './PaymentProcessingCenter';

interface FinancialManagementDashboardProps {
  projectId: number;
}

export default function FinancialManagementDashboard({ projectId }: FinancialManagementDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');

  // Mock summary data - in real app, this would come from APIs
  const financialSummary = {
    totalRevenue: 125000,
    totalCosts: 98000,
    netProfit: 27000,
    profitMargin: 21.6,
    cashFlowStatus: 'positive',
    pendingInvoices: 5,
    scheduledPayments: 8,
    automatedPOs: 12,
    matchingRate: 92.5,
    costVariance: -2.3,
    forecastAccuracy: 87.2
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'positive':
        return 'text-green-600';
      case 'negative':
        return 'text-red-600';
      case 'neutral':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return 'text-red-600';
    if (variance < -5) return 'text-red-600';
    if (variance < 0) return 'text-green-600';
    return 'text-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Management</h1>
          <p className="text-gray-600">
            Comprehensive financial tracking and analysis for your construction project
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <FileText className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          <Button size="sm">
            <BarChart3 className="w-4 h-4 mr-2" />
            View Analytics
          </Button>
        </div>
      </div>

      {/* Financial Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(financialSummary.totalRevenue)}
            </div>
            <div className="text-sm text-gray-500">
              Project to date
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              Total Costs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(financialSummary.totalCosts)}
            </div>
            <div className="text-sm text-gray-500">
              Project to date
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Target className="w-4 h-4 text-theme-primary" />
              Net Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">
              {formatCurrency(financialSummary.netProfit)}
            </div>
            <div className="text-sm text-green-600">
              {financialSummary.profitMargin.toFixed(1)}% margin
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Cash Flow
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={`text-2xl font-bold ${getStatusColor(financialSummary.cashFlowStatus)}`}>
                {financialSummary.cashFlowStatus === 'positive' ? '+' : ''}
                {formatCurrency(financialSummary.netProfit)}
              </div>
            </div>
            <div className="text-sm text-gray-500">
              30-day forecast
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Cost Variance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getVarianceColor(financialSummary.costVariance)}`}>
              {financialSummary.costVariance > 0 ? '+' : ''}{financialSummary.costVariance.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500">
              vs. budget
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Automation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {financialSummary.automatedPOs}
            </div>
            <div className="text-sm text-gray-500">
              Active automations
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Pending Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{financialSummary.pendingInvoices}</div>
              <Badge variant="outline" className="text-yellow-600">
                <Clock className="w-3 h-3 mr-1" />
                Needs Review
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Scheduled Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{financialSummary.scheduledPayments}</div>
              <Badge variant="outline" className="text-theme-primary">
                <CreditCard className="w-3 h-3 mr-1" />
                Processing
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Invoice Match Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{financialSummary.matchingRate}%</div>
              <Badge variant="outline" className="text-green-600">
                <CheckCircle className="w-3 h-3 mr-1" />
                Excellent
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Forecast Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold">{financialSummary.forecastAccuracy}%</div>
              <Badge variant="outline" className="text-green-600">
                <Target className="w-3 h-3 mr-1" />
                High
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Financial Management Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="variance">Cost Variance</TabsTrigger>
          <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
          <TabsTrigger value="margin">Profit Margin</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Financial Health Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Profit Margin</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${Math.min(financialSummary.profitMargin * 4, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-sm font-medium">{financialSummary.profitMargin.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Cash Flow</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                      </div>
                      <span className="text-sm font-medium">Positive</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Cost Control</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '65%' }}></div>
                      </div>
                      <span className="text-sm font-medium">Fair</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Automation</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-500 h-2 rounded-full" style={{ width: '90%' }}></div>
                      </div>
                      <span className="text-sm font-medium">Excellent</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gray-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Action Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">Review cost variance</div>
                      <div className="text-xs text-gray-500">Electrical costs 5% over budget</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 rounded">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">Process pending invoices</div>
                      <div className="text-xs text-gray-500">5 invoices awaiting approval</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-green-50 rounded">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">Update cash flow forecast</div>
                      <div className="text-xs text-gray-500">Monthly forecast due</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="variance" className="space-y-4">
          <CostVarianceAnalysis projectId={projectId} />
        </TabsContent>

        <TabsContent value="cashflow" className="space-y-4">
          <CashFlowForecasting projectId={projectId} />
        </TabsContent>

        <TabsContent value="margin" className="space-y-4">
          <ProfitMarginAnalysis projectId={projectId} />
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Tabs defaultValue="po-system" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="po-system">Automated PO System</TabsTrigger>
              <TabsTrigger value="invoice-matching">Invoice Matching</TabsTrigger>
            </TabsList>
            <TabsContent value="po-system" className="space-y-4">
              <AutomatedPOSystem projectId={projectId} />
            </TabsContent>
            <TabsContent value="invoice-matching" className="space-y-4">
              <InvoiceMatchingSystem projectId={projectId} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <PaymentProcessingCenter projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}