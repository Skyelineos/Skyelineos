import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  Clock,
  Users,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Plus,
  Brain,
  Save,
  Settings,
  BarChart3,
  Zap,
  Eye,
  Target,
  AlertCircle,
  CheckCircle,
  Building,
  Wrench,
  Hammer,
  Truck,
  PaintBucket,
  Drill,
  HardHat,
  Home,
  TreePine,
  Wifi,
  Gauge,
  CalendarDays,
  List,
  Grid,
  Link,
  ArrowRight,
  Copy,
  Upload,
  Download,
  FileText
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, differenceInDays } from 'date-fns';
import {
  transformDatabaseTaskToTimeline,
  getTradeColor,
  getStatusColor,
  TRADE_COLORS,
  type TimelineTask,
  type DatabaseTask
} from '@/utils/taskTransformations';

interface ModernTimelineBuilderProps {
  projectId: number;
  readonly?: boolean;
}

// Trade icon mapping
const TRADE_ICONS: { [key: string]: React.ComponentType<{ className?: string }> } = {
  'foundation': Building,
  'excavation': Drill,
  'concrete': Building,
  'framing': Hammer,
  'roofing': Home,
  'electrical': Zap,
  'plumbing': Wrench,
  'hvac': Gauge,
  'drywall': HardHat,
  'painting': PaintBucket,
  'flooring': Hammer,
  'cabinet': Hammer,
  'landscaping': TreePine,
  'cleanup': Truck,
  'inspection': Eye,
  'permit': Settings,
  'default': Wrench
};

// Get appropriate icon for trade
const getTradeIcon = (trade: string) => {
  const tradeLower = trade.toLowerCase();
  for (const [key, icon] of Object.entries(TRADE_ICONS)) {
    if (tradeLower.includes(key)) {
      return icon;
    }
  }
  return TRADE_ICONS.default;
};

// Dependency Selector Component
interface DependencySelectorProps {
  task: EnhancedTask;
  availableTasks: EnhancedTask[];
  onDependenciesChange: (dependencies: string[]) => void;
  isLoading?: boolean;
}

const DependencySelector: React.FC<DependencySelectorProps> = ({ 
  task, 
  availableTasks, 
  onDependenciesChange, 
  isLoading = false 
}) => {
  const [currentDependencies, setCurrentDependencies] = useState<string[]>(task.dependencies || []);

  const toggleDependency = (taskId: string) => {
    const newDependencies = currentDependencies.includes(taskId)
      ? currentDependencies.filter(id => id !== taskId)
      : [...currentDependencies, taskId];
    
    setCurrentDependencies(newDependencies);
  };

  const handleSave = () => {
    onDependenciesChange(currentDependencies);
  };

  const groupedAvailableTasks = useMemo(() => {
    const grouped: { [trade: string]: EnhancedTask[] } = {};
    availableTasks.forEach(t => {
      if (!grouped[t.trade]) grouped[t.trade] = [];
      grouped[t.trade].push(t);
    });
    return grouped;
  }, [availableTasks]);

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        Select which tasks must be completed before "{task.title}" can begin.
      </div>

      <ScrollArea className="h-64 border rounded-lg p-2">
        <div className="space-y-3">
          {Object.entries(groupedAvailableTasks).map(([trade, tradeTasks]) => (
            <div key={trade}>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                {trade}
              </div>
              <div className="space-y-1">
                {tradeTasks.map(availableTask => {
                  const isSelected = currentDependencies.includes(availableTask.id);
                  const TradeIcon = getTradeIcon(availableTask.trade);
                  
                  return (
                    <div
                      key={availableTask.id}
                      className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-50 border-blue-200' 
                          : 'bg-white border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => toggleDependency(availableTask.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border-2 ${
                          isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                        }`}>
                          {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                        </div>
                        <TradeIcon className="w-4 h-4 text-gray-400" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{availableTask.title}</div>
                          <div className="text-xs text-gray-500">
                            {availableTask.duration} days • {format(availableTask.startDate, 'MMM d')}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex justify-between items-center pt-2 border-t">
        <div className="text-sm text-gray-500">
          {currentDependencies.length} dependencies selected
        </div>
        <Button 
          onClick={handleSave} 
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? 'Saving...' : 'Save Dependencies'}
        </Button>
      </div>
    </div>
  );
};

// Enhanced task interface for the timeline
interface EnhancedTask extends TimelineTask {
  dependencies?: string[];
  weatherDependent?: boolean;
  assignedSubcontractor?: string;
}

// Copy Schedule Dialog Component
interface CopyScheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetProjectId: number;
  projects: any[];
}

const CopyScheduleDialog: React.FC<CopyScheduleDialogProps> = ({ 
  isOpen, 
  onClose, 
  targetProjectId, 
  projects 
}) => {
  const [selectedSourceProject, setSelectedSourceProject] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const copySchedule = useMutation({
    mutationFn: async (sourceProjectId: number) => {
      return await apiRequest(`/api/projects/${targetProjectId}/copy-schedule`, {
        method: 'POST',
        body: JSON.stringify({ sourceProjectId }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${targetProjectId}/tasks`] });
      toast({
        title: "Schedule Copied",
        description: `Successfully copied ${data.copiedTasks} tasks from the source project.`,
      });
      onClose();
      setSelectedSourceProject('');
    },
    onError: (error) => {
      toast({
        title: "Copy Failed",
        description: "Failed to copy schedule. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleCopy = () => {
    if (!selectedSourceProject) {
      toast({
        title: "No Project Selected",
        description: "Please select a source project to copy from.",
        variant: "destructive",
      });
      return;
    }
    copySchedule.mutate(parseInt(selectedSourceProject));
  };

  const availableProjects = projects.filter(p => p.id !== targetProjectId);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Copy Schedule from Another Project
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Select a source project to copy its schedule to the current project. All tasks will be copied with adjusted start dates.
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Source Project
            </label>
            <Select value={selectedSourceProject} onValueChange={setSelectedSourceProject}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project to copy from..." />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleCopy}
              disabled={copySchedule.isPending || !selectedSourceProject}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {copySchedule.isPending ? 'Copying...' : 'Copy Schedule'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Import CSV Dialog Component
interface ImportCSVDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
}

const ImportCSVDialog: React.FC<ImportCSVDialogProps> = ({ 
  isOpen, 
  onClose, 
  projectId 
}) => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const importCSV = useMutation({
    mutationFn: async (data: any[]) => {
      return await apiRequest(`/api/projects/${projectId}/import-csv`, {
        method: 'POST',
        body: JSON.stringify({ csvData: data }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "CSV Imported",
        description: `Successfully imported ${data.importedTasks} tasks from CSV.`,
      });
      onClose();
      handleReset();
    },
    onError: (error) => {
      toast({
        title: "Import Failed",
        description: "Failed to import CSV. Please check the format and try again.",
        variant: "destructive",
      });
    }
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCsvFile(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          toast({
            title: "Invalid CSV",
            description: "CSV must have at least a header row and one data row.",
            variant: "destructive",
          });
          return;
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: any = {};
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });
          return row;
        });
        
        setCsvData(rows);
        setPreviewData(rows.slice(0, 5)); // Show first 5 rows for preview
      };
      
      reader.readAsText(file);
    }
  };

  const handleImport = () => {
    if (csvData.length === 0) {
      toast({
        title: "No Data",
        description: "Please select a CSV file with valid data.",
        variant: "destructive",
      });
      return;
    }
    importCSV.mutate(csvData);
  };

  const handleReset = () => {
    setCsvFile(null);
    setCsvData([]);
    setPreviewData([]);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Schedule from CSV
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Upload a CSV file with the following columns: <strong>title, trade, duration, description, estimatedCost</strong>
          </div>
          
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              CSV File
            </label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full p-2 border border-gray-300 rounded-lg"
            />
          </div>
          
          {previewData.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Data Preview (first 5 rows)
              </label>
              <ScrollArea className="h-40 border rounded-lg">
                <div className="p-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-1 text-left">Title</th>
                        <th className="p-1 text-left">Trade</th>
                        <th className="p-1 text-left">Duration</th>
                        <th className="p-1 text-left">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-1">{row.title || row.Title || 'N/A'}</td>
                          <td className="p-1">{row.trade || row.Trade || 'N/A'}</td>
                          <td className="p-1">{row.duration || row.Duration || 'N/A'}</td>
                          <td className="p-1">{row.estimatedCost || row['Estimated Cost'] || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
              <div className="text-xs text-gray-500 mt-1">
                Total rows to import: {csvData.length}
              </div>
            </div>
          )}
          
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <div className="flex gap-2">
              {csvData.length > 0 && (
                <Button variant="outline" onClick={handleReset}>
                  Reset
                </Button>
              )}
              <Button 
                onClick={handleImport}
                disabled={importCSV.isPending || csvData.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {importCSV.isPending ? 'Importing...' : `Import ${csvData.length} Tasks`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export function ModernTimelineBuilder({ projectId, readonly = false }: ModernTimelineBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [activeView, setActiveView] = useState<'gantt' | 'calendar' | 'list'>('gantt');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tradeFilter, setTradeFilter] = useState<string>('all');
  const [durationFilter, setDurationFilter] = useState<string>('all');
  const [selectedTask, setSelectedTask] = useState<EnhancedTask | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [viewStartDate, setViewStartDate] = useState(new Date());
  const [timelineScale, setTimelineScale] = useState<'days' | 'weeks'>('days');
  
  // Dependency management state
  const [showDependencyDialog, setShowDependencyDialog] = useState(false);
  const [dependencyEditTask, setDependencyEditTask] = useState<EnhancedTask | null>(null);
  
  // Schedule management state
  const [showCopyScheduleDialog, setShowCopyScheduleDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Available trades for filtering
  const availableTrades = ['Foundation', 'Framing', 'Electrical', 'Plumbing', 'HVAC', 'Drywall', 'Painting', 'Flooring'];
  
  // Fetch project data
  const { data: projects = [] } = useQuery({
    queryKey: ['/api/projects'],
  });
  
  const project = (projects as any[]).find((p: any) => p.id === projectId);
  
  // Fetch tasks for this project
  const { data: dbTasks = [], isLoading: tasksLoading, refetch: refetchTasks } = useQuery({
    queryKey: [`/api/projects/${projectId}/tasks`],
    enabled: !!projectId,
  });
  
  // Transform database tasks to timeline tasks
  const tasks: EnhancedTask[] = useMemo(() => {
    return (dbTasks as DatabaseTask[]).map((dbTask: DatabaseTask) => ({
      ...transformDatabaseTaskToTimeline(dbTask),
      dependencies: dbTask.dependencies ? JSON.parse(dbTask.dependencies) : [],
      weatherDependent: dbTask.weatherDependent || false,
      assignedSubcontractor: dbTask.assignedSubcontractor,
    }));
  }, [dbTasks]);

  // Update task dependencies mutation
  const updateDependencies = useMutation({
    mutationFn: async ({ taskId, dependencies }: { taskId: string, dependencies: string[] }) => {
      await apiRequest(`/api/projects/${projectId}/tasks/${taskId}/dependencies`, {
        method: 'PATCH',
        body: JSON.stringify({ dependencies: JSON.stringify(dependencies) }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Dependencies Updated",
        description: "Task dependencies have been successfully updated.",
      });
      setShowDependencyDialog(false);
      setDependencyEditTask(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update task dependencies. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Fix task trades mutation
  const fixTaskTrades = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/projects/${projectId}/tasks/fix-trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      toast({
        title: "Trade Information Fixed",
        description: `Updated ${data.updatedCount} tasks with trade information.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Fix Failed",
        description: "Failed to fix trade information. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Open dependency management for a task
  const openDependencyDialog = useCallback((task: EnhancedTask) => {
    setDependencyEditTask(task);
    setShowDependencyDialog(true);
  }, []);

  // Handle dependency changes
  const handleDependencyUpdate = useCallback((dependencies: string[]) => {
    if (dependencyEditTask) {
      updateDependencies.mutate({
        taskId: dependencyEditTask.id,
        dependencies
      });
    }
  }, [dependencyEditTask, updateDependencies]);
  
  // Get unique trades for filtering
  const availableTrades = useMemo(() => {
    const trades = Array.from(new Set(tasks.map(task => task.trade)));
    return trades.sort();
  }, [tasks]);
  
  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Search filter
      if (searchTerm && !task.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !task.trade.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Status filter
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      
      // Trade filter
      if (tradeFilter !== 'all' && task.trade !== tradeFilter) {
        return false;
      }
      
      // Duration filter
      if (durationFilter !== 'all') {
        if (durationFilter === 'short' && task.duration > 5) return false;
        if (durationFilter === 'medium' && (task.duration <= 5 || task.duration > 15)) return false;
        if (durationFilter === 'long' && task.duration <= 15) return false;
      }
      
      return true;
    });
  }, [tasks, searchTerm, statusFilter, tradeFilter, durationFilter]);
  
  // Group tasks by trade
  const groupedTasks = useMemo(() => {
    const groups: { [trade: string]: EnhancedTask[] } = {};
    filteredTasks.forEach(task => {
      if (!groups[task.trade]) {
        groups[task.trade] = [];
      }
      groups[task.trade].push(task);
    });
    
    // Sort groups by trade name and tasks by start date
    const sortedGroups: { [trade: string]: EnhancedTask[] } = {};
    Object.keys(groups).sort().forEach(trade => {
      sortedGroups[trade] = groups[trade].sort((a, b) => 
        a.startDate.getTime() - b.startDate.getTime()
      );
    });
    
    return sortedGroups;
  }, [filteredTasks]);
  
  // Calculate project stats
  const projectStats = useMemo(() => {
    if (tasks.length === 0) return null;
    
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const criticalTasks = tasks.filter(t => t.priority === 'critical').length;
    const weatherDependentTasks = tasks.filter(t => t.weatherDependent).length;
    
    const totalDuration = Math.max(...tasks.map(t => t.endDate.getTime())) - 
                         Math.min(...tasks.map(t => t.startDate.getTime()));
    const totalDays = Math.ceil(totalDuration / (1000 * 60 * 60 * 24));
    
    const estimatedCost = tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
    
    return {
      totalTasks: tasks.length,
      completedTasks,
      criticalTasks,
      weatherDependentTasks,
      totalDays,
      estimatedCost,
      progressPercentage: Math.round((completedTasks / tasks.length) * 100)
    };
  }, [tasks]);
  




  // Toggle group collapse/expand
  const toggleGroup = useCallback((trade: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(trade)) {
        newSet.delete(trade);
      } else {
        newSet.add(trade);
      }
      return newSet;
    });
  }, []);
  
  // Task pill component with modern styling
  const TaskPill: React.FC<{ task: EnhancedTask; onClick?: () => void }> = ({ task, onClick }) => {
    const TradeIcon = getTradeIcon(task.trade);
    const statusColor = getStatusColor(task.status);
    const tradeColor = getTradeColor(task.trade);
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="rounded-lg border px-3 py-2 bg-white shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group w-full"
              onClick={onClick}
              style={{ borderLeftColor: tradeColor, borderLeftWidth: '3px' }}
            >
              {/* Main row with task info */}
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div 
                    className="p-1.5 rounded-md flex-shrink-0"
                    style={{ backgroundColor: `${tradeColor}20`, color: tradeColor }}
                  >
                    <TradeIcon className="w-3 h-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                      {task.title}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {task.trade}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge 
                    variant="secondary" 
                    className="text-xs px-1.5 py-0.5 h-5 bg-gray-100 text-gray-700"
                  >
                    {task.duration}d
                  </Badge>
                  <div 
                    className="w-2 h-2 rounded-full border border-white"
                    style={{ backgroundColor: statusColor }}
                  />
                </div>
              </div>
              
              {/* Bottom row with controls */}
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100">
                <div className="flex items-center gap-1">
                  {task.weatherDependent && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400" title="Weather dependent" />
                  )}
                  {task.priority === 'critical' && (
                    <AlertCircle className="w-3 h-3 text-red-500" />
                  )}
                </div>
                
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDependencyDialog(task);
                  }}
                  className="text-xs px-1.5 py-0.5 h-5 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                >
                  <Link className="w-2.5 h-2.5 mr-1" />
                  {task.dependencies && task.dependencies.length > 0 ? `${task.dependencies.length}` : '+'}
                </Button>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            <div className="space-y-2">
              <div className="font-medium">{task.title}</div>
              <div className="text-sm text-gray-600">
                <div>Trade: {task.trade}</div>
                <div>Duration: {task.duration} days</div>
                <div>Start: {format(task.startDate, 'MMM d, yyyy')}</div>
                <div>End: {format(task.endDate, 'MMM d, yyyy')}</div>
                {task.estimatedCost && (
                  <div>Cost: ${task.estimatedCost.toLocaleString()}</div>
                )}
                {task.dependencies && task.dependencies.length > 0 && (
                  <div>Dependencies: {task.dependencies.length} tasks</div>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };
  
  // Render filter controls
  const FilterControls = () => (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-gray-500" />
        <Input
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-48"
        />
      </div>
      
      <Separator orientation="vertical" className="h-6" />
      
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="not_started">Not Started</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="delayed">Delayed</SelectItem>
        </SelectContent>
      </Select>
      
      <Select value={tradeFilter} onValueChange={setTradeFilter}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Trade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Trades</SelectItem>
          {availableTrades.map(trade => (
            <SelectItem key={trade} value={trade}>{trade}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <Select value={durationFilter} onValueChange={setDurationFilter}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Duration" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Durations</SelectItem>
          <SelectItem value="short">Short (≤5d)</SelectItem>
          <SelectItem value="medium">Medium (6-15d)</SelectItem>
          <SelectItem value="long">Long (&gt;15d)</SelectItem>
        </SelectContent>
      </Select>
      
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSearchTerm('');
            setStatusFilter('all');
            setTradeFilter('all');
            setDurationFilter('all');
          }}
        >
          Clear Filters
        </Button>
      </div>
    </div>
  );
  
  // Enhanced top bar with modern controls
  const TopBarControls = () => (
    <div className="flex items-center justify-between p-4 bg-white border-b">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
          <Button
            variant={activeView === 'gantt' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('gantt')}
            className="flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Gantt
          </Button>
          <Button
            variant={activeView === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('calendar')}
            className="flex items-center gap-2"
          >
            <CalendarDays className="w-4 h-4" />
            Calendar
          </Button>
          <Button
            variant={activeView === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('list')}
            className="flex items-center gap-2"
          >
            <List className="w-4 h-4" />
            List
          </Button>
        </div>
        
        <Separator orientation="vertical" className="h-6" />
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            {format(viewStartDate, 'MMM d, yyyy')}
          </Button>
          
          <Button variant="outline" size="sm" onClick={() => setViewStartDate(new Date())}>
            Today
          </Button>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-2"
                onClick={() => setShowCopyScheduleDialog(true)}
              >
                <Copy className="w-4 h-4" />
                Copy Schedule
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy schedule from another project</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-2"
                onClick={() => setShowImportDialog(true)}
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import tasks from CSV file</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Add Task
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create a new task in the timeline</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Auto-Schedule
              </Button>
            </TooltipTrigger>
            <TooltipContent>Auto-generate schedule based on approved estimates</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator orientation="vertical" className="h-6" />
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-2"
                onClick={() => setShowCopyScheduleDialog(true)}
              >
                <Copy className="w-4 h-4" />
                Copy Schedule
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy schedule from another project</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex items-center gap-2"
                onClick={() => setShowImportDialog(true)}
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import schedule from CSV file</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <Button
          size="sm"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          disabled={!hasUnsavedChanges || readonly}
        >
          <Save className="w-4 h-4" />
          Save
        </Button>
      </div>
    </div>
  );
  
  if (tasksLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div className="text-gray-500">Loading timeline...</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Project Header with Stats */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                Modern Timeline Builder
                {project && <span className="text-lg text-gray-600">- {project.name}</span>}
              </CardTitle>
              {projectStats && (
                <div className="flex items-center gap-6 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-sm text-gray-600">{projectStats.totalTasks} tasks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span className="text-sm text-gray-600">{projectStats.totalDays} days</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                    <span className="text-sm text-gray-600">{projectStats.progressPercentage}% complete</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                    <span className="text-sm text-gray-600">${(projectStats.estimatedCost / 1000).toFixed(0)}K budget</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              {projectStats && (
                <div className="flex gap-2">
                  {projectStats.criticalTasks > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {projectStats.criticalTasks} Critical
                    </Badge>
                  )}
                  {projectStats.weatherDependentTasks > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {projectStats.weatherDependentTasks} Weather-Dependent
                    </Badge>
                  )}
                </div>
              )}
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => fixTaskTrades.mutate()}
                disabled={fixTaskTrades.isPending || readonly}
                className="flex items-center gap-2"
              >
                <Wrench className="w-4 h-4" />
                {fixTaskTrades.isPending ? 'Fixing...' : 'Fix Trade Info'}
              </Button>
              
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Enhanced
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Timeline Interface */}
      <Card className="min-h-[700px]">
        <TopBarControls />
        <FilterControls />
        
        <div className="flex h-[600px]">
          {/* Left Panel - Task List */}
          <div className="w-80 border-r bg-gray-50">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {Object.entries(groupedTasks).map(([trade, tradeTasks]) => {
                  const isCollapsed = collapsedGroups.has(trade);
                  const TradeIcon = getTradeIcon(trade);
                  const tradeColor = getTradeColor(trade);
                  
                  return (
                    <Collapsible key={trade} open={!isCollapsed} onOpenChange={() => toggleGroup(trade)}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                            <div 
                              className="p-2 rounded-lg"
                              style={{ backgroundColor: `${tradeColor}20`, color: tradeColor }}
                            >
                              <TradeIcon className="w-4 h-4" />
                            </div>
                            <div className="text-left">
                              <div className="font-medium text-gray-900">{trade}</div>
                              <div className="text-xs text-gray-500">{tradeTasks.length} tasks</div>
                            </div>
                          </div>
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent className="mt-1 space-y-1">
                        {tradeTasks.map(task => (
                          <TaskPill
                            key={task.id}
                            task={task}
                            onClick={() => setSelectedTask(task)}
                          />
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
                
                {filteredTasks.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <div>No tasks match your filters</div>
                    <div className="text-sm">Try adjusting your search criteria</div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
          
          {/* Right Panel - Timeline View */}
          <div className="flex-1 bg-white">
            <div className="h-full flex items-center justify-center">
              {activeView === 'gantt' && (
                <div className="text-center text-gray-500">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <div className="text-lg font-medium">Interactive Gantt Chart</div>
                  <div>Drag and drop tasks to reschedule</div>
                </div>
              )}
              
              {activeView === 'calendar' && (
                <div className="text-center text-gray-500">
                  <CalendarDays className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <div className="text-lg font-medium">Calendar View</div>
                  <div>Monthly timeline perspective</div>
                </div>
              )}
              
              {activeView === 'list' && (
                <div className="text-center text-gray-500">
                  <List className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <div className="text-lg font-medium">List View</div>
                  <div>Editable spreadsheet format</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
      
      {/* Task Detail Dialog */}
      {selectedTask && (
        <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {React.createElement(getTradeIcon(selectedTask.trade), { className: "w-5 h-5" })}
                {selectedTask.title}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Trade</label>
                  <div className="text-sm text-gray-900">{selectedTask.trade}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Duration</label>
                  <div className="text-sm text-gray-900">{selectedTask.duration} days</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Start Date</label>
                  <div className="text-sm text-gray-900">{format(selectedTask.startDate, 'MMM d, yyyy')}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">End Date</label>
                  <div className="text-sm text-gray-900">{format(selectedTask.endDate, 'MMM d, yyyy')}</div>
                </div>
              </div>
              
              {selectedTask.description && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Description</label>
                  <div className="text-sm text-gray-900 mt-1">{selectedTask.description}</div>
                </div>
              )}
              
              <div className="flex items-center gap-4">
                <Badge variant="secondary">
                  Status: {selectedTask.status.replace('_', ' ')}
                </Badge>
                <Badge variant="outline">
                  Priority: {selectedTask.priority}
                </Badge>
                {selectedTask.weatherDependent && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">
                    Weather Dependent
                  </Badge>
                )}
              </div>

              {/* Dependencies section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Dependencies</label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openDependencyDialog(selectedTask)}
                    className="text-xs"
                  >
                    <Link className="w-3 h-3 mr-1" />
                    Manage
                  </Button>
                </div>
                {selectedTask.dependencies && selectedTask.dependencies.length > 0 ? (
                  <div className="space-y-1">
                    {selectedTask.dependencies.map(depId => {
                      const depTask = tasks.find(t => t.id === depId);
                      return depTask ? (
                        <div key={depId} className="text-xs bg-gray-50 rounded px-2 py-1 flex items-center gap-2">
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          {depTask.title}
                        </div>
                      ) : null;
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">No dependencies</div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Dependency Management Dialog */}
      {showDependencyDialog && dependencyEditTask && (
        <Dialog open={showDependencyDialog} onOpenChange={setShowDependencyDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link className="w-5 h-5" />
                Task Dependencies - {dependencyEditTask.title}
              </DialogTitle>
            </DialogHeader>
            
            <DependencySelector 
              task={dependencyEditTask}
              availableTasks={tasks.filter(t => t.id !== dependencyEditTask.id)}
              onDependenciesChange={handleDependencyUpdate}
              isLoading={updateDependencies.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Copy Schedule Dialog */}
      <CopyScheduleDialog 
        isOpen={showCopyScheduleDialog}
        onClose={() => setShowCopyScheduleDialog(false)}
        targetProjectId={projectId}
        projects={projects as any[]}
      />

      {/* Import CSV Dialog */}
      <ImportCSVDialog 
        isOpen={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        projectId={projectId}
      />
    </div>
  );
}