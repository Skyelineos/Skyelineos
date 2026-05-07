import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Task } from '../../hooks/useProjectSchedule';

interface CalendarViewProps {
  tasks: Task[];
  onEventDrop?: (taskId: string, newStart: Date, newEnd: Date) => void;
  isLoading?: boolean;
}

export default function CalendarView({ tasks, onEventDrop, isLoading }: CalendarViewProps) {
  const events = tasks.map(task => ({
    id: task.id.toString(),
    title: task.title,
    start: task.startDate,
    end: task.endDate,
    backgroundColor: getStatusColor(task.status),
    borderColor: getStatusColor(task.status),
    extendedProps: {
      progress: task.progress,
      status: task.status,
      priority: task.priority
    }
  }));

  function getStatusColor(status: string): string {
    switch (status) {
      case 'completed':
        return '#10b981'; // green
      case 'in_progress':
        return '#3b82f6'; // blue
      case 'delayed':
        return '#ef4444'; // red
      case 'on_hold':
        return '#f59e0b'; // amber
      default:
        return '#6b7280'; // gray
    }
  }

  return (
    <div className="h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading calendar...</span>
          </div>
        </div>
      )}
      
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        events={events}
        editable={!!onEventDrop}
        eventDrop={(info) => {
          if (onEventDrop && info.event.start && info.event.end) {
            onEventDrop(info.event.id, info.event.start, info.event.end);
          }
        }}
        eventResize={(info) => {
          if (onEventDrop && info.event.start && info.event.end) {
            onEventDrop(info.event.id, info.event.start, info.event.end);
          }
        }}
        height="600px"
        eventDisplay="block"
        dayMaxEvents={3}
        moreLinkClick="popover"
        eventContent={(eventInfo) => (
          <div className="p-1 text-xs">
            <div className="font-medium truncate">{eventInfo.event.title}</div>
            <div className="text-white/80">
              {Math.round((eventInfo.event.extendedProps.progress || 0) * 100)}% complete
            </div>
          </div>
        )}
        eventMouseEnter={(info) => {
          if (info.el && info.el.style) {
            info.el.style.transform = 'scale(1.02)';
            info.el.style.transition = 'transform 0.1s';
          }
        }}
        eventMouseLeave={(info) => {
          if (info.el && info.el.style) {
            info.el.style.transform = 'scale(1)';
          }
        }}
      />
    </div>
  );
}