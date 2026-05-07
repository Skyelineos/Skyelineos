import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Download,
  Search,
  Filter,
  Calendar,
  Activity,
  Zap,
  Calculator
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart as RechartsPieChart, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface EnhancedFinancialDashboardProps {
  projectId?: number;
}

export default function EnhancedFinancialDashboard({ projectId }: EnhancedFinancialDashboardProps) {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeView, setActiveView] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBy, setFilterBy] = useState<'all' | 'profit' | 'loss' | 'pending'>('all');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Auto-refresh data every 30 seconds if enabled
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        setLastRefresh(new Date());
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Enhanced data fetching with real-time updates
  const { data: projects = [], isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ['/api/projects'],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const { data: financialData = {}, isLoading: financialLoading } = useQuery<any>({
    queryKey: ['/api/financial/enhanced-summary', projectId, timeRange, lastRefresh],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const { data: cashFlowData = [], isLoading: cashFlowLoading } = useQuery<any[]>({
    queryKey: ['/api/financial/cash-flow-analysis', projectId, timeRange],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const { data: profitabilityData = [], isLoading: profitLoading } = useQuery<any[]>({
    queryKey: ['/api/financial/profitability-trends', projectId, timeRange],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const { data: budgetVariances = [], isLoading: varianceLoading } = useQuery<any[]>({
    queryKey: ['/api/financial/budget-variances', projectId],
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Enhanced KPI calculations
  const calculateEnhancedKPIs = () => {
    const totalRevenue = financialData?.totalRevenue || 0;
    const totalCosts = financialData?.totalCosts || 0;
    const grossProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const roi = totalCosts > 0 ? (grossProfit / totalCosts) * 100 : 0;
    const cashFlow = financialData?.cashFlow || 0;
    const burnRate = financialData?.burnRate || 0;
    const runwayMonths = burnRate > 0 ? Math.abs(cashFlow / burnRate) : 0;

    return {
      totalRevenue,
      totalCosts,
      grossProfit,
      profitMargin,
      roi,
      cashFlow,
      burnRate,
      runwayMonths,
      activeProjects: projects.length,
      completedProjects: projects.filter(p => p.status === 'completed').length,
      overdueProjects: projects.filter(p => new Date(p.targetCompletion) < new Date()).length,
    };
  };

  const kpis = calculateEnhancedKPIs();

  // Chart data preparations
  const cashFlowChartData = cashFlowData.map((item: any) => ({
    month: item.month,
    income: item.totalIncome,
    expenses: item.totalExpenses,
    netCashFlow: item.netCashFlow,
    cumulative: item.cumulativeCashFlow
  }));

  const profitabilityChartData = profitabilityData.map((item: any) => ({
    project: item.projectName,
    margin: item.profitMargin,
    revenue: item.revenue,
    profit: item.profit
  }));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

  // Loading state
  if (projectsLoading || financialLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Enhanced KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gray-50 bg-gradient-to-r from-blue-50 to-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-theme-primary">Total Revenue</p>
                <p className="text-2xl font-bold text-blue-900">
                  ${kpis.totalRevenue.toLocaleString()}
                </p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600">+12.5% from last month</span>
                </div>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 bg-gradient-to-r from-green-50 to-green-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">Profit Margin</p>
                <p className="text-2xl font-bold text-green-900">
                  {kpis.profitMargin.toFixed(1)}%
                </p>
                <div className="flex items-center mt-2">
                  <Target className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-600">Target: 20%</span>
                </div>
              </div>
              <BarChart3 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 bg-gradient-to-r from-orange-50 to-orange-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600">Cash Flow</p>
                <p className="text-2xl font-bold text-orange-900">
                  ${Math.abs(kpis.cashFlow).toLocaleString()}
                </p>
                <div className="flex items-center mt-2">
                  {kpis.cashFlow >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                  )}
                  <span className="text-sm text-gray-600">
                    {kpis.runwayMonths.toFixed(1)} months runway
                  </span>
                </div>
              </div>
              <Activity className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50 bg-gradient-to-r from-purple-50 to-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">ROI</p>
                <p className="text-2xl font-bold text-purple-900">
                  {kpis.roi.toFixed(1)}%
                </p>
                <div className="flex items-center mt-2">
                  <Calculator className="h-4 w-4 text-purple-500 mr-1" />
                  <span className="text-sm text-purple-600">Return on Investment</span>
                </div>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{kpis.activeProjects}</div>
            <p className="text-sm text-gray-500 mt-1">Currently in progress</p>
            <Progress value={75} className="mt-3" />
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              Completed Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-theme-primary">{kpis.completedProjects}</div>
            <p className="text-sm text-gray-500 mt-1">Successfully delivered</p>
            <Progress value={100} className="mt-3" />
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Overdue Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{kpis.overdueProjects}</div>
            <p className="text-sm text-gray-500 mt-1">Past target completion</p>
            <Progress value={25} className="mt-3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderAnalyticsTab = () => (
    <div className="space-y-6">
      {/* Cash Flow Trend */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Cash Flow Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, '']} />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="income" 
                  stackId="1" 
                  stroke="#10B981" 
                  fill="#10B981" 
                  fillOpacity={0.6}
                  name="Income"
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  stackId="2" 
                  stroke="#EF4444" 
                  fill="#EF4444" 
                  fillOpacity={0.6}
                  name="Expenses"
                />
                <Line 
                  type="monotone" 
                  dataKey="netCashFlow" 
                  stroke="#3B82F6" 
                  strokeWidth={3}
                  name="Net Cash Flow"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Profitability by Project */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Project Profitability
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={profitabilityChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="project" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="margin" fill="#8884D8" name="Profit Margin %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderReportsTab = () => (
    <div className="space-y-6">
      {/* Report Generation */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Generate Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button variant="outline" className="h-16 flex flex-col gap-2">
              <BarChart3 className="h-6 w-6" />
              <span>Financial Summary Report</span>
            </Button>
            <Button variant="outline" className="h-16 flex flex-col gap-2">
              <PieChart className="h-6 w-6" />
              <span>Profit Analysis Report</span>
            </Button>
            <Button variant="outline" className="h-16 flex flex-col gap-2">
              <Activity className="h-6 w-6" />
              <span>Cash Flow Report</span>
            </Button>
            <Button variant="outline" className="h-16 flex flex-col gap-2">
              <Calculator className="h-6 w-6" />
              <span>Budget Variance Report</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Export Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant="accent" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export to PDF
            </Button>
            <Button variant="accent-outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export to Excel
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export to CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Dashboard Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Enhanced Financial Dashboard
          </h2>
          <p className="text-gray-600">
            Real-time financial analytics and reporting
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          {/* Time Range Selector */}
          <Select value={timeRange} onValueChange={(value) => setTimeRange(value as typeof timeRange)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>

          {/* Auto Refresh Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="auto-refresh" className="text-sm">
              Auto Refresh
            </Label>
          </div>

          {/* Manual Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLastRefresh(new Date())}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Last Updated Indicator */}
      <div className="text-sm text-gray-500">
        Last updated: {lastRefresh.toLocaleTimeString()}
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {renderOverviewTab()}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {renderAnalyticsTab()}
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          {renderReportsTab()}
        </TabsContent>
      </Tabs>
    </div>
  );
}