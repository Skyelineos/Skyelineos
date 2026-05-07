import { format, differenceInDays, parseISO } from 'date-fns';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Task, useProjectSchedule } from '../../hooks/useProjectSchedule';

interface ListViewProps {
  projectId: string;
}

export default function ListView({ projectId }: ListViewProps) {
  // Fetch schedule data using the proper hook
  const { 
    data: scheduleData, 
    isLoading, 
    isError 
  } = useProjectSchedule(projectId);

  const tasks = scheduleData?.tasks || [];

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  const calculateDuration = (start: string, end: string) => {
    try {
      return Math.max(1, differenceInDays(parseISO(end), parseISO(start)) + 1);
    } catch {
      return 1;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'delayed':
        return 'bg-red-100 text-red-800';
      case 'on_hold':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading task list...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        <div className="text-center">
          <div className="text-lg font-medium mb-2 text-red-600">Failed to load schedule</div>
          <div className="text-sm">Please check your connection and try again</div>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-500">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">No tasks scheduled</div>
          <div className="text-sm">Add tasks to see them in the list view</div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-auto border-collapse bg-white rounded-lg shadow-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-3 font-medium text-gray-900">Task</th>
            <th className="text-left p-3 font-medium text-gray-900">Start Date</th>
            <th className="text-left p-3 font-medium text-gray-900">End Date</th>
            <th className="text-center p-3 font-medium text-gray-900">Duration</th>
            <th className="text-center p-3 font-medium text-gray-900">Progress</th>
            <th className="text-center p-3 font-medium text-gray-900">Status</th>
            <th className="text-center p-3 font-medium text-gray-900">Priority</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => (
            <tr 
              key={task.id} 
              className={`border-b hover:bg-gray-50 transition-colors ${
                index % 2 === 0 ? 'bg-white' : 'bg-gray-25'
              }`}
            >
              <td className="p-3">
                <div>
                  <div className="font-medium text-gray-900">{task.title}</div>
                  {task.description && (
                    <div className="text-sm text-gray-500 mt-1 truncate max-w-xs">
                      {task.description}
                    </div>
                  )}
                </div>
              </td>
              <td className="p-3 text-gray-700">
                {formatDate(task.startDate)}
              </td>
              <td className="p-3 text-gray-700">
                {formatDate(task.endDate)}
              </td>
              <td className="p-3 text-center text-gray-700">
                {calculateDuration(task.startDate, task.endDate)} days
              </td>
              <td className="p-3">
                <div className="flex items-center justify-center space-x-2">
                  <Progress 
                    value={(task.progress || 0) * 100} 
                    className="w-16 h-2"
                  />
                  <span className="text-sm text-gray-600 min-w-max">
                    {Math.round((task.progress || 0) * 100)}%
                  </span>
                </div>
              </td>
              <td className="p-3 text-center">
                <Badge className={`${getStatusColor(task.status)} border-0`}>
                  {task.status.replace('_', ' ')}
                </Badge>
              </td>
              <td className="p-3 text-center">
                <Badge className={`${getPriorityColor(task.priority)} border-0`}>
                  {task.priority}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}