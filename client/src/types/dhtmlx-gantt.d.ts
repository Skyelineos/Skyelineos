declare module 'dhtmlx-gantt' {
  export interface GanttTask {
    id: string | number;
    text: string;
    start_date: string;
    end_date: string;
    duration: number;
    progress: number;
    parent?: string | number;
    open?: boolean;
    [key: string]: any;
  }

  export interface GanttLink {
    id: string | number;
    source: string | number;
    target: string | number;
    type: string;
    lag?: number;
    [key: string]: any;
  }

  export interface GanttData {
    data: GanttTask[];
    links: GanttLink[];
  }

  export interface GanttConfig {
    date_format: string;
    xml_date: string;
    scale_unit: string;
    date_scale: string;
    scale_height: number;
    row_height: number;
    grid_width: number;
    fit_tasks: boolean;
    auto_scheduling: boolean;
    auto_types: boolean;
    drag_move: boolean;
    drag_progress: boolean;
    drag_links: boolean;
    drag_resize: boolean;
    columns: Array<{
      name: string;
      label: string;
      width?: number;
      tree?: boolean;
      align?: string;
      template?: (task: GanttTask) => string;
    }>;
    links: {
      finish_to_start: string;
      start_to_start: string;
      finish_to_finish: string;
      start_to_finish: string;
    };
    drag_mode: {
      move: string;
      resize: string;
      progress: string;
    };
    [key: string]: any;
  }

  export interface GanttTemplates {
    tooltip_text: (start: Date, end: Date, task: GanttTask) => string;
    link_text: (link: GanttLink) => string;
    task_class: (start: Date, end: Date, task: GanttTask) => string;
    [key: string]: any;
  }

  export interface Gantt {
    config: GanttConfig;
    templates: GanttTemplates;
    
    init(container: HTMLElement): void;
    parse(data: GanttData): void;
    clearAll(): void;
    
    getTask(id: string | number): GanttTask;
    changeTaskTime(id: string | number, start: Date, end: Date): void;
    changeTask(id: string | number, task: Partial<GanttTask>): void;
    deleteTask(id: string | number): void;
    
    getLink(id: string | number): GanttLink;
    deleteLink(id: string | number): void;
    
    attachEvent(event: string, handler: (...args: any[]) => any): string;
    detachEvent(id: string): void;
    
    exportToPDF(options?: any): void;
    exportToPNG(options?: any): void;
    exportToExcel(options?: any): void;
    
    render(): void;
    refreshData(): void;
    
    [key: string]: any;
  }

  export const gantt: Gantt;
}