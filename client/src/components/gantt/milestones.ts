import type { Trade, Milestone } from '@/types/gantt';
import { format, parseISO, addDays } from 'date-fns';

/**
 * Auto-generate key milestones from trades
 * Derives milestones by looking up last day of each corresponding trade or dependency chain
 */
export function generateMilestones(trades: Trade[]): Milestone[] {
  const milestones: Milestone[] = [];
  const tradeMap = new Map(trades.map(trade => [trade.id, trade]));

  // Define key milestone patterns
  const milestonePatterns = [
    { pattern: ['excavation'], name: 'Excavation Complete', icon: 'excavation' },
    { pattern: ['foundation'], name: 'Foundation Walls Complete', icon: 'foundation', requiresDecision: true },
    { pattern: ['framing'], name: 'Framing Complete', icon: 'framing', requiresDecision: true },
    { pattern: ['mep', '4-way', 'rough-in'], name: '4-Way Complete', icon: 'mep', requiresDecision: true },
    { pattern: ['drywall'], name: 'Drywall Complete', icon: 'drywall' },
    { pattern: ['cabinets'], name: 'Cabinets Installed', icon: 'cabinets' },
    { pattern: ['paint'], name: 'Paint Complete', icon: 'paint' },
    { pattern: ['walkthrough'], name: 'Client Walkthrough', icon: 'walkthrough', requiresDecision: true },
    { pattern: ['final', 'inspection'], name: 'Final Inspection Complete', icon: 'final' }
  ];

  // Find matching trades for each milestone pattern
  milestonePatterns.forEach((pattern, index) => {
    const matchingTrade = trades.find(trade => 
      pattern.pattern.some(p => trade.name.toLowerCase().includes(p.toLowerCase()))
    );

    if (matchingTrade) {
      const milestoneId = `milestone_${matchingTrade.id}`;
      const milestoneDate = matchingTrade.endDate;
      
      milestones.push({
        id: milestoneId,
        name: pattern.name,
        date: milestoneDate,
        status: determineMilestoneStatus(milestoneDate, matchingTrade.status),
        icon: pattern.icon,
        requiresDecision: pattern.requiresDecision || false,
        tradeId: matchingTrade.id
      });
    }
  });

  return milestones.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Determine milestone status based on date and trade status
 */
function determineMilestoneStatus(milestoneDate: string, tradeStatus: string): 'upcoming' | 'done' | 'at_risk' {
  const today = new Date();
  const milestone = parseISO(milestoneDate);
  
  if (tradeStatus === 'delayed') {
    return 'at_risk';
  }
  
  if (milestone < today && tradeStatus === 'on_track') {
    return 'done';
  }
  
  return 'upcoming';
}

/**
 * Update milestone dates when trades are modified
 */
export function recalculateMilestones(trades: Trade[], existingMilestones: Milestone[]): Milestone[] {
  const newMilestones = generateMilestones(trades);
  
  // Preserve any custom milestones that aren't auto-generated
  const customMilestones = existingMilestones.filter(m => 
    !newMilestones.some(nm => nm.tradeId === m.tradeId)
  );
  
  return [...newMilestones, ...customMilestones].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get critical milestones that require decisions
 */
export function getCriticalMilestones(milestones: Milestone[]): Milestone[] {
  return milestones.filter(m => m.requiresDecision && m.status !== 'done');
}

/**
 * Get upcoming milestones within specified days
 */
export function getUpcomingMilestones(milestones: Milestone[], days: number = 7): Milestone[] {
  const today = new Date();
  const cutoffDate = addDays(today, days);
  
  return milestones.filter(m => {
    const milestoneDate = parseISO(m.date);
    return milestoneDate >= today && milestoneDate <= cutoffDate && m.status === 'upcoming';
  });
}

/**
 * Check if milestone is overdue
 */
export function isOverdue(milestone: Milestone): boolean {
  const today = new Date();
  const milestoneDate = parseISO(milestone.date);
  return milestoneDate < today && milestone.status === 'upcoming';
}