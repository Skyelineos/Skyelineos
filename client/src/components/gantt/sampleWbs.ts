// src/components/gantt/sampleWbs.ts
import type { WbsTask } from '@/types/wbs';

export const sampleWbs: WbsTask[] = [
  {
    id: 'p',
    name: 'Christensen Home',
    startDate: '2025-08-18',
    endDate:   '2026-05-13',
    children: [
      {
        id: 'p.1',
        name: 'Phase 1 (Excavation, Underground)',
        startDate: '2025-08-18',
        endDate:   '2025-10-06',
        children: [
          { id:'1.1.1', name:'Staking the Lot', startDate:'2025-08-18', endDate:'2025-08-19', percent:0 },
          { id:'1.1.2', name:'Excavation', startDate:'2025-08-20', endDate:'2025-08-26', predecessors:[{taskId:'1.1.1', type:'FS'}] },
          { id:'1.1.3', name:'Stake Again for Footings', startDate:'2025-08-27', endDate:'2025-08-28', predecessors:[{taskId:'1.1.2', type:'FS'}] },
          { id:'1.1.4', name:'Footings and Foundation', startDate:'2025-08-29', endDate:'2025-09-11', predecessors:[{taskId:'1.1.3', type:'FS'}] },
          { id:'1.1.5', name:'Underground Plumbing', startDate:'2025-09-12', endDate:'2025-09-18', predecessors:[{taskId:'1.1.4', type:'FS'}] },
          { id:'1.1.6', name:'Waterproofing/Downspouts', startDate:'2025-09-19', endDate:'2025-09-24', predecessors:[{taskId:'1.1.5', type:'FS'}] },
          { id:'1.1.7', name:'Sewer Connection and Backfill', startDate:'2025-09-25', endDate:'2025-09-30', predecessors:[{taskId:'1.1.6', type:'FS'}] },
          { id:'1.1.8', name:'Concrete Flat Work', startDate:'2025-10-01', endDate:'2025-10-06', predecessors:[{taskId:'1.1.7', type:'FS'}] },
        ]
      },
      {
        id: 'p.2',
        name: 'Phase 2 (4 Way)',
        startDate: '2025-10-07',
        endDate:   '2025-12-18',
        children: [
          { id:'2.1', name:'Dry in Roof (Begin Roofing)', startDate:'2025-11-07', endDate:'2025-11-15' },
          { id:'2.2', name:'Windows and Exterior Doors', startDate:'2025-11-15', endDate:'2025-11-26', predecessors:[{taskId:'2.1', type:'FS'}] },
          { id:'2.3', name:'Roofing', startDate:'2025-11-16', endDate:'2025-12-14', predecessors:[{taskId:'2.1', type:'SS'}] },
          { id:'2.4', name:'HVAC/Plumbing', startDate:'2025-11-16', endDate:'2025-12-08', predecessors:[{taskId:'2.1', type:'SS'}] },
          { id:'2.5', name:'Electrical', startDate:'2025-12-09', endDate:'2025-12-18', predecessors:[{taskId:'2.4', type:'FS'}] },
        ]
      }
    ]
  }
];