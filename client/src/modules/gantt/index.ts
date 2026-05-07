// src/modules/gantt/index.ts
export { default as GanttShell } from './ui/GanttShell';
export { useGantt } from './state';
export { autoSchedule } from './engine/autoSchedule';
export { captureBaseline } from './engine/baseline';
export { colorByCritical } from './engine/criticalPath';
export { sampleWbs } from './demo/sampleWbs';
export type { WbsTask, Link, LinkType } from './types';