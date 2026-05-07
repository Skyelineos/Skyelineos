// Sample Construction Data for BuildTrackerPro
import type { WbsTask, Link } from '../types';

export const WILSON_HOME_TASKS: WbsTask[] = [
  {
    id: '1',
    name: '🏗️ Wilson Home Construction',
    startDate: '2025-03-01',
    endDate: '2025-08-15',
    progress: 25,
    children: [
      {
        id: '1.1',
        name: '📋 Pre-Construction Phase',
        startDate: '2025-03-01',
        endDate: '2025-03-21',
        progress: 80,
        phase: 'rough',
        children: [
          {
            id: '1.1.1',
            name: 'Permits & Approvals',
            startDate: '2025-03-01',
            endDate: '2025-03-07',
            progress: 100,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.1.2',
            name: 'Site Survey & Engineering',
            startDate: '2025-03-08',
            endDate: '2025-03-14',
            progress: 100,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.1.3',
            name: 'Material Ordering',
            startDate: '2025-03-15',
            endDate: '2025-03-21',
            progress: 60,
            status: 'on_track',
            durationDays: 5
          }
        ]
      },
      {
        id: '1.2',
        name: '🚧 Site Preparation',
        startDate: '2025-03-24',
        endDate: '2025-04-11',
        progress: 45,
        phase: 'rough',
        children: [
          {
            id: '1.2.1',
            name: 'Excavation & Grading',
            startDate: '2025-03-24',
            endDate: '2025-03-28',
            progress: 100,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.2.2',
            name: 'Utilities Installation',
            startDate: '2025-03-31',
            endDate: '2025-04-04',
            progress: 75,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.2.3',
            name: 'Driveway & Walkways',
            startDate: '2025-04-07',
            endDate: '2025-04-11',
            progress: 0,
            status: 'pending_approval',
            durationDays: 5
          }
        ]
      },
      {
        id: '1.3',
        name: '🏠 Foundation Work',
        startDate: '2025-04-14',
        endDate: '2025-05-02',
        progress: 20,
        phase: 'rough',
        children: [
          {
            id: '1.3.1',
            name: 'Footings & Foundation Walls',
            startDate: '2025-04-14',
            endDate: '2025-04-25',
            progress: 40,
            status: 'on_track',
            durationDays: 8
          },
          {
            id: '1.3.2',
            name: 'Basement Waterproofing',
            startDate: '2025-04-28',
            endDate: '2025-05-02',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          }
        ]
      },
      {
        id: '1.4',
        name: '🔨 Framing & Structure',
        startDate: '2025-05-05',
        endDate: '2025-05-30',
        progress: 0,
        phase: 'rough',
        children: [
          {
            id: '1.4.1',
            name: 'Floor Framing',
            startDate: '2025-05-05',
            endDate: '2025-05-09',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.4.2',
            name: 'Wall Framing',
            startDate: '2025-05-12',
            endDate: '2025-05-23',
            progress: 0,
            status: 'on_track',
            durationDays: 10
          },
          {
            id: '1.4.3',
            name: 'Roof Framing & Sheathing',
            startDate: '2025-05-26',
            endDate: '2025-05-30',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          }
        ]
      },
      {
        id: '1.5',
        name: '🔌 MEP Rough-In',
        startDate: '2025-06-02',
        endDate: '2025-06-20',
        progress: 0,
        phase: 'rough',
        children: [
          {
            id: '1.5.1',
            name: 'Electrical Rough-In',
            startDate: '2025-06-02',
            endDate: '2025-06-06',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.5.2',
            name: 'Plumbing Rough-In',
            startDate: '2025-06-09',
            endDate: '2025-06-13',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.5.3',
            name: 'HVAC Installation',
            startDate: '2025-06-16',
            endDate: '2025-06-20',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          }
        ]
      },
      {
        id: '1.6',
        name: '🎨 Finishes',
        startDate: '2025-06-23',
        endDate: '2025-08-01',
        progress: 0,
        phase: 'finish',
        children: [
          {
            id: '1.6.1',
            name: 'Drywall & Paint',
            startDate: '2025-06-23',
            endDate: '2025-07-04',
            progress: 0,
            status: 'on_track',
            durationDays: 10
          },
          {
            id: '1.6.2',
            name: 'Flooring Installation',
            startDate: '2025-07-07',
            endDate: '2025-07-18',
            progress: 0,
            status: 'on_track',
            durationDays: 8
          },
          {
            id: '1.6.3',
            name: 'Kitchen & Bathroom Finishes',
            startDate: '2025-07-21',
            endDate: '2025-08-01',
            progress: 0,
            status: 'on_track',
            durationDays: 10
          }
        ]
      },
      {
        id: '1.7',
        name: '✅ Final Phase',
        startDate: '2025-08-04',
        endDate: '2025-08-15',
        progress: 0,
        phase: 'finish',
        children: [
          {
            id: '1.7.1',
            name: 'Final Inspection',
            startDate: '2025-08-04',
            endDate: '2025-08-08',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          },
          {
            id: '1.7.2',
            name: 'Client Walkthrough',
            startDate: '2025-08-11',
            endDate: '2025-08-15',
            progress: 0,
            status: 'on_track',
            durationDays: 5
          }
        ]
      }
    ]
  }
];

export const WILSON_HOME_LINKS: Link[] = [
  {
    id: 'link1',
    sourceId: '1.1.3',
    targetId: '1.2.1',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link2',
    sourceId: '1.2.1',
    targetId: '1.2.2',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link3',
    sourceId: '1.2.2',
    targetId: '1.2.3',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link4',
    sourceId: '1.2.3',
    targetId: '1.3.1',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link5',
    sourceId: '1.3.1',
    targetId: '1.3.2',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link6',
    sourceId: '1.3.2',
    targetId: '1.4.1',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link7',
    sourceId: '1.4.1',
    targetId: '1.4.2',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link8',
    sourceId: '1.4.2',
    targetId: '1.4.3',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link9',
    sourceId: '1.4.3',
    targetId: '1.5.1',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link10',
    sourceId: '1.5.1',
    targetId: '1.5.2',
    type: 'SS',
    lagDays: 2
  },
  {
    id: 'link11',
    sourceId: '1.5.2',
    targetId: '1.5.3',
    type: 'SS',
    lagDays: 2
  },
  {
    id: 'link12',
    sourceId: '1.5.3',
    targetId: '1.6.1',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link13',
    sourceId: '1.6.1',
    targetId: '1.6.2',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link14',
    sourceId: '1.6.2',
    targetId: '1.6.3',
    type: 'SS',
    lagDays: 5
  },
  {
    id: 'link15',
    sourceId: '1.6.3',
    targetId: '1.7.1',
    type: 'FS',
    lagDays: 1
  },
  {
    id: 'link16',
    sourceId: '1.7.1',
    targetId: '1.7.2',
    type: 'FS',
    lagDays: 1
  }
];