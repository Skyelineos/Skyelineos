// Core Gantt Data Types for Dual-Engine System
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Link { 
  id?: string; 
  sourceId: string; 
  targetId: string; 
  type: LinkType; 
  lagDays?: number; 
}

export interface WbsTask {
  id: string;
  name: string;
  startDate: string;            // ISO yyyy-mm-dd
  endDate: string;              // ISO yyyy-mm-dd (inclusive)
  progress?: number;            // 0..100
  children?: WbsTask[];
  predecessors?: Link[];

  // Scheduling controls
  durationDays?: number;        // fallback if dates missing
  locked?: boolean;             // do not move in autoschedule
  notEarlierThan?: string;      // SNET constraint
  mustFinishBy?: string;        // soft deadline => warning

  // Baseline snapshot (optional)
  baselineStart?: string;
  baselineEnd?: string;

  // UI meta (optional)
  status?: 'on_track' | 'delayed' | 'pending_approval';   // for colors/legend
  phase?: 'rough' | 'finish';                             // for grouping legend
}

export interface Milestone { 
  id: string; 
  name: string; 
  date: string; 
}

export interface Metrics {
  ES: Record<string, string>;     // Early Start
  EF: Record<string, string>;     // Early Finish
  LS: Record<string, string>;     // Late Start
  LF: Record<string, string>;     // Late Finish
  slackDays: Record<string, number>;
  criticalIds: Set<string>;
  warnings: string[];
}

export type Zoom = 'Day' | 'Week' | 'Month';

export interface ScheduleOptions { 
  projectStart?: string; 
  holidays?: string[]; 
  respectLocked?: boolean; 
  scopeIds?: Set<string>; 
}