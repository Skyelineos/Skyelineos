// Gantt State Management (Zustand)
import { create } from 'zustand';
import type { WbsTask, Link, Metrics, Zoom } from './types';

interface GanttState {
  // Project Info
  projectId?: string;
  projectName: string;
  setProjectId: (id: string) => void;
  
  // Core Data
  tasks: WbsTask[];
  links: Link[];
  metrics: Metrics | null;
  
  // Display Settings
  holidays: string[];                // ISO dates
  showWeekends: boolean;
  showCritical: boolean;
  showBaseline: boolean;
  zoom: Zoom;
  
  // View Mode
  viewMode: 'builder' | 'viewer';
  
  // Actions
  setTasks: (tasks: WbsTask[]) => void;
  setLinks: (links: Link[]) => void;
  setMetrics: (metrics: Metrics | null) => void;
  setViewMode: (mode: 'builder' | 'viewer') => void;
  setZoom: (zoom: Zoom) => void;
  toggleWeekends: () => void;
  toggleCritical: () => void;
  toggleBaseline: () => void;
  setProjectName: (name: string) => void;
  setHolidays: (holidays: string[]) => void;
}

export const useGantt = create<GanttState>((set, get) => ({
  // Initial State
  projectName: 'Wilson Home Construction',
  tasks: [],
  links: [],
  metrics: null,
  holidays: ['2025-12-25', '2025-01-01', '2025-07-04', '2025-11-28'], // Default holidays
  showWeekends: true,
  showCritical: false,
  showBaseline: false,
  zoom: 'Week',
  viewMode: 'builder',
  
  // Actions
  setTasks: (tasks) => set({ tasks }),
  setLinks: (links) => set({ links }),
  setMetrics: (metrics) => set({ metrics }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setZoom: (zoom) => set({ zoom }),
  toggleWeekends: () => set((state) => ({ showWeekends: !state.showWeekends })),
  toggleCritical: () => set((state) => ({ showCritical: !state.showCritical })),
  toggleBaseline: () => set((state) => ({ showBaseline: !state.showBaseline })),
  setProjectName: (name) => set({ projectName: name }),
  setProjectId: (id) => set({ projectId: id }),
  setHolidays: (holidays) => set({ holidays })
}));