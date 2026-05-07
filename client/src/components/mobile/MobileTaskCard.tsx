import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, Flag, Calendar, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { useMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface MobileTaskCardProps {
  task: {
    id: number;
    title: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'overdue';
    priority: 'low' | 'medium' | 'high' | 'critical';
    assignee?: string;
    dueDate: string;
    estimatedHours?: number;
    project?: string;
  };
  onStatusChange?: (taskId: number, status: string) => void;
  onSelect?: (taskId: number) => void;
  className?: string;
}

const statusConfig = {
  pending: { icon: Circle, color: 'text-gray-500', bg: 'bg-gray-100' },
  in_progress: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-100' },
  completed: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-100' },
  overdue: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100' }
};

const priorityConfig = {
  low: { color: 'bg-green-500', text: 'text-green-700' },
  medium: { color: 'bg-yellow-500', text: 'text-yellow-700' },
  high: { color: 'bg-orange-500', text: 'text-orange-700' },
  critical: { color: 'bg-red-500', text: 'text-red-700' }
};

export function MobileTaskCard({ task, onStatusChange, onSelect, className }: MobileTaskCardProps) {
  const isMobile = useMobile();
  const StatusIcon = statusConfig[task.status].icon;
  
  const handleStatusToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextStatus = task.status === 'completed' ? 'pending' : 
                      task.status === 'pending' ? 'in_progress' : 'completed';
    onStatusChange?.(task.id, nextStatus);
  };

  const handleSelect = () => {
    onSelect?.(task.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
    if (diffDays < 7) return `${diffDays} days`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const isOverdue = new Date(task.dueDate) < new Date() && task.status !== 'completed';

  return (
    <Card 
      className={cn(
        'transition-all duration-200 cursor-pointer',
        isMobile ? [
          'active:scale-98 active:shadow-lg',
          'border-l-4',
          task.status === 'completed' ? 'border-l-green-500 bg-green-50/50' :
          isOverdue ? 'border-l-red-500 bg-red-50/50' :
          task.priority === 'critical' ? 'border-l-red-500' :
          task.priority === 'high' ? 'border-l-orange-500' :
          'border-l-blue-500'
        ] : [
          'hover:shadow-lg hover:scale-[1.01]'
        ],
        className
      )}
      onClick={handleSelect}
    >
      <CardHeader className={cn(
        'pb-2',
        isMobile ? 'p-3' : 'p-4'
      )}>
        <div className="flex items-start gap-3">
          {/* Status Icon */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'p-1 h-auto shrink-0',
              statusConfig[task.status].color
            )}
            onClick={handleStatusToggle}
          >
            <StatusIcon className="h-5 w-5" />
          </Button>

          {/* Task Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className={cn(
                'font-medium leading-tight',
                isMobile ? 'text-sm' : 'text-base',
                task.status === 'completed' && 'line-through text-muted-foreground'
              )}>
                {task.title}
              </h4>
              
              {/* Priority Badge */}
              <Badge 
                variant="outline" 
                className={cn(
                  'shrink-0',
                  priorityConfig[task.priority].color,
                  'text-white border-none',
                  isMobile ? 'text-xs px-1.5 py-0.5' : 'text-xs'
                )}
              >
                <Flag className="h-3 w-3 mr-1" />
                {task.priority}
              </Badge>
            </div>

            {/* Description */}
            {task.description && (
              <p className={cn(
                'text-muted-foreground mt-1 line-clamp-2',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                {task.description}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className={cn(
        'space-y-3',
        isMobile ? 'p-3 pt-0' : 'p-4 pt-0'
      )}>
        {/* Task Meta Information */}
        <div className={cn(
          'flex items-center justify-between',
          isMobile ? 'text-xs' : 'text-sm'
        )}>
          <div className="flex items-center gap-4">
            {/* Due Date */}
            <div className={cn(
              'flex items-center gap-1',
              isOverdue ? 'text-red-600' : 'text-muted-foreground'
            )}>
              <Calendar className="h-3 w-3" />
              <span className={isOverdue ? 'font-medium' : ''}>
                {formatDate(task.dueDate)}
              </span>
            </div>

            {/* Estimated Hours */}
            {task.estimatedHours && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{task.estimatedHours}h</span>
              </div>
            )}
          </div>

          {/* Project Tag */}
          {task.project && (
            <Badge variant="secondary" className={cn(
              isMobile ? 'text-xs px-2 py-0.5' : 'text-xs'
            )}>
              {task.project}
            </Badge>
          )}
        </div>

        {/* Assignee and Actions */}
        <div className="flex items-center justify-between">
          {/* Assignee */}
          {task.assignee ? (
            <div className="flex items-center gap-2">
              <Avatar className={cn(
                isMobile ? 'h-6 w-6' : 'h-7 w-7'
              )}>
                <AvatarFallback className={cn(
                  'text-xs font-medium',
                  isMobile ? 'text-xs' : 'text-sm'
                )}>
                  {task.assignee.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className={cn(
                'text-muted-foreground',
                isMobile ? 'text-xs' : 'text-sm'
              )}>
                {task.assignee}
              </span>
            </div>
          ) : (
            <span className={cn(
              'text-muted-foreground',
              isMobile ? 'text-xs' : 'text-sm'
            )}>
              Unassigned
            </span>
          )}

          {/* Mobile Quick Actions */}
          {isMobile && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect();
                }}
              >
                View
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}