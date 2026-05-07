import React from 'react';
import { format, parseISO } from 'date-fns';

interface Task {
  id: number;
  projectId: number;
  sectionId: number | null;
  title: string;
  trade: string;
  contactId: number | null;
  estimateItemId: number | null;
  startDate: Date;
  endDate: Date;
  duration: number;
  status: 'not-started' | 'in-progress' | 'completed' | 'on-hold';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dependencies?: string;
  notes?: string;
  assignedTo?: string;
  completionPercentage: number;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

interface DependencyArrow {
  fromTaskId: number;
  toTaskId: number;
  type: 'FS' | 'SS' | 'FF' | 'SF'; // Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish
  lag: number; // days
}

interface DependencyArrowsProps {
  tasks: Task[];
  dependencies: DependencyArrow[];
  getTaskPosition: (task: Task) => { left: number; width: number };
  timelineDates: Date[];
  onDependencyEdit?: (dependency: DependencyArrow) => void;
  onDependencyDelete?: (fromTaskId: number, toTaskId: number) => void;
  showDependencies: boolean;
  rowHeight?: number;
  taskRowOffset?: number;
}

export const DependencyArrows: React.FC<DependencyArrowsProps> = ({
  tasks,
  dependencies,
  getTaskPosition,
  timelineDates,
  onDependencyEdit,
  onDependencyDelete,
  showDependencies,
  rowHeight = 60,
  taskRowOffset = 180, // Offset from top for first task row
}) => {
  if (!showDependencies || dependencies.length === 0) {
    return null;
  }

  const renderArrow = (dependency: DependencyArrow, index: number) => {
    const fromTask = tasks.find(t => t.id === dependency.fromTaskId);
    const toTask = tasks.find(t => t.id === dependency.toTaskId);
    
    if (!fromTask || !toTask) return null;

    const fromIndex = tasks.findIndex(t => t.id === dependency.fromTaskId);
    const toIndex = tasks.findIndex(t => t.id === dependency.toTaskId);
    
    if (fromIndex === -1 || toIndex === -1) return null;

    const fromPosition = getTaskPosition(fromTask);
    const toPosition = getTaskPosition(toTask);
    
    // Calculate vertical positions
    const fromY = taskRowOffset + fromIndex * rowHeight + rowHeight / 2;
    const toY = taskRowOffset + toIndex * rowHeight + rowHeight / 2;
    
    // Calculate horizontal positions based on dependency type
    let fromX: number, toX: number;
    
    switch (dependency.type) {
      case 'FS': // Finish-to-Start (most common)
        fromX = fromPosition.left + fromPosition.width;
        toX = toPosition.left;
        break;
      case 'SS': // Start-to-Start
        fromX = fromPosition.left;
        toX = toPosition.left;
        break;
      case 'FF': // Finish-to-Finish
        fromX = fromPosition.left + fromPosition.width;
        toX = toPosition.left + toPosition.width;
        break;
      case 'SF': // Start-to-Finish
        fromX = fromPosition.left;
        toX = toPosition.left + toPosition.width;
        break;
      default:
        fromX = fromPosition.left + fromPosition.width;
        toX = toPosition.left;
    }

    // Convert percentages to actual pixels
    const containerWidth = 800; // Approximate timeline width
    const fromXPx = (fromX / 100) * containerWidth + 256; // Add task names column width
    const toXPx = (toX / 100) * containerWidth + 256;

    // Create path for curved arrow
    const midX = (fromXPx + toXPx) / 2;
    const midY = (fromY + toY) / 2;
    
    // Control points for smooth curve
    const curve = Math.abs(toY - fromY) > 20 ? 30 : 10;
    const cp1X = fromXPx + curve;
    const cp1Y = fromY;
    const cp2X = toXPx - curve;
    const cp2Y = toY;

    const pathD = `M ${fromXPx} ${fromY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${toXPx} ${toY}`;

    // Arrow marker
    const arrowSize = 6;
    const angle = Math.atan2(toY - cp2Y, toXPx - cp2X);
    const arrowX1 = toXPx - arrowSize * Math.cos(angle - Math.PI / 6);
    const arrowY1 = toY - arrowSize * Math.sin(angle - Math.PI / 6);
    const arrowX2 = toXPx - arrowSize * Math.cos(angle + Math.PI / 6);
    const arrowY2 = toY - arrowSize * Math.sin(angle + Math.PI / 6);

    // Determine arrow color based on status
    const getArrowColor = () => {
      if (dependency.lag < 0) return '#ef4444'; // Red for negative lag
      if (dependency.lag > 0) return '#f59e0b'; // Amber for positive lag
      return '#6b7280'; // Gray for normal
    };

    const arrowColor = getArrowColor();
    const fromTaskName = fromTask.title;
    const toTaskName = toTask.title;
    const dependencyLabel = `${fromTaskName} → ${toTaskName}`;

    return (
      <g key={`dependency-${dependency.fromTaskId}-${dependency.toTaskId}`}>
        {/* Main arrow path */}
        <path
          d={pathD}
          stroke={arrowColor}
          strokeWidth="2"
          fill="none"
          strokeDasharray={dependency.type !== 'FS' ? '5,5' : undefined}
          className="cursor-pointer hover:stroke-blue-600 transition-colors"
          onClick={() => onDependencyEdit?.(dependency)}
        >
          <title>{`${dependencyLabel}\nType: ${dependency.type}\nLag: ${dependency.lag}d`}</title>
        </path>

        {/* Arrow head */}
        <polygon
          points={`${toXPx},${toY} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}`}
          fill={arrowColor}
          className="cursor-pointer hover:fill-blue-600 transition-colors"
          onClick={() => onDependencyEdit?.(dependency)}
        >
          <title>{`${dependencyLabel}\nType: ${dependency.type}\nLag: ${dependency.lag}d`}</title>
        </polygon>

        {/* Lag indicator */}
        {dependency.lag !== 0 && (
          <g>
            <circle
              cx={midX}
              cy={midY}
              r="12"
              fill="white"
              stroke={arrowColor}
              strokeWidth="2"
              className="cursor-pointer"
              onClick={() => onDependencyEdit?.(dependency)}
            />
            <text
              x={midX}
              y={midY + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill={arrowColor}
              className="font-medium cursor-pointer select-none"
              onClick={() => onDependencyEdit?.(dependency)}
            >
              {dependency.lag > 0 ? `+${dependency.lag}d` : `${dependency.lag}d`}
            </text>
          </g>
        )}

        {/* Hover area for easier interaction */}
        <path
          d={pathD}
          stroke="transparent"
          strokeWidth="8"
          fill="none"
          className="cursor-pointer"
          onClick={() => onDependencyEdit?.(dependency)}
        >
          <title>{`${dependencyLabel}\nType: ${dependency.type}\nLag: ${dependency.lag}d\nClick to edit`}</title>
        </path>
      </g>
    );
  };

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
      width="100%"
      height="100%"
    >
      <defs>
        {/* Define arrow markers for different types */}
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill="#6b7280"
          />
        </marker>
      </defs>
      <g className="pointer-events-auto">
        {dependencies.map((dependency, index) => renderArrow(dependency, index))}
      </g>
    </svg>
  );
};

export default DependencyArrows;