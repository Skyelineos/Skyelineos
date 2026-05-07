import type { Trade, Milestone } from '@/types/gantt';

// Sample data for "Wilson Home" project
export const sampleTrades: Trade[] = [
  {
    id: 'excavation',
    name: 'Excavation',
    phase: 'rough',
    startDate: '2025-09-01',
    endDate: '2025-09-05',
    status: 'on_track',
    dependencies: [],
    description: 'Site preparation and excavation work',
    cost: 15000
  },
  {
    id: 'foundation',
    name: 'Foundation Walls',
    phase: 'rough',
    startDate: '2025-09-08',
    endDate: '2025-09-15',
    status: 'on_track',
    dependencies: ['excavation'],
    description: 'Pour concrete foundation walls and footings',
    cost: 45000
  },
  {
    id: 'framing',
    name: 'Framing',
    phase: 'rough',
    startDate: '2025-09-17',
    endDate: '2025-10-03',
    status: 'on_track',
    dependencies: ['foundation'],
    description: 'Structural framing and roof installation',
    cost: 85000
  },
  {
    id: 'mep',
    name: '4-Way (MEP Rough-in)',
    phase: 'rough',
    startDate: '2025-10-06',
    endDate: '2025-10-20',
    status: 'pending_approval',
    dependencies: ['framing'],
    description: 'Mechanical, Electrical, Plumbing rough-in',
    cost: 65000
  },
  {
    id: 'drywall',
    name: 'Drywall',
    phase: 'finish',
    startDate: '2025-10-22',
    endDate: '2025-10-31',
    status: 'on_track',
    dependencies: ['mep'],
    description: 'Drywall installation, mudding, and texturing',
    cost: 35000
  },
  {
    id: 'cabinets',
    name: 'Cabinets',
    phase: 'finish',
    startDate: '2025-11-03',
    endDate: '2025-11-07',
    status: 'on_track',
    dependencies: ['drywall'],
    description: 'Kitchen and bathroom cabinet installation',
    cost: 55000
  },
  {
    id: 'paint',
    name: 'Paint',
    phase: 'finish',
    startDate: '2025-11-10',
    endDate: '2025-11-14',
    status: 'on_track',
    dependencies: ['cabinets'],
    description: 'Interior and exterior painting',
    cost: 25000
  },
  {
    id: 'walkthrough',
    name: 'Client Walkthrough',
    phase: 'finish',
    startDate: '2025-11-18',
    endDate: '2025-11-18',
    status: 'on_track',
    dependencies: ['paint'],
    description: 'Final inspection with client',
    cost: 0
  },
  {
    id: 'final',
    name: 'Final Inspection',
    phase: 'finish',
    startDate: '2025-11-20',
    endDate: '2025-11-20',
    status: 'on_track',
    dependencies: ['walkthrough'],
    description: 'Municipal final inspection',
    cost: 0
  }
];

export const sampleMilestones: Milestone[] = [
  {
    id: 'excavation_complete',
    name: 'Excavation Complete',
    date: '2025-09-05',
    status: 'upcoming',
    icon: 'excavation',
    tradeId: 'excavation'
  },
  {
    id: 'foundation_complete',
    name: 'Foundation Walls Complete',
    date: '2025-09-15',
    status: 'upcoming',
    icon: 'foundation',
    tradeId: 'foundation'
  },
  {
    id: 'framing_complete',
    name: 'Framing Complete',
    date: '2025-10-03',
    status: 'upcoming',
    icon: 'framing',
    tradeId: 'framing',
    requiresDecision: true
  },
  {
    id: 'fourway_complete',
    name: '4-Way Complete',
    date: '2025-10-20',
    status: 'upcoming',
    icon: 'mep',
    tradeId: 'mep',
    requiresDecision: true
  },
  {
    id: 'drywall_complete',
    name: 'Drywall Complete',
    date: '2025-10-31',
    status: 'upcoming',
    icon: 'drywall',
    tradeId: 'drywall'
  },
  {
    id: 'cabinets_complete',
    name: 'Cabinets Installed',
    date: '2025-11-07',
    status: 'upcoming',
    icon: 'cabinets',
    tradeId: 'cabinets'
  },
  {
    id: 'paint_complete',
    name: 'Paint Complete',
    date: '2025-11-14',
    status: 'upcoming',
    icon: 'paint',
    tradeId: 'paint'
  },
  {
    id: 'walkthrough_complete',
    name: 'Client Walkthrough',
    date: '2025-11-18',
    status: 'upcoming',
    icon: 'walkthrough',
    tradeId: 'walkthrough',
    requiresDecision: true
  },
  {
    id: 'final_complete',
    name: 'Final Inspection Complete',
    date: '2025-11-20',
    status: 'upcoming',
    icon: 'final',
    tradeId: 'final'
  }
];

// Wilson Home project details
export const sampleProject = {
  name: 'Wilson Home',
  startDate: '2025-09-01',
  endDate: '2025-11-20',
  totalCost: 325000,
  status: 'in_progress'
};