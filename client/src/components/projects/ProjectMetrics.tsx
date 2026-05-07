import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TransformedProject } from '@/lib/projectUtils';
import { useProjectMetrics } from '@/hooks/useProjectMetrics';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface ProjectMetricsProps {
  projects: TransformedProject[];
}

export function ProjectMetrics({ projects }: ProjectMetricsProps) {
  const metrics = useProjectMetrics(projects);

  if (!projects.length) {
    return (
      <Card className="bg-gray-50">
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <Users className="mx-auto h-12 w-12 mb-3 opacity-50" />
            <p>No projects found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const alertsByType = {
    high: metrics.alerts.filter(a => a.severity === 'high'),
    medium: metrics.alerts.filter(a => a.severity === 'medium'),
    low: metrics.alerts.filter(a => a.severity === 'low'),
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Projects */}
      <Card className="bg-gray-50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.totalProjects}</div>
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <div className="flex items-center">
              <CheckCircle className="mr-1 h-3 w-3 text-green-500" />
              {metrics.completedProjects} completed
            </div>
            <div className="flex items-center">
              <Clock className="mr-1 h-3 w-3 text-blue-500" />
              {metrics.activeProjects} active
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget Overview */}
      <Card className="bg-gray-50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Budget Overview</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            ${(metrics.totalBudget / 1000000).toFixed(1)}M
          </div>
          <Progress 
            value={metrics.budgetUtilization} 
            className="mt-2" 
          />
          <p className="text-xs text-muted-foreground mt-2">
            {metrics.budgetUtilization.toFixed(1)}% utilized
          </p>
        </CardContent>
      </Card>

      {/* Completion Rate */}
      <Card className="bg-gray-50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics.completionRate.toFixed(1)}%</div>
          <Progress 
            value={metrics.completionRate} 
            className="mt-2" 
          />
          <p className="text-xs text-muted-foreground mt-2">
            {metrics.completedProjects} of {metrics.totalProjects} projects
          </p>
        </CardContent>
      </Card>

      {/* Alerts & Status */}
      <Card className="bg-gray-50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Status & Alerts</CardTitle>
          <AlertTriangle className={`h-4 w-4 ${
            alertsByType.high.length > 0 ? 'text-red-500' :
            alertsByType.medium.length > 0 ? 'text-yellow-500' : 'text-green-500'
          }`} />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {alertsByType.high.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {alertsByType.high.length} High Priority
              </Badge>
            )}
            {alertsByType.medium.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {alertsByType.medium.length} Medium Priority
              </Badge>
            )}
            {metrics.overdueProjects > 0 && (
              <div className="text-xs text-red-600">
                {metrics.overdueProjects} overdue project{metrics.overdueProjects > 1 ? 's' : ''}
              </div>
            )}
            {metrics.alerts.length === 0 && (
              <div className="text-xs text-green-600">All projects on track</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}