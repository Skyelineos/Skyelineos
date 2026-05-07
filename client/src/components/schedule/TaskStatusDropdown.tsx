import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TASK_STATUS_OPTIONS } from '@/hooks/useTaskMutations';

interface TaskStatusDropdownProps {
  value: string;
  onStatusChange: (status: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function TaskStatusDropdown({ 
  value, 
  onStatusChange, 
  disabled = false,
  size = 'sm' 
}: TaskStatusDropdownProps) {
  const sizeClasses = {
    sm: 'h-7 text-xs',
    md: 'h-8 text-sm',
    lg: 'h-10 text-base'
  };

  return (
    <Select value={value} onValueChange={onStatusChange} disabled={disabled}>
      <SelectTrigger className={`w-auto min-w-[110px] ${sizeClasses[size]} border-gray-300`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${option.color}`} />
              {option.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default TaskStatusDropdown;