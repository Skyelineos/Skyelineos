import { useMemo } from 'react';
import { TransformedProject } from '@/lib/projectUtils';

export interface ProjectMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  planningProjects: number;
  overdueProjects: number;
  totalBudget: number;
  totalSpent: number;
  avgBudget: number;
  budgetUtilization: number;
  completionRate: number;
  activeRate: number;
  pmWorkload: Record<string, number>;
  topPM: [string, number] | null;
  alerts: Array<{
    type: 'budget' | 'deadline' | 'overdue';
    message: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

// Custom hook for project metrics calculation
export function useProjectMetrics(projects: TransformedProject[]): ProjectMetrics {
  return useMemo(() => {
    // Safety check for empty projects array
    if (!projects || projects.length === 0) {
      return {
        totalProjects: 0,
        activeProjects: 0,
        completedProjects: 0,
        onHoldProjects: 0,
        planningProjects: 0,
        overdueProjects: 0,
        totalBudget: 0,
        totalSpent: 0,
        avgBudget: 0,
        budgetUtilization: 0,
        completionRate: 0,
        activeRate: 0,
        pmWorkload: {},
        topPM: null,
        alerts: [],
      };
    }

    const totalProjects = projects.length;
    const activeProjects = projects.filter(p => p.status === 'active').length;
    const completedProjects = projects.filter(p => p.status === 'completed').length;
    const onHoldProjects = projects.filter(p => p.status === 'on_hold').length;
    const planningProjects = projects.filter(p => p.status === 'planning').length;

    const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
    const totalSpent = projects.reduce((sum, p) => sum + (p.spent || 0), 0);
    const avgBudget = totalProjects > 0 ? totalBudget / totalProjects : 0;

    const completionRate = totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0;
    const activeRate = totalProjects > 0 ? (activeProjects / totalProjects) * 100 : 0;

    // Calculate overdue projects
    const now = new Date();
    const overdueProjects = projects.filter(p => {
      if (!p.targetCompletion || p.status === 'completed') return false;
      return new Date(p.targetCompletion) < now;
    }).length;

    // Budget utilization
    const budgetUtilization = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Project managers workload
    const pmWorkload = projects.reduce((acc, project) => {
      const pm = project.projectManager || 'Unassigned';
      acc[pm] = (acc[pm] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topPM = Object.entries(pmWorkload).length > 0 
      ? Object.entries(pmWorkload).sort(([,a], [,b]) => b - a)[0]
      : null;

    // Generate alerts
    const alerts: ProjectMetrics['alerts'] = [];

    // Budget alerts
    if (budgetUtilization > 90) {
      alerts.push({
        type: 'budget',
        message: `Budget utilization at ${budgetUtilization.toFixed(1)}%`,
        severity: 'high'
      });
    } else if (budgetUtilization > 75) {
      alerts.push({
        type: 'budget',
        message: `Budget utilization at ${budgetUtilization.toFixed(1)}%`,
        severity: 'medium'
      });
    }

    // Overdue alerts
    if (overdueProjects > 0) {
      alerts.push({
        type: 'overdue',
        message: `${overdueProjects} project${overdueProjects > 1 ? 's' : ''} overdue`,
        severity: overdueProjects > 2 ? 'high' : 'medium'
      });
    }

    // Deadline alerts (projects due within 30 days)
    const upcomingDeadlines = projects.filter(p => {
      if (!p.targetCompletion || p.status === 'completed') return false;
      const dueDate = new Date(p.targetCompletion);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      return dueDate <= thirtyDaysFromNow && dueDate >= now;
    }).length;

    if (upcomingDeadlines > 0) {
      alerts.push({
        type: 'deadline',
        message: `${upcomingDeadlines} deadline${upcomingDeadlines > 1 ? 's' : ''} within 30 days`,
        severity: upcomingDeadlines > 3 ? 'high' : 'low'
      });
    }

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      onHoldProjects,
      planningProjects,
      overdueProjects,
      totalBudget,
      totalSpent,
      avgBudget,
      budgetUtilization,
      completionRate,
      activeRate,
      pmWorkload,
      topPM,
      alerts,
    };
  }, [projects]);
}