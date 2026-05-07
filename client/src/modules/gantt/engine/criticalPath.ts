// src/modules/gantt/engine/criticalPath.ts
import type { WbsTask } from '../types';

export function colorByCritical(task: WbsTask, criticalIds: Set<string>) {
  if (task.children?.length) return '#22c55e'; // summary: green
  return criticalIds.has(task.id) ? '#ef4444' : '#0ea5b7'; // red / teal
}