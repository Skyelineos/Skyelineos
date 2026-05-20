import React from 'react';
import { useProjectSchedule } from '../../hooks/useProjectSchedule';
import { format } from 'date-fns';
import { Calendar, Clock, CheckCircle, Circle, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { tradeLabel } from '@/lib/estimates/markup';

interface SimpleScheduleProps {
  projectId: number;
  readonly?: boolean;
}

const statusIcons = {
  'not_started': Circle,
  'in_progress': AlertCircle,
  'completed': CheckCircle,
  'Scheduled': Circle
};

const statusColors = {
  'not_started': 'text-gray-400',
  'in_progress': 'text-yellow-500',
  'completed': 'text-green-500',
  'Scheduled': 'text-blue-500'
};

const priorityColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800'
};

export default function SimpleSchedule({ projectId, readonly = false }: SimpleScheduleProps) {
  const { tasks = [], isLoading } = useProjectSchedule(projectId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Schedule Created</h3>
          <p className="text-gray-500">
            Create your first schedule items to get started with project planning.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task: any) => {
        const StatusIcon = statusIcons[task.status as keyof typeof statusIcons] || Circle;
        const statusColor = statusColors[task.status as keyof typeof statusColors] || 'text-gray-400';
        
        return (
          <Card key={task.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <StatusIcon className={`h-5 w-5 ${statusColor}`} />
                    <h4 className="font-medium">{task.title}</h4>
                    {task.priority && (
                      <Badge 
                        variant="secondary"
                        className={priorityColors[task.priority as keyof typeof priorityColors]}
                      >
                        {task.priority}
                      </Badge>
                    )}
                  </div>
                  
                  {task.description && (
                    <p className="text-sm text-gray-600 mb-3">{task.description}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {format(new Date(task.startDate), 'MMM d')} - {format(new Date(task.endDate), 'MMM d')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{task.duration} days</span>
                    </div>

                    {task.trade && (
                      <Badge variant="outline" className="text-xs">
                        {tradeLabel(task.trade)}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <div className="text-sm font-medium">{task.progress || 0}% complete</div>
                    <div className="w-20 bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${task.progress || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}