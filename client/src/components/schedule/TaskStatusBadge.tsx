import React from 'react';
import { Badge } from '@/components/ui/badge';
import { getTaskStatusBadgeClass } from '@/hooks/useTaskMutations';

interface TaskStatusBadgeProps {
  status: string;
  className?: string;
}

export function TaskStatusBadge({ status, className = '' }: TaskStatusBadgeProps) {
  const badgeClass = getTaskStatusBadgeClass(status);
  
  return (
    <Badge 
      variant="outline" 
      className={`${badgeClass} ${className} font-medium text-xs px-2 py-1 rounded-md border`}
    >
      {status}
    </Badge>
  );
}

export default TaskStatusBadge;