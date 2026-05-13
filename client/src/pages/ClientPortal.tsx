import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { SkyelineBrandedLayout } from '@/components/client-portal/SkyelineBrandedLayout';
import { SkyelineDashboard } from '@/components/client-portal/SkyelineDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { 
  Home, 
  FileText, 
  Calendar, 
  MessageSquare, 
  CheckSquare, 
  Shield,
  Palette,
  Camera,
  Clock,
  AlertCircle,
  CheckCircle,
  Eye,
  Download,
  Upload,
  Filter,
  DollarSign,
  User,
  Building
} from 'lucide-react';

// Import section components
import DocumentsSection from '@/components/client-portal/DocumentsSection';
import ScheduleSection from '@/components/client-portal/ScheduleSection';
import { ProjectReviewBanner } from '@/components/reviews/ProjectReviewBanner';
import CommunicationSection from '@/components/client-portal/CommunicationSection';
import PunchlistSection from '@/components/client-portal/PunchlistSection';
import WarrantySection from '@/components/client-portal/WarrantySection';
import EstimatesSection from '@/components/client-portal/EstimatesSection';
import { MessagingModule } from '@/components/messaging/MessagingModule';
import { MyContractsView } from '@/components/contracts/MyContractsView';
import { ChatThread } from '@/components/ui/ChatThread';

// Get actual client user from authentication or mock based on URL/query params
const getClientUser = () => {
  // Check URL params for demo clients
  const urlParams = new URLSearchParams(window.location.search);
  const demoClient = urlParams.get('client');
  
  if (demoClient === 'stan-park') {
    return {
      id: 'stan-park',
      name: 'Stan Park',
      email: 'stan.park@example.com',
      role: 'client' as const,
      avatar: '/api/placeholder/40/40',
      projects: ['455'] // Park Home project
    };
  } else if (demoClient === 'jennifer-brown') {
    return {
      id: 'jennifer-brown',
      name: 'Jennifer Brown',
      email: 'j.brown@outlook.com',
      role: 'client' as const,
      avatar: '/api/placeholder/40/40',
      projects: ['4'] // Daniel's Addition project
    };
  } else if (demoClient === 'gary-adamson') {
    return {
      id: 'gary-adamson',
      name: 'Gary Adamson',
      email: 'gary.adamson@email.com',
      role: 'client' as const,
      avatar: '/api/placeholder/40/40',
      projects: ['457'] // Adamson Home project
    };
  }
  
  // Default to Jennifer Brown for backward compatibility
  return {
    id: 'jennifer-brown',
    name: 'Jennifer Brown',
    email: 'j.brown@outlook.com',
    role: 'client' as const,
    avatar: '/api/placeholder/40/40',
    projects: ['4'] // Daniel's Addition project
  };
};

const mockClientUser = getClientUser();

export default function ClientPortal() {
  const [match] = useRoute('/client-portal/:tab?');
  const [location, navigate] = useLocation();
  const currentTab = match ? (match as any).tab || 'dashboard' : 'dashboard';
  const { user } = useAuth();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleNavigate = (tab: string) => {
    navigate(`/client-portal/${tab}`);
  };

  // Fetch client's projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/projects'],
    queryFn: async () => {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      return response.json();
    },
  });

  // Filter projects for this client
  const clientProjects = projects.filter((p: any) => 
    mockClientUser.projects.includes(p.id.toString())
  );

  // Set the first project as default if none selected
  React.useEffect(() => {
    if (clientProjects.length > 0 && !selectedProject) {
      setSelectedProject(clientProjects[0].id.toString());
    }
  }, [clientProjects, selectedProject]);

  const project = clientProjects.find((p: any) => p.id.toString() === selectedProject);

  // Mock data for demonstration
  const documents = [
    {
      id: '1',
      name: 'Construction Plans - Phase 1',
      type: 'plans',
      documentType: 'plans',
      size: '2.4 MB',
      uploadDate: '2024-01-15',
      clientApproved: true,
      url: '/api/placeholder/document/1'
    },
    {
      id: '2',
      name: 'Electrical Plans',
      type: 'plans',
      documentType: 'plans',
      size: '1.8 MB',
      uploadDate: '2024-01-18',
      clientApproved: false,
      url: '/api/placeholder/document/2'
    }
  ];

  const schedule = [
    {
      id: '1',
      title: 'Foundation Work',
      trade: 'Foundation',
      startDate: '2024-01-20',
      endDate: '2024-01-25',
      status: 'Complete',
      subcontractor: 'ABC Foundation'
    },
    {
      id: '2',
      title: 'Framing',
      trade: 'Framing',
      startDate: '2024-01-26',
      endDate: '2024-02-05',
      status: 'In Progress',
      subcontractor: 'XYZ Framing'
    }
  ];

  const photos = [
    {
      id: '1',
      title: 'Foundation Complete',
      category: 'Foundation',
      uploadDate: '2024-01-25',
      url: '/api/placeholder/400/300'
    }
  ];

  const getProgress = () => {
    const completed = schedule.filter(task => task.status === 'Complete').length;
    return Math.round((completed / schedule.length) * 100);
  };

  const getCurrentPhase = () => {
    const inProgress = schedule.find(task => task.status === 'In Progress');
    return inProgress?.trade || 'Planning';
  };

  const getPendingActions = () => {
    const actions = [];
    
    // Check for documents needing approval
    const pendingDocs = documents.filter(doc => 
      doc.documentType === 'plans' && !doc.clientApproved
    );
    if (pendingDocs.length > 0) {
      actions.push({
        type: 'approval',
        title: 'Plans Awaiting Approval',
        count: pendingDocs.length,
        action: 'Review and approve construction plans'
      });
    }

    // Check for upcoming milestones
    const upcomingMilestones = schedule.filter(task => 
      task.status === 'Scheduled' && new Date(task.startDate) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );
    if (upcomingMilestones.length > 0) {
      actions.push({
        type: 'milestone',
        title: 'Upcoming Milestones',
        count: upcomingMilestones.length,
        action: 'Prepare for upcoming project phases'
      });
    }

    return actions;
  };

  const renderDashboard = () => {
    if (!project) {
      return (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">No project selected or no projects available.</p>
          </CardContent>
        </Card>
      );
    }

    const progress = getProgress();
    const currentPhase = getCurrentPhase();
    const pendingActions = getPendingActions();

    return (
      <div className="space-y-6">
        {/* Review prompt — only shows when project is at the end of its lifecycle
            and this client hasn't already submitted a review. */}
        <ProjectReviewBanner
          projectId={String(project.id)}
          projectName={project.name}
          projectStatus={project.status}
        />
        {/* Project Header */}
        <Card className="bg-gray-50">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{project.name}</CardTitle>
                <p className="text-gray-600 mt-1">
                  Project Manager: {project.assignedProjectManager || 'Unassigned'}
                </p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="mb-2">
                  {project.status || 'Active'}
                </Badge>
                <p className="text-sm text-gray-500">
                  Budget: ${project.targetBudget?.toLocaleString() || 'Not set'}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-5 w-5 text-theme-primary" />
                  <span className="font-medium">Current Phase</span>
                </div>
                <p className="text-lg font-semibold text-theme-primary">{currentPhase}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium">Progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={progress} className="flex-1" />
                  <span className="text-lg font-semibold text-green-600">{progress}%</span>
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium">Action Items</span>
                </div>
                <p className="text-lg font-semibold text-yellow-600">
                  {pendingActions.length} pending
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity & Pending Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {schedule.slice(0, 3).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="text-sm text-gray-500">{task.subcontractor}</p>
                    </div>
                    <Badge 
                      variant={task.status === 'Complete' ? 'default' : 'secondary'}
                      className={task.status === 'Complete' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}
                    >
                      {task.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pending Actions */}
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Action Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingActions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No pending actions</p>
                ) : (
                  pendingActions.map((action, index) => (
                    <div key={index} className="p-3 border rounded-lg border-orange-200 bg-orange-50">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-orange-800">{action.title}</p>
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          {action.count}
                        </Badge>
                      </div>
                      <p className="text-sm text-orange-700">{action.action}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Access */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>Quick Access</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center gap-2"
                onClick={() => setActiveTab('documents')}
              >
                <FileText className="h-6 w-6" />
                <span>Documents</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center gap-2"
                onClick={() => setActiveTab('schedule')}
              >
                <Calendar className="h-6 w-6" />
                <span>Schedule</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center gap-2"
                onClick={() => setActiveTab('messages')}
              >
                <MessageSquare className="h-6 w-6" />
                <span>Messages</span>
              </Button>
              <Button
                variant="outline"
                className="h-20 flex flex-col items-center gap-2"
                onClick={() => setActiveTab('punchlist')}
              >
                <CheckSquare className="h-6 w-6" />
                <span>Punch List</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTabContent = () => {
    if (!project) {
      return (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <p className="text-center text-gray-500">No project selected or no projects available.</p>
          </CardContent>
        </Card>
      );
    }

    switch (currentTab) {
      case 'dashboard':
        return renderDashboard();
      case 'contracts':
        return <MyContractsView userId={user?.firebaseUid || ''} audience="client" />;
      case 'documents':
        return <DocumentsSection projectId={selectedProject} />;
      case 'design':
        return (
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Design Selections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Design selection interface coming soon...</p>
            </CardContent>
          </Card>
        );
      case 'schedule':
        return <ScheduleSection projectId={selectedProject} />;
      case 'estimates':
        return <EstimatesSection projectId={selectedProject} />;
      case 'messages':
        return (
          <Card className="bg-gray-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Project Messages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* General Project Chat */}
                <div className="h-96 border rounded-lg bg-white">
                  <ChatThread 
                    threadId={`project-${selectedProject}-client`}
                    threadTitle={`${project?.name || 'Project'} - General Discussion`}
                    className="h-full"
                  />
                </div>
                
                {/* Interior Room Discussions for Clients */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="h-80 border rounded-lg bg-white">
                    <ChatThread 
                      threadId={`project-${selectedProject}-kitchen`}
                      threadTitle="Kitchen Design & Progress"
                      className="h-full"
                    />
                  </div>
                  <div className="h-80 border rounded-lg bg-white">
                    <ChatThread 
                      threadId={`project-${selectedProject}-bathroom`}
                      threadTitle="Bathroom Design & Progress"
                      className="h-full"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case 'punchlist':
        return <PunchlistSection projectId={selectedProject} />;
      case 'warranty':
        return <WarrantySection projectId={selectedProject} />;
      default:
        return renderDashboard();
    }
  };

  if (projectsLoading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-accent mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your projects...</p>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {currentTab.charAt(0).toUpperCase() + currentTab.slice(1).replace('-', ' ')}
            </h1>
            <p className="text-gray-600">
              {mockClientUser.name} | {project?.name || 'No Project Selected'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Project Selector */}
            {clientProjects.length > 1 && (
              <div className="flex items-center space-x-2">
                <label className="text-sm text-gray-600">Project:</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="border rounded-md px-3 py-1 text-sm bg-white"
                >
                  {clientProjects.map((project: any) => (
                    <option key={project.id} value={project.id.toString()}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* User Info */}
            <div className="flex items-center space-x-3">
              <Avatar>
                <AvatarImage src={mockClientUser.avatar} />
                <AvatarFallback>{mockClientUser.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
              </Avatar>
              <div className="hidden md:block">
                <div className="text-sm font-medium text-gray-900">{mockClientUser.name}</div>
                <div className="text-xs text-gray-500">{mockClientUser.email}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {renderTabContent()}
        </div>
      </div>
    </ClientLayout>
  );
}