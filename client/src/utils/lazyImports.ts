// Lazy imports to reduce initial bundle size
import { lazy } from 'react';
import React from 'react';

// Helper to create fallback components
const createFallback = (name: string) => () => React.createElement('div', {}, `${name} loading...`);

// Lazy load heavy components that aren't needed immediately  
export const GanttChart = lazy(() => 
  import('../components/timeline/GanttChart')
    .then(module => ({ default: module.default || module.GanttChart }))
    .catch(() => ({ default: createFallback('Chart') }))
);

export const ProjectForm = lazy(() => 
  import('../components/projects/ProjectForm')
    .then(module => ({ default: module.default || module.ProjectForm }))
    .catch(() => ({ default: createFallback('Project Form') }))
);

export const Dashboard = lazy(() => 
  import('../pages/Dashboard')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Dashboard') }))
);

export const Projects = lazy(() => 
  import('../pages/Projects')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Projects') }))
);

export const Contacts = lazy(() => 
  import('../pages/Contacts')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Contacts') }))
);

export const Schedule = lazy(() => 
  import('../pages/Schedule')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Schedule') }))
);

export const Documents = lazy(() => 
  import('../pages/Documents')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Documents') }))
);

export const Financials = lazy(() => 
  import('../pages/Financials')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Financials') }))
);

export const Messaging = lazy(() => 
  import('../pages/Messaging')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Messaging') }))
);

export const Reports = lazy(() => 
  import('../pages/Reports')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Reports') }))
);

export const Settings = lazy(() => 
  import('../pages/Settings')
    .then(module => ({ default: module.default }))
    .catch(() => ({ default: createFallback('Settings') }))
);