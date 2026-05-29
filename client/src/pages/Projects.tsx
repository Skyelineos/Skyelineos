import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';

import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { calculateLiveProgress } from '@/lib/progressUtils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { NewProjectForm } from '@/components/projects/NewProjectForm';
import { ProjectGridSkeleton } from '@/components/projects/ProjectSkeleton';
import { useAuth } from '@/hooks/use-auth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { statusColors, getStatusLabel, getStatusBadgeClass } from '@/lib/projectUtils';
import { invalidateQueries } from '@/lib/apiCache';
import { useOptimizedProjects } from '@/hooks/useOptimizedProjects';
import { useAdvancedSearch } from '@/hooks/useAdvancedSearch';
import { ProjectFilters } from '@/components/projects/ProjectFilters';
import { ProjectMetrics } from '@/components/projects/ProjectMetrics';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  Search,
  Plus,
  Filter,
  Calendar,
  DollarSign,
  MapPin,
  Users,
  FolderOpen,
  Trash2,
  Archive,
  MoreVertical,
  Edit3,
  Grid3X3,
  List,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

// Project Card component with live progress calculation
function ProjectCard({ 
  project, 
  isEditMode, 
  selectedProjects, 
  toggleProjectSelection, 
  handleArchiveProject, 
  handleDeleteProject, 
  prefetchProject 
}: {
  project: any;
  isEditMode: boolean;
  selectedProjects: number[];
  toggleProjectSelection: (id: number) => void;
  handleArchiveProject: (id: number) => void;
  handleDeleteProject: (id: number) => void;
  prefetchProject: (id: number) => void;
}) {
  const { data: liveProgress, isLoading: progressLoading, error: progressError } = useQuery({
    queryKey: ['liveProgress', project.id],
    queryFn: () => calculateLiveProgress(project.id),
    staleTime: 30000, // Refresh every 30 seconds
    refetchInterval: 60000, // Auto-refresh every minute
    retry: (failureCount, error: any) => {
      // Don't retry if project not found (404)
      if (error?.message?.includes('404')) {
        return false;
      }
      return failureCount < 2;
    },
  });

  // Handle progress display with error states
  const displayProgress = progressLoading ? 0 : progressError ? 0 : (liveProgress?.completionPercentage || 0);

  return (
    <Card className={`bg-gray-50 hover:shadow-lg transition-shadow ${isEditMode ? 'cursor-default' : 'cursor-pointer'} ${selectedProjects.includes(project.id) ? 'ring-2 ring-blue-500' : ''}`}>
      {!isEditMode ? (
        <Link 
          href={`/projects/${project.id}`} 
          className="block"
          onMouseEnter={() => prefetchProject(project.id)}
        >
          <ProjectCardContent 
            project={project} 
            displayProgress={displayProgress} 
            progressLoading={progressLoading}
            isEditMode={isEditMode}
            selectedProjects={selectedProjects}
            toggleProjectSelection={toggleProjectSelection}
            handleArchiveProject={handleArchiveProject}
            handleDeleteProject={handleDeleteProject}
          />
        </Link>
      ) : (
        <div 
          className="relative"
          onClick={() => toggleProjectSelection(project.id)}
        >
          <div className="absolute top-4 left-4 z-10">
            <Checkbox
              checked={selectedProjects.includes(project.id)}
              onChange={() => toggleProjectSelection(project.id)}
            />
          </div>
          <ProjectCardContent 
            project={project} 
            displayProgress={displayProgress} 
            progressLoading={progressLoading}
            isEditMode={true}
            selectedProjects={selectedProjects}
            toggleProjectSelection={toggleProjectSelection}
            handleArchiveProject={handleArchiveProject}
            handleDeleteProject={handleDeleteProject}
          />
        </div>
      )}
    </Card>
  );
}

// Project card content component
function ProjectCardContent({ 
  project, 
  displayProgress, 
  progressLoading, 
  isEditMode, 
  selectedProjects, 
  toggleProjectSelection, 
  handleArchiveProject, 
  handleDeleteProject 
}: {
  project: any;
  displayProgress: number;
  progressLoading: boolean;
  isEditMode: boolean;
  selectedProjects?: number[];
  toggleProjectSelection?: (id: number) => void;
  handleArchiveProject?: (id: number) => void;
  handleDeleteProject?: (id: number) => void;
}) {
  return (
    <>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className={`space-y-1 flex-1 ${isEditMode ? 'ml-8' : ''}`}>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg line-clamp-2">
                {project.name}
              </CardTitle>
            </div>
            <CardDescription className="flex items-center">
              <Users className="mr-1 h-4 w-4" />
              {project.client}
            </CardDescription>
          </div>
          <div className="flex items-start gap-2">
            <Badge 
              variant="outline" 
              className={`font-medium ${getStatusBadgeClass(project.status)}`}
            >
              {getStatusLabel(project.status)}
            </Badge>
            {!isEditMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleArchiveProject?.(project);
                    }}
                    className="text-orange-600 focus:text-orange-600"
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive Project
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteProject?.(project);
                    }}
                    className="text-red-600 focus:text-red-600"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Address */}
          <div className="flex items-start text-sm text-gray-600">
            <MapPin className="mr-2 h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-2">{project.address}</span>
          </div>

          {/* Live Progress */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="font-medium">Progress</span>
              <span>{progressLoading ? '...' : `${displayProgress}%`}</span>
            </div>
            <Progress value={displayProgress} className="h-2" />
          </div>

          {/* Budget */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center text-gray-600">
              <DollarSign className="mr-1 h-4 w-4" />
              <span>Budget</span>
            </div>
            <div className="text-right">
              <div className="font-medium">
                ${project.spent.toLocaleString()} / ${project.budget.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">
                {Math.round((project.spent / project.budget) * 100)}% spent
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center text-gray-600">
              <Calendar className="mr-1 h-4 w-4" />
              <span>Timeline</span>
            </div>
            <div className="text-right text-xs text-gray-500">
              <div>{new Date(project.startDate).toLocaleDateString()}</div>
              <div>to {new Date(project.targetCompletion).toLocaleDateString()}</div>
            </div>
          </div>

          {/* Project Details */}
          <div className="pt-2 border-t text-xs text-gray-500">
            <div className="flex justify-between">
              <span>{project.squareFootage.toLocaleString()} sq ft</span>
              <span>PM: {project.projectManager}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </>
  );
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const [isNewProjectFormOpen, setIsNewProjectFormOpen] = useState(false);
  const [deleteProject, setDeleteProject] = useState<{ id: number; name: string } | null>(null);
  const [archiveProject, setArchiveProject] = useState<{ id: number; name: string } | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [sortBy, setSortBy] = useState<string>("name");
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();


  // Load saved view mode and sort preference from localStorage
  useEffect(() => {
    const storedView = localStorage.getItem("projectView");
    const storedSort = localStorage.getItem("projectSort");
    
    if (storedView && (storedView === "cards" || storedView === "list")) {
      setViewMode(storedView as "cards" | "list");
    }
    if (storedSort) {
      setSortBy(storedSort);
    }
  }, []);

  // Save view mode and sort preference to localStorage when they change
  useEffect(() => {
    localStorage.setItem("projectView", viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem("projectSort", sortBy);
  }, [sortBy]);

  // Sort projects based on selected criteria
  const sortProjects = (projects: any[], sortKey: string) => {
    const sorted = [...projects].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'start-date':
          return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        case 'start-date-desc':
          return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
        case 'end-date':
          return new Date(a.targetCompletion).getTime() - new Date(b.targetCompletion).getTime();
        case 'end-date-desc':
          return new Date(b.targetCompletion).getTime() - new Date(a.targetCompletion).getTime();
        case 'budget':
          return a.budget - b.budget;
        case 'budget-desc':
          return b.budget - a.budget;
        case 'progress':
          return (a.progress || 0) - (b.progress || 0);
        case 'progress-desc':
          return (b.progress || 0) - (a.progress || 0);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'client':
          const clientA = a.clientName || a.client || '';
          const clientB = b.clientName || b.client || '';
          return clientA.localeCompare(clientB);
        default:
          return 0;
      }
    });
    return sorted;
  };

  // Use optimized project data fetching with intelligent caching and prefetching
  const { projects: allProjects, isLoading, error, prefetchProject } = useOptimizedProjects();

  // Advanced search with fuzzy matching and intelligent filtering
  const {
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    filteredProjects: unsortedProjects,
    searchStats,
    clearAllFilters,
    suggestions,
    availableManagers,
    searchInsights,
  } = useAdvancedSearch(allProjects);

  // Apply sorting to filtered projects
  const filteredProjects = sortProjects(unsortedProjects, sortBy);

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      // apiRequest already handles response.ok and returns parsed JSON
      const response = await apiRequest(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });
      
      return response;
    },
    onSuccess: (_, projectId) => {
      toast({
        title: "Project deleted",
        description: "The project has been successfully deleted.",
      });
      
      // Optimistic update - immediately remove from cache
      queryClient.setQueryData(['/api/projects'], (oldData: any[] | undefined) => 
        oldData ? oldData.filter(project => project.id !== projectId) : []
      );
      
      // Clear all related cache entries and force immediate refetch
      queryClient.removeQueries({ queryKey: ['/api/projects'] });
      queryClient.removeQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.removeQueries({ queryKey: ['liveProgress', projectId] });
      queryClient.removeQueries({ queryKey: [`/api/estimates`, projectId.toString()] });
      queryClient.removeQueries({ queryKey: [`/api/bids/${projectId}`] });
      
      // Force immediate refetch of projects to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      invalidateQueries.allProjects(queryClient);
    },
    onError: (error: any) => {
      console.error('Delete project error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete project",
        variant: "destructive",
      });
      // Revert optimistic update on error
      invalidateQueries.allProjects(queryClient);
    },
  });

  // Archive project mutation
  const archiveProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      await apiRequest(`/api/projects/${projectId}/archive`, { method: 'PATCH' });
    },
    onSuccess: (_, projectId) => {
      toast({
        title: "Project archived",
        description: "The project has been successfully archived.",
      });
      
      // Optimistic update - mark as archived
      queryClient.setQueryData(['/api/projects'], (oldData: any[] | undefined) => 
        oldData ? oldData.map(project => 
          project.id === projectId 
            ? { ...project, status: 'archived', isArchived: true }
            : project
        ) : []
      );
      
      invalidateQueries.allProjects(queryClient);
      setArchiveProject(null);
    },
    onError: (error: any) => {
      console.error('Archive project error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to archive project",
        variant: "destructive",
      });
      // Revert optimistic update on error
      invalidateQueries.allProjects(queryClient);
    },
  });

  const handleDeleteProject = (project: any) => {
    setDeleteProject({ id: project.id, name: project.name });
  };

  const handleArchiveProject = (project: any) => {
    setArchiveProject({ id: project.id, name: project.name });
  };

  const confirmDeleteProject = () => {
    if (deleteProject) {
      deleteProjectMutation.mutate(deleteProject.id);
      setDeleteProject(null);
    }
  };

  const confirmArchiveProject = () => {
    if (archiveProject) {
      archiveProjectMutation.mutate(archiveProject.id);
    }
  };

  const handleBulkArchive = () => {
    selectedProjects.forEach(projectId => {
      archiveProjectMutation.mutate(projectId);
    });
    setSelectedProjects([]);
    setIsEditMode(false);
  };

  const handleBulkDelete = () => {
    selectedProjects.forEach(projectId => {
      deleteProjectMutation.mutate(projectId);
    });
    setSelectedProjects([]);
    setIsEditMode(false);
  };

  const toggleProjectSelection = (projectId: number) => {
    setSelectedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const selectAllProjects = () => {
    setSelectedProjects(filteredProjects.map(p => p.id));
  };

  const clearSelection = () => {
    setSelectedProjects([]);
    setIsEditMode(false);
  };

  const handleProjectCreated = (projectId?: string) => {
    // Refresh the projects list with optimized cache invalidation
    invalidateQueries.allProjects(queryClient);
    // Also clear any cached individual project data
    if (projectId) {
      queryClient.removeQueries({ queryKey: [`/api/projects/${projectId}`] });
      queryClient.removeQueries({ queryKey: ['liveProgress', parseInt(projectId)] });
    }
    setIsNewProjectFormOpen(false);
  };

  // Show enhanced loading state with skeleton
  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
              <p className="mt-2 text-gray-600">
                Manage and track all your construction projects
              </p>
            </div>
          </div>
          <ProjectGridSkeleton />
        </div>
      </AppLayout>
    );
  }

  // Show error state
  if (error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          {/* Header - Always show even on error */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
              <p className="mt-2 text-gray-600">
                Manage and track all your construction projects
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="accent"
                className="self-start sm:self-auto"
                onClick={() => setLocation('/projects/setup')}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Project (guided)
              </Button>
              {/* Legacy single-page form — kept so any habit-formed flow
                  still works. The guided wizard is the recommended path
                  and will become the only path in a follow-up update. */}
              <Button
                variant="outline"
                className="self-start sm:self-auto"
                onClick={() => setIsNewProjectFormOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Quick add
              </Button>
              <Button 
                variant="outline"
                className="self-start sm:self-auto"
                onClick={() => setIsEditMode(!isEditMode)}
              >
                <Edit3 className="mr-2 h-4 w-4" />
                Edit Projects
              </Button>
            </div>
          </div>

          {/* Error Message */}
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-red-600 mb-2">Error loading projects</p>
              <p className="text-gray-500 text-sm">{error.message}</p>
              <p className="text-gray-500 text-sm mt-2">You can still create new projects using the button above.</p>
            </div>
          </div>
        </div>

        {/* New Project Form */}
        {isNewProjectFormOpen && (
          <NewProjectForm
            isOpen={isNewProjectFormOpen}
            onClose={() => setIsNewProjectFormOpen(false)}
            onProjectCreated={(projectId) => {
              setIsNewProjectFormOpen(false);
              // Attempt to refresh projects list
              window.location.reload();
            }}
          />
        )}
      </AppLayout>
    );
  }

  // Projects are filtered and sorted by the advanced search hook


  const projectsContent = (
    <div className="space-y-6">
      {/* Header - Always visible */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
          <p className="mt-2 text-gray-600">
            Manage and track all your construction projects
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="accent"
            onClick={() => setIsNewProjectFormOpen(true)}
            data-accent="true"
            style={{ backgroundColor: 'var(--accent-color)', color: 'white', border: '1px solid var(--accent-color)' }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
          {allProjects && allProjects.length > 0 && (
            <Button 
              variant="outline"
              className="self-start sm:self-auto"
              onClick={() => setIsEditMode(!isEditMode)}
            >
              <Edit3 className="mr-2 h-4 w-4" />
              Edit Projects
            </Button>
          )}
        </div>
      </div>

        {/* Project Metrics Dashboard - Only show when projects exist */}
        {allProjects && allProjects.length > 0 && <ProjectMetrics projects={allProjects} />}

        {/* Bulk Edit Controls */}
        {isEditMode && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedProjects.length} project(s) selected
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selectAllProjects}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearSelection}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
              {selectedProjects.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkArchive}
                    className="text-orange-600 border-orange-600 hover:bg-orange-50"
                  >
                    <Archive className="mr-2 h-4 w-4" />
                    Archive Selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkDelete}
                    className="text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Advanced Search and Filters - Only show when projects exist */}
        {allProjects && allProjects.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 max-w-md">
              <Input
                placeholder="Search projects, clients, addresses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex gap-2">
              <ToggleGroup 
                type="single" 
                value={viewMode} 
                onValueChange={(value: string) => {
                  if (value && (value === "cards" || value === "list")) {
                    setViewMode(value as "cards" | "list");
                  }
                }}
              >
                <ToggleGroupItem value="cards" className="px-3">
                  <Grid3X3 className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" className="px-3">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                  <SelectItem value="start-date">Start Date (Earliest)</SelectItem>
                  <SelectItem value="start-date-desc">Start Date (Latest)</SelectItem>
                  <SelectItem value="end-date">End Date (Earliest)</SelectItem>
                  <SelectItem value="end-date-desc">End Date (Latest)</SelectItem>
                  <SelectItem value="budget">Budget (Low to High)</SelectItem>
                  <SelectItem value="budget-desc">Budget (High to Low)</SelectItem>
                  <SelectItem value="progress">Progress (Low to High)</SelectItem>
                  <SelectItem value="progress-desc">Progress (High to Low)</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="client">Client Name</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              {(searchTerm || statusFilter !== 'all') && (
                <Button 
                  variant="outline" 
                  onClick={clearAllFilters}
                  size="sm"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Project Display - Card or List View */}
        {viewMode === "cards" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isEditMode={isEditMode}
                selectedProjects={selectedProjects}
                toggleProjectSelection={toggleProjectSelection}
                handleArchiveProject={handleArchiveProject}
                handleDeleteProject={handleDeleteProject}
                prefetchProject={prefetchProject}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  {isEditMode && (
                    <th className="p-4">
                      <Checkbox
                        checked={selectedProjects.length === filteredProjects.length && filteredProjects.length > 0}
                        onCheckedChange={() => 
                          selectedProjects.length === filteredProjects.length 
                            ? clearSelection() 
                            : selectAllProjects()
                        }
                      />
                    </th>
                  )}
                  <th className="p-4 font-medium text-gray-900">Project Name</th>
                  <th className="p-4 font-medium text-gray-900">Client</th>
                  <th className="p-4 font-medium text-gray-900">Location</th>
                  <th className="p-4 font-medium text-gray-900">Status</th>
                  <th className="p-4 font-medium text-gray-900">Budget</th>
                  <th className="p-4 font-medium text-gray-900">Progress</th>
                  <th className="p-4 font-medium text-gray-900">Timeline</th>
                  <th className="p-4 font-medium text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project, index) => {
                  
                  return (
                    <tr
                      key={project.id}
                      className={`border-b hover:bg-gray-50 cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}
                      onMouseEnter={() => !isEditMode && prefetchProject(project.id)}
                      onTouchStart={() => !isEditMode && prefetchProject(project.id)}
                      onClick={() => {
                        if (!isEditMode) {
                          prefetchProject(project.id);
                          // Client-side navigation keeps React Query's cache
                          // warm — no full page reload, no re-fetch from cold.
                          setLocation(`/projects/${project.id}`);
                        }
                      }}
                    >
                      {isEditMode && (
                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedProjects.includes(project.id)}
                            onCheckedChange={() => toggleProjectSelection(project.id)}
                          />
                        </td>
                      )}
                      <td className="p-4">
                        <div className="font-medium text-gray-900">{project.name}</div>
                        <div className="text-xs text-gray-500">{project.squareFootage.toLocaleString()} sq ft</div>
                      </td>
                      <td className="p-4 text-gray-600">{project.clientName || project.client || 'N/A'}</td>
                      <td className="p-4 text-gray-600">
                        <div className="max-w-48 truncate">{project.address}</div>
                      </td>
                      <td className="p-4">
                        <Badge className={getStatusBadgeClass(project.status)}>
                          {getStatusLabel(project.status)}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="text-gray-900">${project.budget.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">
                          ${project.spent.toLocaleString()} spent ({Math.round((project.spent / project.budget) * 100)}%)
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Progress value={project.progress || 0} className="h-2 w-16" />
                          <span className="text-xs text-gray-600">{project.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="p-4 text-xs text-gray-500">
                        <div>{new Date(project.startDate).toLocaleDateString()}</div>
                        <div>to {new Date(project.targetCompletion).toLocaleDateString()}</div>
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLocation(`/projects/${project.id}`)}>
                              <FolderOpen className="mr-2 h-4 w-4" />
                              View Project
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleArchiveProject(project)}
                              className="text-orange-600 focus:text-orange-600"
                            >
                              <Archive className="mr-2 h-4 w-4" />
                              Archive Project
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteProject(project)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {filteredProjects.length === 0 && (
          <Card>
            <CardContent className="text-center py-16">
              <div className="text-gray-400 mb-6">
                <FolderOpen className="mx-auto h-16 w-16" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No projects found
              </h3>
              <p className="text-gray-500 mb-8 text-base">
                {searchTerm || statusFilter !== 'all' 
                  ? "Try adjusting your search or filter criteria"
                  : "Get started by creating your first project"
                }
              </p>
              {/* Always show the Create Project button prominently */}
              <div className="space-y-4">
                <Button
                  variant="accent"
                  onClick={() => setIsNewProjectFormOpen(true)}
                  className="text-lg px-8 py-3 rounded-lg"
                  size="lg"
                  data-accent="true"
                  style={{ backgroundColor: 'var(--accent-color)', color: 'white', border: '1px solid var(--accent-color)' }}
                >
                  <Plus className="mr-2 h-5 w-5" />
                  Create Project
                </Button>
                {searchTerm || statusFilter !== 'all' ? (
                  <div>
                    <Button
                      onClick={clearAllFilters}
                      variant="outline"
                      className="ml-4"
                    >
                      Clear Filters
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}

        {/* New Project Form Modal */}
        <NewProjectForm
          isOpen={isNewProjectFormOpen}
          onClose={() => setIsNewProjectFormOpen(false)}
          onProjectCreated={handleProjectCreated}
        />

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteProject} onOpenChange={() => setDeleteProject(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{deleteProject?.name}"? This action cannot be undone and will permanently remove all associated estimates, bids, and project data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteProject}
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteProjectMutation.isPending}
              >
                {deleteProjectMutation.isPending ? 'Deleting...' : 'Delete Project'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Archive Confirmation Dialog */}
        <AlertDialog open={!!archiveProject} onOpenChange={() => setArchiveProject(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive Project</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to archive "{archiveProject?.name}"? This will change the project status to archived and hide it from the active projects list. You can still access archived projects by filtering for them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmArchiveProject}
                className="bg-orange-600 hover:bg-orange-700"
                disabled={archiveProjectMutation.isPending}
              >
                {archiveProjectMutation.isPending ? 'Archiving...' : 'Archive Project'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </div>
  );



  return (
    <ErrorBoundary>
      <AppLayout>
        {projectsContent}
      </AppLayout>
    </ErrorBoundary>
  );
}