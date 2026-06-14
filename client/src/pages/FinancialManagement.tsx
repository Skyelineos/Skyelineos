import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import FinancialManagementDashboard from '@/components/financial/FinancialManagementDashboard';
import { AppLayout } from '@/components/layout/AppLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { DollarSign, TrendingUp, Calculator, Building2 } from 'lucide-react';

export default function FinancialManagement() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const isMobile = useIsMobile();

  // Fetch all projects for selection
  const { data: projects = [], isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ['/api/projects'],
  });

  // Mock financial overview data
  const financialOverview = {
    totalRevenue: 2450000,
    totalCosts: 1960000,
    netProfit: 490000,
    profitMargin: 20.0,
    activeProjects: projects?.length || 0,
    projectsOnBudget: Math.floor((projects?.length || 0) * 0.8),
    projectsOverBudget: Math.floor((projects?.length || 0) * 0.2),
    automationSavings: 45000
  };

  if (projectsLoading) {
    return (
      <AppLayout>
        <div className="mb-6">
          <h1 className="text-3xl font-bold font-heading text-brand-black">Financial Management</h1>
          <p className="text-brand-dark-gray-blue">Loading financial data...</p>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold font-heading text-brand-black">Financial Management</h1>
        <p className="text-brand-dark-gray-blue">Advanced financial analysis and automation</p>
      </div>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="lg:block hidden">
            <h1 className="text-3xl font-bold">Financial Management</h1>
            <p className="text-gray-600">
              Advanced financial analysis and automation for construction projects
            </p>
          </div>
        <div className="flex gap-2">
          <Select value={selectedProject?.toString() || ""} onValueChange={(value) => setSelectedProject(parseInt(value))}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a project for detailed analysis" />
            </SelectTrigger>
            <SelectContent>
              {projects?.map((project: any) => (
                <SelectItem key={project.id} value={project.id.toString()}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Company-wide Financial Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${financialOverview.totalRevenue.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">
              Across all projects
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-theme-primary" />
              Net Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-theme-primary">
              ${financialOverview.netProfit.toLocaleString()}
            </div>
            <div className="text-sm text-green-600">
              {financialOverview.profitMargin.toFixed(1)}% margin
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-purple-600" />
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {financialOverview.activeProjects}
            </div>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline" className="text-green-600">
                {financialOverview.projectsOnBudget} on budget
              </Badge>
              <Badge variant="outline" className="text-red-600">
                {financialOverview.projectsOverBudget} over budget
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-orange-600" />
              Automation Savings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              ${financialOverview.automationSavings.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">
              This year
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Selection Message */}
      {!selectedProject && (
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Select a Project</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              Choose a project from the dropdown above to access detailed financial analysis, cost variance tracking, 
              cash flow forecasting, profit margin analysis, and automated financial management tools.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects?.slice(0, 6).map((project: any) => (
                <Card key={project.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedProject(project.id)}>
                  <CardContent className="p-4">
                    <div className="font-medium">{project.name}</div>
                    <div className="text-sm text-gray-500 mb-2">{project.clientName}</div>
                    <div className="text-sm text-gray-600">
                      Budget: ${project.estimatedBudget?.toLocaleString() || 'N/A'}
                    </div>
                    <Badge variant="outline" className="mt-2">
                      {project.status}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project-specific Financial Management Dashboard */}
      {selectedProject && (
        <FinancialManagementDashboard projectId={selectedProject} />
      )}
      </div>
    </AppLayout>
  );
}