import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEstimates } from '@/hooks/useEstimates';
import { calculateLiveProgress } from '@/lib/progressUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { 
  Building2, DollarSign, TrendingUp, TrendingDown, AlertCircle, 
  CheckCircle, ExternalLink, Search, Filter, Target, Calculator,
  Receipt, CreditCard, Users, Calendar, Download
} from 'lucide-react';

interface ProjectFinancials {
  id: number;
  name: string;
  status: string;
  estimateTotal: number;
  clientPaid: number;
  clientBalance: number;
  poTotal: number;
  invoicedTotal: number;
  remainingToPay: number;
  profitToDate: number;
  burnRate: number;
  profitMargin: number;
  completionPercentage: number;
  budgetUtilization: number;
  cashFlowHealth: 'good' | 'warning' | 'critical';
  lastPaymentDate?: string;
  nextMilestone?: string;
  estimatedCompletion?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export function PerProjectAccountingTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('profitMargin');

  // Fetch data
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['/api/projects'] });
  const { data: clientPayments = [] } = useQuery({ queryKey: ['/api/client-payments'] });
  const { data: invoices = [] } = useQuery({ queryKey: ['/api/invoices'] });
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['/api/purchase-orders'] });
  const { estimates } = useEstimates();

  // Live progress queries for each project
  const progressQueries = projects.map((project: any) => {
    return useQuery({
      queryKey: ['project-live-progress', project.id],
      queryFn: () => calculateLiveProgress(project.id),
      enabled: !!project.id,
      refetchInterval: 60000, // Refresh every minute
    });
  });

  // Calculate project financials with live progress
  const calculateProjectFinancials = (): ProjectFinancials[] => {
    return projects.map((project: any, index: number) => {
      const liveProgress = progressQueries[index]?.data;
      
      // Get project estimates
      const projectEstimates = estimates.filter((est: any) => est.projectId === project.id);
      const estimateTotal = projectEstimates.reduce((sum: number, est: any) => sum + (est.totalCost || 0), 0);

      // Get client payments for this project
      const projectPayments = clientPayments.filter((payment: any) => payment.projectId === project.id);
      const clientPaid = projectPayments.reduce((sum: number, payment: any) => sum + payment.amount, 0);
      const clientBalance = (project.estimatedBudget || estimateTotal) - clientPaid;

      // Get project purchase orders
      const projectPOs = purchaseOrders.filter((po: any) => po.projectId === project.id);
      const poTotal = projectPOs.reduce((sum: number, po: any) => sum + po.amount, 0);

      // Get project invoices
      const projectInvoices = invoices.filter((inv: any) => inv.projectId === project.id);
      const invoicedTotal = projectInvoices.reduce((sum: number, inv: any) => sum + inv.amount, 0);
      const paidToSubs = projectInvoices.reduce((sum: number, inv: any) => sum + (inv.totalPaid || 0), 0);
      const remainingToPay = invoicedTotal - paidToSubs;

      // Calculate profitability
      const totalCosts = paidToSubs;
      const profitToDate = clientPaid - totalCosts;
      const profitMargin = clientPaid > 0 ? (profitToDate / clientPaid) * 100 : 0;

      // Calculate burn rate (simplified - costs per month)
      const projectStartDate = new Date(project.startDate || project.createdAt);
      const monthsActive = Math.max(1, (Date.now() - projectStartDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const burnRate = totalCosts / monthsActive;

      // Use live progress data when available, fallback to simplified calculation
      const completionPercentage = liveProgress?.completionPercentage ?? (
        project.status === 'completed' ? 100 : 
        project.status === 'in_progress' ? Math.min(90, (clientPaid / (project.estimatedBudget || 1)) * 100) :
        project.status === 'active' ? Math.min(75, (clientPaid / (project.estimatedBudget || 1)) * 100) : 0
      );

      // Use live budget utilization when available, fallback to simplified calculation
      const budgetUtilization = liveProgress?.budgetUtilization ?? (
        (project.estimatedBudget || estimateTotal) > 0 ? 
        (totalCosts / (project.estimatedBudget || estimateTotal)) * 100 : 0
      );

      // Cash flow health assessment
      let cashFlowHealth: 'good' | 'warning' | 'critical' = 'good';
      if (clientBalance < 0 || remainingToPay > clientBalance * 1.5) {
        cashFlowHealth = 'critical';
      } else if (remainingToPay > clientBalance || budgetUtilization > 85) {
        cashFlowHealth = 'warning';
      }

      // Last payment date
      const lastPayment = projectPayments
        .sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0];
      const lastPaymentDate = lastPayment ? lastPayment.paymentDate : undefined;

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        estimateTotal,
        clientPaid,
        clientBalance,
        poTotal,
        invoicedTotal,
        remainingToPay,
        profitToDate,
        burnRate,
        profitMargin,
        completionPercentage,
        budgetUtilization,
        cashFlowHealth,
        lastPaymentDate,
        nextMilestone: 'Foundation Complete', // Simplified
        estimatedCompletion: project.targetCompletion
      };
    });
  };

  const projectFinancials = calculateProjectFinancials();

  // Filter and sort projects
  const filteredProjects = projectFinancials
    .filter((project) => {
      const matchesSearch = searchTerm === '' || 
        project.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'profitMargin':
          return b.profitMargin - a.profitMargin;
        case 'clientBalance':
          return b.clientBalance - a.clientBalance;
        case 'burnRate':
          return b.burnRate - a.burnRate;
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

  // Calculate totals
  const totalEstimateValue = filteredProjects.reduce((sum, p) => sum + p.estimateTotal, 0);
  const totalClientPaid = filteredProjects.reduce((sum, p) => sum + p.clientPaid, 0);
  const totalProfit = filteredProjects.reduce((sum, p) => sum + p.profitToDate, 0);
  const averageProfitMargin = filteredProjects.length > 0 ? 
    filteredProjects.reduce((sum, p) => sum + p.profitMargin, 0) / filteredProjects.length : 0;

  // Project status distribution
  const statusDistribution = ['active', 'in_progress', 'completed', 'on_hold'].map(status => ({
    name: status.replace('_', ' ').toUpperCase(),
    value: filteredProjects.filter(p => p.status === status).length,
    color: {
      'active': '#3B82F6',
      'in_progress': '#10B981', 
      'completed': '#6B7280',
      'on_hold': '#F59E0B'
    }[status]
  }));

  const getHealthBadge = (health: string) => {
    const variants = {
      'good': 'default',
      'warning': 'secondary', 
      'critical': 'destructive'
    };
    return variants[health as keyof typeof variants] || 'default';
  };

  const getHealthColor = (health: string) => {
    const colors = {
      'good': 'text-green-600',
      'warning': 'text-yellow-600',
      'critical': 'text-red-600'
    };
    return colors[health as keyof typeof colors] || 'text-gray-600';
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      'planning': 'secondary',
      'active': 'default',
      'in_progress': 'default',
      'completed': 'outline',
      'on_hold': 'destructive'
    };
    return variants[status as keyof typeof variants] || 'secondary';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Per-Project Accounting</h2>
          <p className="text-gray-600">Financial performance by individual project</p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export Report
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Project Value</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalEstimateValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {filteredProjects.length} projects
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Client Payments</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalClientPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((totalClientPaid / totalEstimateValue) * 100)}% collected
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${totalProfit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all projects
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Profit Margin</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${averageProfitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {averageProfitMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Portfolio average
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Sort by:</span>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profitMargin">Profit Margin</SelectItem>
              <SelectItem value="clientBalance">Client Balance</SelectItem>
              <SelectItem value="burnRate">Burn Rate</SelectItem>
              <SelectItem value="name">Project Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit by Project */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Profit by Project</CardTitle>
            <CardDescription>Profitability comparison across projects</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={filteredProjects.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Profit']} />
                <Bar dataKey="profitToDate" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Project Status Distribution */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Project Status Distribution</CardTitle>
            <CardDescription>Breakdown of projects by current status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Project Detail Cards */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Project Financial Details</CardTitle>
          <CardDescription>Comprehensive financial overview for each project</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No projects found</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredProjects.map((project) => (
                <div key={project.id} className="border rounded-lg p-6 space-y-4">
                  {/* Project Header */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-4">
                      <div>
                        <h3 className="text-lg font-semibold">{project.name}</h3>
                        <div className="flex items-center space-x-2 mt-1">
                          <Badge variant={getStatusBadge(project.status)}>
                            {project.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                          <Badge variant={getHealthBadge(project.cashFlowHealth)}>
                            {project.cashFlowHealth.toUpperCase()} CASH FLOW
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`/projects/${project.id}`, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        View Project
                      </Button>
                    </div>
                  </div>

                  {/* Financial Metrics Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-lg font-bold">${project.estimateTotal.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Estimate Total</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-lg font-bold text-green-600">${project.clientPaid.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Client Paid</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-lg font-bold text-theme-primary">${project.remainingToPay.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Remaining to Pay</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className={`text-lg font-bold ${project.profitToDate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${project.profitToDate.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Profit to Date</div>
                    </div>
                  </div>

                  {/* Progress Bars */}
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Project Completion</span>
                        <span>{project.completionPercentage.toFixed(0)}%</span>
                      </div>
                      <Progress value={project.completionPercentage} className="h-2" />
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Budget Utilization</span>
                        <span>{project.budgetUtilization.toFixed(0)}%</span>
                      </div>
                      <Progress 
                        value={Math.min(100, project.budgetUtilization)} 
                        className={`h-2 ${project.budgetUtilization > 100 ? '[&>div]:bg-red-500' : project.budgetUtilization > 85 ? '[&>div]:bg-yellow-500' : ''}`}
                      />
                    </div>
                  </div>

                  {/* Key Metrics Row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                    <div className="flex items-center space-x-2">
                      <Calculator className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className={`font-medium ${project.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {project.profitMargin.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-600">Profit Margin</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="font-medium">${project.burnRate.toLocaleString()}</div>
                        <div className="text-xs text-gray-600">Monthly Burn Rate</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Receipt className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="font-medium">${project.clientBalance.toLocaleString()}</div>
                        <div className="text-xs text-gray-600">Client Balance</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <div>
                        <div className="font-medium">
                          {project.lastPaymentDate ? 
                            new Date(project.lastPaymentDate).toLocaleDateString() : 
                            'No payments'
                          }
                        </div>
                        <div className="text-xs text-gray-600">Last Payment</div>
                      </div>
                    </div>
                  </div>

                  {/* Alerts for Critical Projects */}
                  {project.cashFlowHealth === 'critical' && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        <div className="text-sm text-red-800 font-medium">
                          Critical Cash Flow Alert
                        </div>
                      </div>
                      <div className="text-sm text-red-700 mt-1">
                        {project.clientBalance < 0 ? 
                          'Client balance is negative. Immediate payment required.' :
                          'Remaining payment obligations exceed client balance. Review project scope.'
                        }
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}