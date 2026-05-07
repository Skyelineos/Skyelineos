import React from 'react';
import { FixedSizeList as List } from 'react-window';
import type { ScheduleTask } from '../../hooks/useProjectSchedule';

interface VirtualizedTaskListProps {
  tasks: ScheduleTask[];
  height: number;
  onTaskClick?: (task: ScheduleTask) => void;
  selectedTaskId?: number;
}

interface TaskRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    tasks: ScheduleTask[];
    onTaskClick?: (task: ScheduleTask) => void;
    selectedTaskId?: number;
  };
}

const TaskRow: React.FC<TaskRowProps> = ({ index, style, data }) => {
  const task = data.tasks[index];
  const isSelected = data.selectedTaskId === task.id;

  return (
    <div
      style={style}
      className={`p-3 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50 border-blue-200' : ''
      }`}
      onClick={() => data.onTaskClick?.(task)}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {task.title}
          </h4>
          {task.description && (
            <p className="text-xs text-gray-500 truncate mt-1">
              {task.description}
            </p>
          )}
        </div>
        <div className="ml-4 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            task.status === 'completed' ? 'bg-green-100 text-green-800' :
            task.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
            task.status === 'blocked' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {task.status.replace('_', ' ')}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center text-xs text-gray-500">
        <span>{new Date(task.startDate).toLocaleDateString()}</span>
        <span className="mx-2">→</span>
        <span>{new Date(task.endDate).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

export const VirtualizedTaskList: React.FC<VirtualizedTaskListProps> = ({
  tasks,
  height,
  onTaskClick,
  selectedTaskId
}) => {
  const itemData = {
    tasks,
    onTaskClick,
    selectedTaskId
  };

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <div className="text-center">
          <p className="text-sm">No tasks found</p>
          <p className="text-xs mt-1">Tasks will appear here when added to the project</p>
        </div>
      </div>
    );
  }

  return (
    <List
      height={height}
      itemCount={tasks.length}
      itemSize={100} // Height of each task row
      itemData={itemData}
      className="border border-gray-200 rounded-lg"
    >
      {TaskRow}
    </List>
  );
};