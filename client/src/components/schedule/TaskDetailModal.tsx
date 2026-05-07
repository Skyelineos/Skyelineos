import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Calendar,
  Clock,
  User,
  FileText,
  ExternalLink,
  MapPin,
  Wrench,
  AlertCircle,
  CheckCircle,
  PlayCircle,
  PauseCircle,
} from 'lucide-react';
import { format } from 'date-fns';

interface TaskDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  onNavigateToProject?: (projectId: number, taskId?: string) => void;
}

export default function TaskDetailModal({
  open,
  onOpenChange,
  task,
  onNavigateToProject,
}: TaskDetailModalProps) {
  const [isNavigating, setIsNavigating] = useState(false);

  const handleNavigateToProject = () => {
    if (onNavigateToProject && task) {
      setIsNavigating(true);
      onNavigateToProject(task.projectId, task.id);
      setTimeout(() => {
        setIsNavigating(false);
        onOpenChange(false);
      }, 500);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'in progress':
        return <PlayCircle className="h-5 w-5 text-blue-500" />;
      case 'on hold':
        return <PauseCircle className="h-5 w-5 text-yellow-500" />;
      case 'cancelled':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'complete':
        return 'bg-green-100 text-green-800';
      case 'in progress':
        return 'bg-blue-100 text-blue-800';
      case 'on hold':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {getStatusIcon(task.status)}
              <span>{task.title || task.trade}</span>
            </div>
            <Badge className={getStatusColor(task.status)}>
              {task.status || 'Scheduled'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Task details and project information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Project Information */}
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-500" />
                  Project Information
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNavigateToProject}
                  disabled={isNavigating}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  {isNavigating ? 'Opening...' : 'View in Project'}
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Project Name
                  </label>
                  <p className="text-sm mt-1">{task.projectName || 'Unknown Project'}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Trade
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <Wrench className="h-4 w-4 text-gray-500" />
                    <p className="text-sm">{task.trade || 'General'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Task Details */}
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-green-500" />
                Task Details
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    Description
                  </label>
                  <p className="text-sm mt-1 bg-gray-50 p-3 rounded">
                    {task.description || task.notes || 'No description provided'}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      Start Date
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <p className="text-sm">
                        {task.startDate ? format(new Date(task.startDate), 'MMM d, yyyy') : 'Not set'}
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      End Date
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <p className="text-sm">
                        {task.endDate ? format(new Date(task.endDate), 'MMM d, yyyy') : 'Not set'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      Duration
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="h-4 w-4 text-gray-500" />
                      <p className="text-sm">
                        {task.duration ? `${task.duration} day${task.duration !== 1 ? 's' : ''}` : 'Not specified'}
                      </p>
                    </div>
                  </div>
                  
                  {task.progress !== undefined && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Progress
                      </label>
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>{task.progress || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${task.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Assignment Information */}
          {(task.vendor || task.subcontractor || task.contact) && (
            <Card className="bg-gray-50">
              <CardContent className="p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <User className="h-5 w-5 text-purple-500" />
                  Assignment
                </h3>
                
                <div className="space-y-2">
                  {task.contact && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Assigned To
                      </label>
                      <p className="text-sm mt-1">
                        {task.contact.company || task.contact.name || 'Unassigned'}
                      </p>
                    </div>
                  )}
                  
                  {(task.vendor || task.subcontractor) && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">
                        Contractor/Vendor
                      </label>
                      <p className="text-sm mt-1">
                        {task.vendor || task.subcontractor || 'Not assigned'}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Additional Notes */}
          {task.notes && task.notes !== task.description && (
            <Card className="bg-gray-50">
              <CardContent className="p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-orange-500" />
                  Additional Notes
                </h3>
                <p className="text-sm bg-gray-50 p-3 rounded">
                  {task.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            Task ID: {task.id} • Project ID: {task.projectId}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button 
              onClick={handleNavigateToProject}
              disabled={isNavigating}
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              {isNavigating ? 'Opening...' : 'Open Project Schedule'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}