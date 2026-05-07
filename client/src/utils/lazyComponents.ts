// Lazy loading for heavy components to reduce initial bundle size
import { lazy } from 'react';
import React from 'react';

// Fallback component factory
const createFallback = (name: string) => () => React.createElement('div', {}, `${name} unavailable`);

// Heavy chart components - Check if exists, otherwise provide fallback
export const GanttChart = lazy(() => 
  import('../modules/gantt/ui/BuildTrackerPro').catch(() => ({
    default: createFallback('Gantt Chart')
  }))
);

// PDF generation components - Use existing PDFGenerator
export const PDFGenerator = lazy(() =>
  import('../components/projects/PDFGenerator').catch(() => ({
    default: createFallback('PDF Generator')
  }))
);

// Advanced scheduling components - Check if exists, otherwise provide fallback
export const AdvancedScheduler = lazy(() =>
  import('../components/schedule/AdvancedScheduler').catch(() => ({
    default: createFallback('Advanced Scheduler')
  }))
);

// Financial reporting components - Check if exists, otherwise provide fallback
export const FinancialReports = lazy(() =>
  import('../components/financials/FinancialReports').catch(() => ({
    default: createFallback('Financial Reports')
  }))
);

// Document management components - Check if exists, otherwise provide fallback
export const DocumentViewer = lazy(() =>
  import('../components/documents/DocumentViewer').catch(() => ({
    default: createFallback('Document Viewer')
  }))
);

// Calendar components - Use existing calendar
export const FullCalendar = lazy(() =>
  import('../components/calendar/CalendarView').catch(() => ({
    default: createFallback('Calendar')
  }))
);

// Export utility for preloading critical components
export const preloadCriticalComponents = async (): Promise<void> => {
  // Preload components that are likely to be used soon
  const criticalComponents = [
    import('../modules/gantt/ui/BuildTrackerPro').catch(() => null),
    import('../components/calendar/CalendarView').catch(() => null)
  ];
  
  try {
    await Promise.allSettled(criticalComponents);
  } catch (error) {
    console.warn('Failed to preload some critical components:', error);
  }
};