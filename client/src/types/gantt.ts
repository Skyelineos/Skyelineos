// Strict TypeScript types for Gantt chart system
import type { WbsTask, Link, LinkType } from './wbs';

export type TradeStatus = 'on_track' | 'delayed' | 'pending_approval';
export type Phase = 'rough' | 'finish';

export interface Trade {
  id: string;
  name: string;
  phase: Phase;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd
  status: TradeStatus;
  dependencies: string[]; // trade ids
  vendorId?: string;
  description?: string;
  cost?: number;
  // WBS Integration
  wbsId?: string; // Links to WbsTask
  parentId?: string; // For hierarchical structure
  children?: Trade[];
  predecessors?: Link[]; // Advanced dependency management
  percent?: number; // Progress 0-100
  _isSummary?: boolean; // Computed at runtime
}

export interface Milestone {
  id: string;
  name: string;
  date: string; // ISO yyyy-mm-dd
  status: 'upcoming' | 'done' | 'at_risk';
  icon?: string; // e.g., 'framing', 'drywall'
  requiresDecision?: boolean;
  tradeId?: string; // Associated trade
}

export interface GanttExportOptions {
  format: 'PNG' | 'PDF';
  scale: number;
  includeTitle: boolean;
  includeLegend: boolean;
  projectName?: string;
}

export interface GanttViewConfig {
  zoomLevel: 'day' | 'week' | 'month';
  showWeekends: boolean;
  showMilestones: boolean;
  showDependencies: boolean;
  phaseFilter?: Phase;
  statusFilter?: TradeStatus;
  // WBS View options
  showHierarchy?: boolean;
  expandAll?: boolean;
  linkTypeFilter?: LinkType[];
}

export interface PlotlyGanttData {
  x: string[];
  y: string[];
  type: 'bar';
  orientation: 'h';
  marker: {
    color: string[];
  };
  hovertemplate: string;
  customdata: Array<{
    phase: Phase;
    status: TradeStatus;
    dependencies: string[];
    startDate: string;
    endDate: string;
    // WBS data
    parentId?: string;
    isSummary?: boolean;
    percent?: number;
    predecessors?: Link[];
  }>;
}

// WBS Helper Functions Interface
export interface WbsHelpers {
  flattenTasks: (tasks: WbsTask[]) => WbsTask[];
  calculateSummaryDates: (task: WbsTask) => void;
  validateDependencies: (tasks: WbsTask[]) => boolean;
  resolvePredecessors: (task: WbsTask, allTasks: WbsTask[]) => Date;
}