// Sample WBS construction data for testing
import type { WbsTask } from '../types';

export const sampleWbs: WbsTask[] = [
  {
    id: 'p',
    name: 'Christensen Home Construction',
    startDate: '2025-08-18',
    endDate: '2026-05-13',
    progress: 35,
    children: [
      {
        id: 'p.1',
        name: '🏗️ Phase 1 - Foundation',
        startDate: '2025-08-18',
        endDate: '2025-10-06',
        progress: 80,
        children: [
          { 
            id: '1.1.1', 
            name: 'Site Survey & Staking', 
            startDate: '2025-08-18', 
            endDate: '2025-08-19',
            progress: 100,
            durationDays: 1
          },
          { 
            id: '1.1.2', 
            name: 'Excavation & Grading', 
            startDate: '2025-08-20', 
            endDate: '2025-08-26', 
            progress: 100,
            durationDays: 5,
            predecessors: [{ sourceId: '1.1.1', targetId: '1.1.2', type: 'FS' }]
          },
          { 
            id: '1.1.3', 
            name: 'Foundation & Footings', 
            startDate: '2025-08-27', 
            endDate: '2025-09-11', 
            progress: 90,
            durationDays: 12,
            predecessors: [{ sourceId: '1.1.2', targetId: '1.1.3', type: 'FS' }]
          },
          { 
            id: '1.1.4', 
            name: 'Underground Utilities', 
            startDate: '2025-09-12', 
            endDate: '2025-09-25', 
            progress: 75,
            durationDays: 10,
            predecessors: [{ sourceId: '1.1.3', targetId: '1.1.4', type: 'FS' }]
          }
        ]
      },
      {
        id: 'p.2',
        name: '🏠 Phase 2 - Framing',
        startDate: '2025-09-26',
        endDate: '2025-12-15',
        progress: 45,
        children: [
          { 
            id: '2.1.1', 
            name: 'Floor System', 
            startDate: '2025-09-26', 
            endDate: '2025-10-10',
            progress: 100,
            durationDays: 12,
            predecessors: [{ sourceId: '1.1.4', targetId: '2.1.1', type: 'FS' }]
          },
          { 
            id: '2.1.2', 
            name: 'Wall Framing', 
            startDate: '2025-10-11', 
            endDate: '2025-11-01',
            progress: 80,
            durationDays: 16,
            predecessors: [{ sourceId: '2.1.1', targetId: '2.1.2', type: 'FS' }]
          },
          { 
            id: '2.1.3', 
            name: 'Roof Framing', 
            startDate: '2025-11-02', 
            endDate: '2025-11-22',
            progress: 60,
            durationDays: 15,
            predecessors: [{ sourceId: '2.1.2', targetId: '2.1.3', type: 'FS' }]
          },
          { 
            id: '2.1.4', 
            name: 'Windows & Doors', 
            startDate: '2025-11-23', 
            endDate: '2025-12-05',
            progress: 25,
            durationDays: 9,
            predecessors: [{ sourceId: '2.1.3', targetId: '2.1.4', type: 'FS' }]
          }
        ]
      },
      {
        id: 'p.3',
        name: '⚡ Phase 3 - Systems',
        startDate: '2025-12-06',
        endDate: '2026-02-28',
        progress: 15,
        children: [
          { 
            id: '3.1.1', 
            name: 'Electrical Rough-in', 
            startDate: '2025-12-06', 
            endDate: '2025-12-20',
            progress: 40,
            durationDays: 11,
            predecessors: [{ sourceId: '2.1.4', targetId: '3.1.1', type: 'FS' }]
          },
          { 
            id: '3.1.2', 
            name: 'Plumbing Rough-in', 
            startDate: '2025-12-06', 
            endDate: '2025-12-18',
            progress: 35,
            durationDays: 9,
            predecessors: [{ sourceId: '2.1.4', targetId: '3.1.2', type: 'FS' }]
          },
          { 
            id: '3.1.3', 
            name: 'HVAC Installation', 
            startDate: '2025-12-21', 
            endDate: '2026-01-15',
            progress: 10,
            durationDays: 18,
            predecessors: [
              { sourceId: '3.1.1', targetId: '3.1.3', type: 'FS' },
              { sourceId: '3.1.2', targetId: '3.1.3', type: 'FS' }
            ]
          }
        ]
      },
      {
        id: 'p.4',
        name: '🎨 Phase 4 - Finishes',
        startDate: '2026-01-16',
        endDate: '2026-05-13',
        progress: 0,
        children: [
          { 
            id: '4.1.1', 
            name: 'Insulation & Drywall', 
            startDate: '2026-01-16', 
            endDate: '2026-02-28',
            progress: 5,
            durationDays: 30,
            predecessors: [{ sourceId: '3.1.3', targetId: '4.1.1', type: 'FS' }]
          },
          { 
            id: '4.1.2', 
            name: 'Interior Painting', 
            startDate: '2026-03-01', 
            endDate: '2026-03-21',
            progress: 0,
            durationDays: 15,
            predecessors: [{ sourceId: '4.1.1', targetId: '4.1.2', type: 'FS' }]
          },
          { 
            id: '4.1.3', 
            name: 'Flooring Installation', 
            startDate: '2026-03-22', 
            endDate: '2026-04-18',
            progress: 0,
            durationDays: 20,
            predecessors: [{ sourceId: '4.1.2', targetId: '4.1.3', type: 'FS' }]
          },
          { 
            id: '4.1.4', 
            name: 'Final Fixtures & Cleanup', 
            startDate: '2026-04-19', 
            endDate: '2026-05-13',
            progress: 0,
            durationDays: 17,
            predecessors: [{ sourceId: '4.1.3', targetId: '4.1.4', type: 'FS' }]
          }
        ]
      }
    ]
  }
];