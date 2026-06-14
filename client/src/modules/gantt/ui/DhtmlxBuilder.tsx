// DHTMLX Builder Component for Power Users
import React, { useRef, useEffect } from 'react';
import { useGantt } from '../state';
import { toDhtmlx, fromDhtmlx } from '../adapters/dhtmlx';
import { autoSchedule } from '../engine/autoSchedule';
import type { WbsTask, Link } from '../types';

// Link type mapping for DHTMLX
const TYPE_MAP_TO_DHX: Record<string, string> = {
  FS: "0", SS: "1", FF: "2", SF: "3"
};
const TYPE_MAP_FROM_DHX: Record<string, "FS"|"SS"|"FF"|"SF"> = {
  "0": "FS", "1": "SS", "2": "FF", "3": "SF", 
  "finish_to_start":"FS", "start_to_start":"SS", "finish_to_finish":"FF", "start_to_finish":"SF"
};

// WBS helper function (no PRO plugin required)
function wbsOf(gantt: any, id: string): string {
  const getIndex = (pId: string, cId: string) => gantt.getChildren(pId).indexOf(cId) + 1;
  let cur = id, out: number[] = [];
  while (cur && cur !== gantt.config.root_id) {
    const p = gantt.getParent(cur);
    out.unshift(getIndex(p, cur));
    cur = p;
  }
  return out.join(".");
}

declare global {
  interface Window {
    gantt: any;
  }
}

interface DhtmlxBuilderProps {
  onLinkDoubleClick?: (link: Link, sourceTask: WbsTask, targetTask: WbsTask) => void;
  tableWidth?: number;
  onTableWidthChange?: (width: number) => void;
}

export const DhtmlxBuilder: React.FC<DhtmlxBuilderProps> = ({ 
  onLinkDoubleClick, 
  tableWidth = 400,
  onTableWidthChange 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<any>(null);
  const { tasks, links, setTasks, setLinks, setMetrics } = useGantt();

  // Find task by ID in nested structure
  const findTaskById = (taskList: WbsTask[], id: string): WbsTask | null => {
    for (const task of taskList) {
      if (task.id === id) return task;
      if (task.children) {
        const found = findTaskById(task.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import DHTMLX Gantt
    import('dhtmlx-gantt').then(({ gantt }) => {
      if (!ganttRef.current) {
        // Configure DHTMLX Gantt
        gantt.config.date_format = '%Y-%m-%d';
        gantt.config.xml_date = '%Y-%m-%d';
        gantt.config.auto_scheduling = false; // We handle scheduling
        gantt.config.auto_types = true;
        gantt.config.open_tree_initially = true;
        gantt.config.show_progress = true;
        gantt.config.show_links = true;
        gantt.config.drag_links = true;
        gantt.config.drag_progress = true;
        gantt.config.drag_resize = true;
        gantt.config.row_height = 28;
        gantt.config.bar_height = 20;
        gantt.config.link_line_width = 2;
        
        // Layout configuration for resizable table
        gantt.config.layout = {
          css: "gantt_container",
          rows: [
            {
              cols: [
                { view: "grid", scrollX: "scrollHor", scrollY: "scrollVer", width: tableWidth },
                { view: "scrollbar", id: "scrollHor" },
                { view: "timeline", scrollX: "scrollHor", scrollY: "scrollVer" },
                { view: "scrollbar", id: "scrollVer" }
              ]
            }
          ]
        };
        
        // Task styling based on critical path
        gantt.templates.task_class = (start:any, end:any, task:any) => {
          const state = useGantt.getState();
          const isSummary = gantt.hasChild(task.id);
          if (isSummary) return "task-summary";
          if (state.metrics?.criticalIds.has(task.id)) return "task-critical";
          return "task-normal";
        };
        
        // WBS columns configuration
        gantt.config.columns = [
          { name: "wbs", label: "WBS", width: 70, template: (t:any)=>wbsOf(gantt, t.id), align:"right" },
          { name: "text", label: "Task Name", tree: true, width: 260 },
          { name: "start_date", label: "Start Date", width: 110 },
          { name: "end_date", label: "End Date", width: 110 },
          { name: "duration", label: "Dur", width: 60 },
          { name: "progress", label: "%", width: 60, template:(t:any)=>Math.round((t.progress||0)*100) + '%' },
          { name: "predecessors", label: "Predecessors", width: 160, template: (t:any)=>{
            const links = gantt.getLinks().filter((l:any)=>l.target === t.id);
            return links.map((l:any)=>`${l.source}${TYPE_MAP_FROM_DHX[l.type]}${l.lag?((l.lag>0?"+":"")+l.lag+"d"):""}`).join(", ");
          }}
        ];

        // Modern scale configuration (fixes deprecation warning)
        const applyScales = (mode: "Day"|"Week"|"Month") => {
          if (mode === "Month") {
            gantt.config.scales = [
              { unit: "month", step: 1, format: "%M %Y" },
              { unit: "week", step: 1, format: "Week %W" }
            ];
          } else if (mode === "Week") {
            gantt.config.scales = [
              { unit: "week", step: 1, format: "Week %W" },
              { unit: "day", step: 1, format: "%d %M" }
            ];
          } else {
            gantt.config.scales = [
              { unit: "day", step: 1, format: "%d %M" }
            ];
          }
          if (ganttRef.current) gantt.render();
        };
        
        // Weekend shading function
        const setWeekendTint = (on:boolean) => {
          gantt.templates.scale_cell_class = function(date:any){
            if (!on) return "";
            const dateObj = new Date(date);
            if (isNaN(dateObj.getTime())) return "";
            const day = dateObj.getDay();
            const today = new Date();
            const isToday = dateObj.toDateString() === today.toDateString();
            if (isToday) return "today";
            return (day===0 || day===6) ? "weekend" : "";
          };
          gantt.templates.timeline_cell_class = gantt.templates.scale_cell_class;
        };
        
        // Today marker - using timeline template instead
        gantt.templates.timeline_cell_class = function(date: any){
          const state = useGantt.getState();
          if (!state.showWeekends) return "";
          const day = date.getDay();
          const today = new Date();
          const isToday = date.toDateString() === today.toDateString();
          if (isToday) return "today";
          return (day===0 || day===6) ? "weekend" : "";
        };

        // Initialize with null check
        if (containerRef.current) {
          gantt.init(containerRef.current);
          ganttRef.current = gantt;
          
          // Apply initial settings from state
          const state = useGantt.getState();
          applyScales(state.zoom);
          setWeekendTint(state.showWeekends);
        }
        
        // Event handlers
        gantt.attachEvent('onAfterTaskUpdate', (id: string, task: any) => {
          handleTaskUpdate();
        });
        
        gantt.attachEvent('onAfterLinkAdd', (id: string, link: any) => {
          handleTaskUpdate();
        });
        
        gantt.attachEvent('onAfterLinkDelete', (id: string, link: any) => {
          handleTaskUpdate();
        });
        
        // Double-click event for links
        gantt.attachEvent('onLinkDblClick', (id: string, e: Event) => {
          e.preventDefault();
          const link = gantt.getLink(id);
          if (link && onLinkDoubleClick) {
            // Convert DHTMLX link to our Link format
            const ourLink: Link = {
              id: String(link.id),
              sourceId: String(link.source),
              targetId: String(link.target),
              type: TYPE_MAP_FROM_DHX[link.type] || 'FS',
              lagDays: link.lag || 0
            };
            
            // Find source and target tasks
            const sourceTask = findTaskById(tasks, String(link.source));
            const targetTask = findTaskById(tasks, String(link.target));
            
            if (sourceTask && targetTask) {
              onLinkDoubleClick(ourLink, sourceTask, targetTask);
            }
          }
          return false; // Prevent default link editing
        });
      }
      
      // Load data with debug logging
      if (tasks.length > 0 || links.length > 0) {
        const dhtmlxData = toDhtmlx(tasks, links);
        console.log('Loading DHTMLX data:', { 
          tasks: dhtmlxData.data.length, 
          links: dhtmlxData.links.length,
          sampleTask: dhtmlxData.data[0] 
        });
        gantt.parse({ data: dhtmlxData.data, links: dhtmlxData.links });
        gantt.render();
      } else {
        console.log('No tasks to load:', { tasksLength: tasks.length, linksLength: links.length });
        console.log('Available tasks in state:', tasks);
        console.log('Sample data should be loaded into state before this component renders');
      }
    });

    return () => {
      if (ganttRef.current) {
        ganttRef.current.clearAll();
      }
    };
  }, []);

  // Sync data when external state changes
  useEffect(() => {
    if (ganttRef.current && tasks.length > 0) {
      console.log('Syncing data to DHTMLX:', { tasksCount: tasks.length, linksCount: links.length });
      const dhtmlxData = toDhtmlx(tasks, links);
      ganttRef.current.clearAll();
      ganttRef.current.parse({ data: dhtmlxData.data, links: dhtmlxData.links });
      ganttRef.current.render();
    }
  }, [tasks, links]);

  // Update table width when prop changes
  useEffect(() => {
    if (ganttRef.current && tableWidth) {
      const ganttInstance = ganttRef.current;
      // Update layout width
      if (ganttInstance.config.layout && ganttInstance.config.layout.rows[0].cols[0]) {
        ganttInstance.config.layout.rows[0].cols[0].width = tableWidth;
        ganttInstance.render();
      }
    }
  }, [tableWidth]);

  // Sync UI settings when state changes
  useEffect(() => {
    if (!ganttRef.current) return;
    
    const state = useGantt.getState();
    const ganttChart = ganttRef.current;
    
    // Update zoom
    if (state.zoom === "Month") {
      ganttChart.config.scale_unit = "month";
      ganttChart.config.date_scale = "%M %Y";
      ganttChart.config.subscales = [{ unit:"week", step:1, date:"Week %W" }];
    } else if (state.zoom === "Week") {
      ganttChart.config.scale_unit = "week";
      ganttChart.config.date_scale = "Week %W";
      ganttChart.config.subscales = [{ unit:"day", step:1, date:"%d %M" }];
    } else {
      ganttChart.config.scale_unit = "day";
      ganttChart.config.date_scale = "%d %M";
      ganttChart.config.subscales = [];
    }
    
    // Update weekend shading and today marker
    ganttChart.templates.scale_cell_class = function(date:any){
      if (!state.showWeekends) return "";
      const day = date.getDay();
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      if (isToday) return "today";
      return (day===0 || day===6) ? "weekend" : "";
    };
    ganttChart.templates.timeline_cell_class = ganttChart.templates.scale_cell_class;
    
    ganttChart.render();
  }, []);

  const handleTaskUpdate = () => {
    if (!ganttRef.current) return;
    
    const { tasks: updatedTasks, links: updatedLinks } = fromDhtmlx(ganttRef.current);
    
    // Run auto-schedule
    const result = autoSchedule(updatedTasks, updatedLinks, {
      holidays: useGantt.getState().holidays,
      respectLocked: true
    });
    
    setTasks(result.tasks);
    setMetrics(result.metrics);
  };

  return (
    <div className="dhtmlx-builder">
      <div 
        ref={containerRef} 
        className="gantt-container"
        style={{ width: '100%', height: '600px' }}
      />
    </div>
  );
};