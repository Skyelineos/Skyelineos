// src/types/wbs.ts
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Link {
  taskId: string;       // predecessor id
  type: LinkType;       // e.g., 'FS'
  lagDays?: number;     // optional +d / -d
}

export interface WbsTask {
  id: string;
  name: string;
  startDate: string;    // ISO yyyy-mm-dd
  endDate: string;      // ISO yyyy-mm-dd
  percent?: number;     // 0..100
  children?: WbsTask[]; // summary if has children
  predecessors?: Link[]; 
  // computed at runtime:
  _isSummary?: boolean;
}