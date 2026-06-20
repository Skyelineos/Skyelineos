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

  // Manual ↑/↓ reorder of a task within its sibling group. Nested children
  // stay with their parent (we only swap at the same level). On first move
  // we backfill sortOrder for the whole sibling group so subsequent moves
  // are deterministic.
  moveTaskUp: (taskId: string) => void;
  moveTaskDown: (taskId: string) => void;
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
  setHolidays: (holidays) => set({ holidays }),

  // Reorder helpers. Walk the tree to find the task's sibling group, swap
  // with its neighbour, backfill sortOrder on the group, then commit the
  // new array via setTasks (re-using the existing change pipeline).
  moveTaskUp: (taskId) => {
    const cloneTree = (list: WbsTask[]): WbsTask[] =>
      list.map((n) => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }));
    const reorderAt = (list: WbsTask[]): { changed: boolean; list: WbsTask[] } => {
      const idx = list.findIndex((n) => n.id === taskId);
      if (idx > 0) {
        const next = [...list];
        const tmp = next[idx - 1];
        next[idx - 1] = next[idx];
        next[idx] = tmp;
        next.forEach((n, i) => (n.sortOrder = i));
        return { changed: true, list: next };
      }
      if (idx === 0) {
        // first in group: nothing to do
        return { changed: false, list };
      }
      // not found at this level — recurse into children
      let touched = false;
      const out = list.map((n) => {
        if (!touched && n.children && n.children.length) {
          const r = reorderAt(n.children);
          if (r.changed) {
            touched = true;
            return { ...n, children: r.list };
          }
        }
        return n;
      });
      return { changed: touched, list: out };
    };
    const cloned = cloneTree(get().tasks);
    const r = reorderAt(cloned);
    if (r.changed) set({ tasks: r.list });
  },

  moveTaskDown: (taskId) => {
    const cloneTree = (list: WbsTask[]): WbsTask[] =>
      list.map((n) => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }));
    const reorderAt = (list: WbsTask[]): { changed: boolean; list: WbsTask[] } => {
      const idx = list.findIndex((n) => n.id === taskId);
      if (idx !== -1 && idx < list.length - 1) {
        const next = [...list];
        const tmp = next[idx + 1];
        next[idx + 1] = next[idx];
        next[idx] = tmp;
        next.forEach((n, i) => (n.sortOrder = i));
        return { changed: true, list: next };
      }
      if (idx === list.length - 1 && idx !== -1) {
        return { changed: false, list };
      }
      let touched = false;
      const out = list.map((n) => {
        if (!touched && n.children && n.children.length) {
          const r = reorderAt(n.children);
          if (r.changed) {
            touched = true;
            return { ...n, children: r.list };
          }
        }
        return n;
      });
      return { changed: touched, list: out };
    };
    const cloned = cloneTree(get().tasks);
    const r = reorderAt(cloned);
    if (r.changed) set({ tasks: r.list });
  },
}));