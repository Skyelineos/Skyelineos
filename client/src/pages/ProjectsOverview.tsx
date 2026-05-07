import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/use-auth';
import { 
  BarChart3, 
  Calendar, 
  DollarSign, 
  FolderOpen, 
  Plus, 
  TrendingUp,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle,
  Activity,
  Building,
  Target,
  Grid,
  List,
  User,
  ArrowUpDown
} from 'lucide-react';

interface ProjectSummary {
  id: number;
  name: string;
  status: string;
  progress: number;
  budget: number;
  spent: number;
  startDate: string;
  endDate: string;
  clientName: string;
  address: string;
}

interface ProjectStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalBudget: number;
  totalSpent: number;
  averageProgress: number;
  overdueProjects: number;
  onTrackProjects: number;
}



export default function ProjectsOverview() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/projects/stats'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  const { data: recentProjects, isLoading: recentLoading } = useQuery({
    queryKey: ['/api/projects/recent'],
    staleTime: 2 * 60 * 1000 // 2 minutes
  });

  const { data: upcomingMilestones, isLoading: milestonesLoading } = useQuery({
    queryKey: ['/api/projects/upcoming-milestones'],
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  const { data: allProjects = [], isLoading: allProjectsLoading } = useQuery({
    queryKey: ['/api/projects'],
    staleTime: 2 * 60 * 1000 // 2 minutes
  });



  const projectStats: ProjectStats = (stats as ProjectStats) || {
    totalProjects: 0,
    activeProjects: 0,
    completedProjects: 0,
    totalBudget: 0,
    totalSpent: 0,
    averageProgress: 0,
    overdueProjects: 0,
    onTrackProjects: 0
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'in progress':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'on hold':
        return 'bg-yellow-500';
      case 'cancelled':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'in progress':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'on hold':
        return 'outline';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };



  if (statsLoading || recentLoading || milestonesLoading || allProjectsLoading) {
    return (
      <AppLayout>
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Projects Overview</h1>
            <div className="animate-pulse h-10 w-32 bg-gray-200 rounded"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                    <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                  </div>
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
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FolderOpen className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Projects Overview</h1>
          </div>
          <Link href="/projects/new">
            <Button variant="accent">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Projects</p>
                  <p className="text-2xl font-bold">{projectStats.totalProjects}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Activity className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Active Projects</p>
                  <p className="text-2xl font-bold">{projectStats.activeProjects}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Budget</p>
                  <p className="text-2xl font-bold">{formatCurrency(projectStats.totalBudget)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Target className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Average Progress</p>
                  <p className="text-2xl font-bold">{Math.round(projectStats.averageProgress)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <CheckCircle className="h-5 w-5 mr-2 text-green-600" />
                Completed Projects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {projectStats.completedProjects}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Successfully delivered
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <Clock className="h-5 w-5 mr-2 text-blue-600" />
                On Track
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {projectStats.onTrackProjects}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Meeting deadlines
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-red-600" />
                Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">
                {projectStats.overdueProjects}
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Overdue or at risk
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Budget Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Budget Overview
            </CardTitle>
            <CardDescription>
              Total spending across all active projects
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Budget Utilization</span>
                <span className="text-sm font-medium">
                  {formatCurrency(projectStats.totalSpent)} / {formatCurrency(projectStats.totalBudget)}
                </span>
              </div>
              <Progress 
                value={projectStats.totalBudget > 0 ? (projectStats.totalSpent / projectStats.totalBudget) * 100 : 0}
                className="h-2"
              />
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {projectStats.totalBudget > 0 ? Math.round((projectStats.totalSpent / projectStats.totalBudget) * 100) : 0}% utilized
                </span>
                <span className="text-gray-600">
                  {formatCurrency(projectStats.totalBudget - projectStats.totalSpent)} remaining
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Recent Projects
              </span>
              <Link href="/projects/list">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardTitle>
            <CardDescription>
              Latest project activity and updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentProjects && Array.isArray(recentProjects) && recentProjects.length > 0 ? (
                recentProjects.slice(0, 5).map((project: ProjectSummary) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(project.status)}`}></div>
                          <div>
                            <h4 className="font-medium">{project.name}</h4>
                            <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                              <span className="flex items-center">
                                <Users className="h-3 w-3 mr-1" />
                                {project.clientName}
                              </span>
                              <span className="flex items-center">
                                <MapPin className="h-3 w-3 mr-1" />
                                {project.address}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <Badge variant={getStatusBadgeVariant(project.status)}>
                          {project.status}
                        </Badge>
                        <div className="text-right">
                          <p className="text-sm font-medium">{project.progress}%</p>
                          <Progress value={project.progress} className="w-20 h-1" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Building className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No projects found</p>
                  <Link href="/projects/new">
                    <Button variant="outline" className="mt-2">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Project
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Milestones */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Upcoming Milestones
            </CardTitle>
            <CardDescription>
              Important deadlines and project milestones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingMilestones && Array.isArray(upcomingMilestones) && upcomingMilestones.length > 0 ? (
                upcomingMilestones.slice(0, 5).map((milestone: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 border-l-4 border-l-blue-500 bg-blue-50 rounded-r-lg">
                    <div>
                      <h5 className="font-medium">{milestone.title}</h5>
                      <p className="text-sm text-gray-600">
                        {milestone.projectName} • Due {new Date(milestone.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {milestone.daysRemaining} days
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p>No upcoming milestones</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* All Projects Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center">
                  <Building className="h-5 w-5 mr-2" />
                  All Projects ({allProjects.length})
                </CardTitle>
                <CardDescription>
                  Complete list of your construction projects
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {allProjects && Array.isArray(allProjects) && allProjects.length > 0 ? (
              viewMode === 'grid' ? (
                // Grid View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allProjects.map((project: ProjectSummary) => (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h3 className="font-semibold text-sm truncate">{project.name}</h3>
                              <Badge variant={getStatusBadgeVariant(project.status)}>
                                {project.status}
                              </Badge>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex items-center text-xs text-gray-600">
                                <User className="h-3 w-3 mr-1" />
                                <span className="truncate">{project.clientName}</span>
                              </div>
                              <div className="flex items-center text-xs text-gray-600">
                                <MapPin className="h-3 w-3 mr-1" />
                                <span className="truncate">{project.address}</span>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span>Progress</span>
                                <span>{project.progress}%</span>
                              </div>
                              <Progress value={project.progress} className="h-2" />
                            </div>
                            
                            <div className="flex justify-between items-center pt-2 border-t">
                              <div className="text-xs">
                                <span className="text-gray-500">Budget: </span>
                                <span className="font-medium">{formatCurrency(project.budget)}</span>
                              </div>
                              <div className="text-xs">
                                <span className="text-gray-500">Spent: </span>
                                <span className={`font-medium ${project.spent > project.budget ? 'text-red-600' : 'text-green-600'}`}>
                                  {formatCurrency(project.spent)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                // List View
                <div className="space-y-2">
                  {allProjects.map((project: ProjectSummary) => (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <Card className="hover:bg-gray-50 transition-colors cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                              <div className="md:col-span-2">
                                <h3 className="font-semibold text-sm">{project.name}</h3>
                                <p className="text-xs text-gray-600 truncate">{project.clientName}</p>
                              </div>
                              
                              <div className="text-xs text-gray-600 truncate">
                                {project.address}
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <Badge variant={getStatusBadgeVariant(project.status)} className="text-xs">
                                  {project.status}
                                </Badge>
                              </div>
                              
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span>Progress</span>
                                  <span>{project.progress}%</span>
                                </div>
                                <Progress value={project.progress} className="h-1.5" />
                              </div>
                              
                              <div className="text-right">
                                <div className="text-xs font-medium">{formatCurrency(project.budget)}</div>
                                <div className={`text-xs ${project.spent > project.budget ? 'text-red-600' : 'text-green-600'}`}>
                                  Spent: {formatCurrency(project.spent)}
                                </div>
                              </div>
                            </div>
                            
                            <ArrowUpDown className="h-4 w-4 text-gray-400 ml-4" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Building className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium mb-2">No Projects Yet</h3>
                <p className="text-sm mb-4">Get started by creating your first construction project.</p>
                <Link href="/projects/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Project
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}