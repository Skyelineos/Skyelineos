// Baseline Capture & Management
import type { WbsTask } from '../types';

export const captureBaseline = (tasks: WbsTask[]): WbsTask[] => {
  const captureTaskBaseline = (task: WbsTask): WbsTask => {
    const baselined: WbsTask = {
      ...task,
      baselineStart: task.startDate,
      baselineEnd: task.endDate
    };
    
    if (task.children) {
      baselined.children = task.children.map(captureTaskBaseline);
    }
    
    return baselined;
  };
  
  return tasks.map(captureTaskBaseline);
};

export const clearBaseline = (tasks: WbsTask[]): WbsTask[] => {
  const clearTaskBaseline = (task: WbsTask): WbsTask => {
    const cleared: WbsTask = { ...task };
    delete cleared.baselineStart;
    delete cleared.baselineEnd;
    
    if (task.children) {
      cleared.children = task.children.map(clearTaskBaseline);
    }
    
    return cleared;
  };
  
  return tasks.map(clearTaskBaseline);
};