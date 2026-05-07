// Frappe Viewer Component for Clean Client Display
import React, { useRef, useEffect } from 'react';
import { useGantt } from '../state';
import { toFrappe } from '../adapters/frappe';

// TypeScript interface for Frappe Gantt
interface FrappeGanttModule {
  default: any;
}

export const FrappeViewer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<any>(null);
  const { tasks, zoom, showWeekends } = useGantt();

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import Frappe Gantt
    import('frappe-gantt').then((FrappeGantt: FrappeGanttModule) => {
      if (!ganttRef.current && tasks.length > 0 && containerRef.current) {
        const frappeData = toFrappe(tasks);
        
        ganttRef.current = new FrappeGantt.default(containerRef.current, frappeData, {
          view_mode: zoom,
          bar_height: 24,
          bar_corner_radius: 3,
          arrow_curve: 5,
          padding: 18,
          date_format: 'YYYY-MM-DD',
          custom_popup_html: function(task: any) {
            const progress = task.progress > 0 ? `${task.progress}% Complete` : 'Not Started';
            return `
              <div class="details-container">
                <h5>${task.name}</h5>
                <p>Progress: ${progress}</p>
                <p>Duration: ${task.start} - ${task.end}</p>
              </div>
            `;
          }
        });
      }
    }).catch(() => {
      // Fallback if Frappe Gantt can't be loaded
      if (containerRef.current) {
        containerRef.current.innerHTML = `
          <div class="gantt-fallback">
            <h3>Timeline View</h3>
            <div class="task-list">
              ${tasks.map(task => `
                <div class="task-item">
                  <div class="task-name">${task.name}</div>
                  <div class="task-dates">${task.startDate} - ${task.endDate}</div>
                  <div class="task-progress">${task.progress || 0}% Complete</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    });
  }, []);

  // Update view when data changes
  useEffect(() => {
    if (ganttRef.current && tasks.length > 0) {
      const frappeData = toFrappe(tasks);
      ganttRef.current.refresh(frappeData);
    }
  }, [tasks]);

  // Update zoom when changed
  useEffect(() => {
    if (ganttRef.current) {
      ganttRef.current.change_view_mode(zoom);
    }
  }, [zoom]);

  return (
    <div className="frappe-viewer">
      <div 
        ref={containerRef} 
        className="gantt-container"
        style={{ width: '100%', minHeight: '500px' }}
      />
      
      {/* Custom styles for clean presentation */}
      <style>{`
        .gantt-fallback {
          padding: 20px;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        .gantt-fallback h3 {
          margin: 0 0 20px 0;
          color: #1f2937;
          font-size: 18px;
          font-weight: 600;
        }
        .task-item {
          background: white;
          padding: 12px;
          margin-bottom: 8px;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .task-name {
          font-weight: 500;
          color: #1f2937;
        }
        .task-dates {
          font-size: 14px;
          color: #6b7280;
        }
        .task-progress {
          font-size: 14px;
          color: #059669;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};