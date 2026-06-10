// AUTO-GENERATED starter schedule templates seeded into Firestore `scheduleTemplates`.
// House Build = Skyeline's real build schedule (from the office Gantt): 5 phases with
// real tasks, dates and durations; selection/decision steps flagged via status
// 'pending_approval'. Basement / Pool / Remodel are starter skeletons to flesh out.
// Editor renders a flat task list + links, so phases are header rows; dates re-anchor
// to the project target start when a template is applied.
import type { Link } from '@/modules/gantt/types';

export interface StarterScheduleTask {
  id: string; name: string; startDate: string; endDate: string; durationDays?: number;
  status?: 'on_track' | 'delayed' | 'pending_approval';
  isPhase?: boolean; decision?: boolean;
}
export interface StarterScheduleTemplate {
  key: string; name: string; description: string; tasks: StarterScheduleTask[]; links: Link[];
}

export const STARTER_SCHEDULE_TEMPLATES: StarterScheduleTemplate[] = [
  {
    "key": "house_build",
    "name": "House Build",
    "description": "Skyeline's real custom-home build schedule: 5 phases, 85 tasks, ~11 months. Selection/decision steps flagged. Re-anchored to the project target start when applied.",
    "tasks": [
      {
        "id": "hb_1_1",
        "name": "Pre-Construction",
        "startDate": "2025-01-06",
        "endDate": "2025-04-01",
        "durationDays": 86,
        "isPhase": true
      },
      {
        "id": "hb_1_1_1",
        "name": "Architect/Designer",
        "startDate": "2025-01-06",
        "endDate": "2025-02-12",
        "durationDays": 38
      },
      {
        "id": "hb_1_1_2",
        "name": "Secure Lot (If not alread",
        "startDate": "2025-02-13",
        "endDate": "2025-02-13",
        "durationDays": 1
      },
      {
        "id": "hb_1_1_3",
        "name": "Finish Selections",
        "startDate": "2025-02-13",
        "endDate": "2025-02-19",
        "durationDays": 7,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_1_4",
        "name": "Structural Engineering",
        "startDate": "2025-02-20",
        "endDate": "2025-03-11",
        "durationDays": 20
      },
      {
        "id": "hb_1_1_5",
        "name": "Manual J",
        "startDate": "2025-03-12",
        "endDate": "2025-03-13",
        "durationDays": 2
      },
      {
        "id": "hb_1_1_6",
        "name": "Res Check",
        "startDate": "2025-03-12",
        "endDate": "2025-03-12",
        "durationDays": 1
      },
      {
        "id": "hb_1_1_7",
        "name": "Soils Report",
        "startDate": "2025-03-12",
        "endDate": "2025-03-12",
        "durationDays": 1
      },
      {
        "id": "hb_1_1_8",
        "name": "Permits and Approvals",
        "startDate": "2025-03-12",
        "endDate": "2025-03-31",
        "durationDays": 20
      },
      {
        "id": "hb_1_1_9",
        "name": "Temp Power and Honey",
        "startDate": "2025-04-01",
        "endDate": "2025-04-01",
        "durationDays": 1
      },
      {
        "id": "hb_1_2",
        "name": "Phase 1 \u2014 Excavation, Underground & Foundation",
        "startDate": "2025-04-01",
        "endDate": "2025-05-21",
        "durationDays": 51,
        "isPhase": true
      },
      {
        "id": "hb_1_2_1",
        "name": "Select Windows and Ext",
        "startDate": "2025-04-01",
        "endDate": "2025-04-01",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_2_2",
        "name": "Select Roofing Material a",
        "startDate": "2025-04-01",
        "endDate": "2025-04-01",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_2_3",
        "name": "Select Plumbing Fixtures",
        "startDate": "2025-04-01",
        "endDate": "2025-04-01",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_2_4",
        "name": "Select Fireplace and ma",
        "startDate": "2025-04-01",
        "endDate": "2025-04-01",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_2_5",
        "name": "Select Window Well Styl",
        "startDate": "2025-04-01",
        "endDate": "2025-04-01",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_2_6",
        "name": "Staking the Lot",
        "startDate": "2025-04-01",
        "endDate": "2025-04-02",
        "durationDays": 2
      },
      {
        "id": "hb_1_2_7",
        "name": "Excavation",
        "startDate": "2025-04-03",
        "endDate": "2025-04-09",
        "durationDays": 7
      },
      {
        "id": "hb_1_2_8",
        "name": "Stake Again for Footings",
        "startDate": "2025-04-10",
        "endDate": "2025-04-11",
        "durationDays": 2
      },
      {
        "id": "hb_1_2_9",
        "name": "Schedule Concrete Was",
        "startDate": "2025-04-14",
        "endDate": "2025-04-14",
        "durationDays": 1
      },
      {
        "id": "hb_1_2_10",
        "name": "Footings and Foundation",
        "startDate": "2025-04-15",
        "endDate": "2025-04-28",
        "durationDays": 14
      },
      {
        "id": "hb_1_2_11",
        "name": "Install Window Wells",
        "startDate": "2025-04-29",
        "endDate": "2025-04-30",
        "durationDays": 2
      },
      {
        "id": "hb_1_2_12",
        "name": "Underground Plumbing",
        "startDate": "2025-04-29",
        "endDate": "2025-05-05",
        "durationDays": 7
      },
      {
        "id": "hb_1_2_13",
        "name": "Waterproofing/Downproo",
        "startDate": "2025-05-06",
        "endDate": "2025-05-09",
        "durationDays": 4
      },
      {
        "id": "hb_1_2_14",
        "name": "Sewer Connection and B",
        "startDate": "2025-05-12",
        "endDate": "2025-05-15",
        "durationDays": 4
      },
      {
        "id": "hb_1_2_15",
        "name": "Concrete Flat Work",
        "startDate": "2025-05-16",
        "endDate": "2025-05-21",
        "durationDays": 6
      },
      {
        "id": "hb_1_3",
        "name": "Phase 2 \u2014 Framing to 4-Way",
        "startDate": "2025-05-22",
        "endDate": "2025-08-01",
        "durationDays": 72,
        "isPhase": true
      },
      {
        "id": "hb_1_3_1",
        "name": "Install Security Camera",
        "startDate": "2025-05-22",
        "endDate": "2025-05-22",
        "durationDays": 1
      },
      {
        "id": "hb_1_3_2",
        "name": "Install Temp Power",
        "startDate": "2025-05-22",
        "endDate": "2025-05-22",
        "durationDays": 1
      },
      {
        "id": "hb_1_3_3",
        "name": "Set up Honey Bucket",
        "startDate": "2025-05-22",
        "endDate": "2025-05-22",
        "durationDays": 1
      },
      {
        "id": "hb_1_3_4",
        "name": "Install Sign and SWPPP",
        "startDate": "2025-05-22",
        "endDate": "2025-05-22",
        "durationDays": 1
      },
      {
        "id": "hb_1_3_5",
        "name": "Select Appliances",
        "startDate": "2025-05-22",
        "endDate": "2025-05-22",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_3_6",
        "name": "Framing",
        "startDate": "2025-05-22",
        "endDate": "2025-07-02",
        "durationDays": 42
      },
      {
        "id": "hb_1_3_7",
        "name": "Dry In Roof (Begin Roofi",
        "startDate": "2025-07-03",
        "endDate": "2025-07-07",
        "durationDays": 5
      },
      {
        "id": "hb_1_3_8",
        "name": "Windows and Exterior D",
        "startDate": "2025-07-08",
        "endDate": "2025-07-11",
        "durationDays": 4
      },
      {
        "id": "hb_1_3_9",
        "name": "Roofing",
        "startDate": "2025-07-08",
        "endDate": "2025-07-21",
        "durationDays": 14
      },
      {
        "id": "hb_1_3_10",
        "name": "HVAC/Plumbing",
        "startDate": "2025-07-08",
        "endDate": "2025-07-16",
        "durationDays": 9
      },
      {
        "id": "hb_1_3_11",
        "name": "Electrical",
        "startDate": "2025-07-17",
        "endDate": "2025-07-25",
        "durationDays": 9
      },
      {
        "id": "hb_1_3_12",
        "name": "Fireplace Install",
        "startDate": "2025-07-28",
        "endDate": "2025-07-29",
        "durationDays": 2
      },
      {
        "id": "hb_1_3_13",
        "name": "AV/Internet (Low voltage",
        "startDate": "2025-07-28",
        "endDate": "2025-07-30",
        "durationDays": 3
      },
      {
        "id": "hb_1_3_14",
        "name": "Home Owner Walkthroug",
        "startDate": "2025-07-31",
        "endDate": "2025-07-31",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_3_15",
        "name": "4 way Inspection and Sh",
        "startDate": "2025-07-30",
        "endDate": "2025-08-01",
        "durationDays": 3
      },
      {
        "id": "hb_1_4",
        "name": "Phase 3 \u2014 Insulation, Drywall & Exterior",
        "startDate": "2025-07-08",
        "endDate": "2025-09-24",
        "durationDays": 79,
        "isPhase": true
      },
      {
        "id": "hb_1_4_1",
        "name": "Measure for Interior doo",
        "startDate": "2025-07-08",
        "endDate": "2025-07-08",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_4_2",
        "name": "Order all Flooring, Tile a",
        "startDate": "2025-08-04",
        "endDate": "2025-07-27",
        "durationDays": -7,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_4_3",
        "name": "Call for Water Meter to b",
        "startDate": "2025-08-04",
        "endDate": "2025-08-04",
        "durationDays": 1
      },
      {
        "id": "hb_1_4_4",
        "name": "Call for Permanent Powe",
        "startDate": "2025-08-04",
        "endDate": "2025-08-04",
        "durationDays": 1
      },
      {
        "id": "hb_1_4_5",
        "name": "Drywall Measurement an",
        "startDate": "2025-08-04",
        "endDate": "2025-08-04",
        "durationDays": 1
      },
      {
        "id": "hb_1_4_6",
        "name": "Finalize Cabinet Layout",
        "startDate": "2025-08-04",
        "endDate": "2025-08-21",
        "durationDays": 18,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_4_7",
        "name": "Select Tile and Finish Tr",
        "startDate": "2025-08-04",
        "endDate": "2025-08-12",
        "durationDays": 9,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_4_8",
        "name": "Shower Pan install/inspe",
        "startDate": "2025-08-04",
        "endDate": "2025-08-06",
        "durationDays": 3
      },
      {
        "id": "hb_1_4_9",
        "name": "Insulation Begins",
        "startDate": "2025-08-04",
        "endDate": "2025-08-08",
        "durationDays": 5
      },
      {
        "id": "hb_1_4_10",
        "name": "Inspection for Insulation",
        "startDate": "2025-08-11",
        "endDate": "2025-08-13",
        "durationDays": 3
      },
      {
        "id": "hb_1_4_11",
        "name": "Stock Drywall Materials",
        "startDate": "2025-08-14",
        "endDate": "2025-08-18",
        "durationDays": 5
      },
      {
        "id": "hb_1_4_12",
        "name": "Install Drywall",
        "startDate": "2025-08-19",
        "endDate": "2025-08-25",
        "durationDays": 7
      },
      {
        "id": "hb_1_4_13",
        "name": "Drywall inspection",
        "startDate": "2025-08-26",
        "endDate": "2025-08-26",
        "durationDays": 1
      },
      {
        "id": "hb_1_4_14",
        "name": "Decision on Texture and",
        "startDate": "2025-08-26",
        "endDate": "2025-08-26",
        "durationDays": 1
      },
      {
        "id": "hb_1_4_15",
        "name": "Tape,Mud,Texture",
        "startDate": "2025-08-27",
        "endDate": "2025-09-03",
        "durationDays": 8
      },
      {
        "id": "hb_1_4_16",
        "name": "Home Owner Walkthroug",
        "startDate": "2025-09-04",
        "endDate": "2025-09-04",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_4_17",
        "name": "Install all hard surface flo",
        "startDate": "2025-09-05",
        "endDate": "2025-09-24",
        "durationDays": 20
      },
      {
        "id": "hb_1_4_18",
        "name": "House Wrap for exterior",
        "startDate": "2025-08-04",
        "endDate": "2025-08-04",
        "durationDays": 1
      },
      {
        "id": "hb_1_4_19",
        "name": "Soffit Installation",
        "startDate": "2025-08-05",
        "endDate": "2025-08-08",
        "durationDays": 4
      },
      {
        "id": "hb_1_4_20",
        "name": "Attic Insulation Installed",
        "startDate": "2025-09-05",
        "endDate": "2025-09-08",
        "durationDays": 4
      },
      {
        "id": "hb_1_4_21",
        "name": "Scratch coat for stucco a",
        "startDate": "2025-08-11",
        "endDate": "2025-08-15",
        "durationDays": 5
      },
      {
        "id": "hb_1_4_22",
        "name": "Inspection of scratch coa",
        "startDate": "2025-08-18",
        "endDate": "2025-08-18",
        "durationDays": 1
      },
      {
        "id": "hb_1_4_23",
        "name": "Stone Work",
        "startDate": "2025-08-18",
        "endDate": "2025-09-12",
        "durationDays": 26
      },
      {
        "id": "hb_1_4_24",
        "name": "Apply Finish Stucco Coa",
        "startDate": "2025-09-09",
        "endDate": "2025-09-11",
        "durationDays": 3
      },
      {
        "id": "hb_1_4_25",
        "name": "Remove Scaffolding and",
        "startDate": "2025-09-10",
        "endDate": "2025-09-11",
        "durationDays": 2
      },
      {
        "id": "hb_1_5",
        "name": "Phase 4 \u2014 Finish Work",
        "startDate": "2025-08-29",
        "endDate": "2025-12-05",
        "durationDays": 99,
        "isPhase": true
      },
      {
        "id": "hb_1_5_1",
        "name": "Excavator Prep for Drive",
        "startDate": "2025-09-12",
        "endDate": "2025-09-16",
        "durationDays": 5
      },
      {
        "id": "hb_1_5_2",
        "name": "Pour Driveways, Walkwa",
        "startDate": "2025-09-17",
        "endDate": "2025-09-23",
        "durationDays": 7
      },
      {
        "id": "hb_1_5_3",
        "name": "Select Counter Tops and",
        "startDate": "2025-08-29",
        "endDate": "2025-08-29",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_5_4",
        "name": "Install Finish Carpentry (",
        "startDate": "2025-09-25",
        "endDate": "2025-10-08",
        "durationDays": 14
      },
      {
        "id": "hb_1_5_5",
        "name": "Tile install for all showers",
        "startDate": "2025-09-25",
        "endDate": "2025-10-08",
        "durationDays": 14
      },
      {
        "id": "hb_1_5_6",
        "name": "Measure for shower glas",
        "startDate": "2025-10-09",
        "endDate": "2025-10-09",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_5_7",
        "name": "Paint",
        "startDate": "2025-10-09",
        "endDate": "2025-10-22",
        "durationDays": 14
      },
      {
        "id": "hb_1_5_8",
        "name": "Install Garage Doors",
        "startDate": "2025-10-14",
        "endDate": "2025-10-15",
        "durationDays": 2
      },
      {
        "id": "hb_1_5_9",
        "name": "Install Cabinets",
        "startDate": "2025-10-23",
        "endDate": "2025-10-29",
        "durationDays": 7
      },
      {
        "id": "hb_1_5_10",
        "name": "Countertop Install",
        "startDate": "2025-10-30",
        "endDate": "2025-11-03",
        "durationDays": 5
      },
      {
        "id": "hb_1_5_11",
        "name": "Finish Plumbing and HVA",
        "startDate": "2025-11-04",
        "endDate": "2025-11-10",
        "durationDays": 7
      },
      {
        "id": "hb_1_5_12",
        "name": "Finish Electrical",
        "startDate": "2025-11-11",
        "endDate": "2025-11-17",
        "durationDays": 7
      },
      {
        "id": "hb_1_5_13",
        "name": "Appliance Install",
        "startDate": "2025-11-18",
        "endDate": "2025-11-18",
        "durationDays": 1
      },
      {
        "id": "hb_1_5_14",
        "name": "Carpet Install",
        "startDate": "2025-11-18",
        "endDate": "2025-11-20",
        "durationDays": 3
      },
      {
        "id": "hb_1_5_15",
        "name": "Install Mirrors and Show",
        "startDate": "2025-11-18",
        "endDate": "2025-11-20",
        "durationDays": 3
      },
      {
        "id": "hb_1_5_16",
        "name": "Blower Doors Test and C",
        "startDate": "2025-11-21",
        "endDate": "2025-11-25",
        "durationDays": 5
      },
      {
        "id": "hb_1_5_17",
        "name": "Epoxy for Garage Floors",
        "startDate": "2025-11-26",
        "endDate": "2025-11-28",
        "durationDays": 3
      },
      {
        "id": "hb_1_5_18",
        "name": "Interior Cleaning",
        "startDate": "2025-12-01",
        "endDate": "2025-12-02",
        "durationDays": 2
      },
      {
        "id": "hb_1_5_19",
        "name": "Walkthrough with client",
        "startDate": "2025-12-03",
        "endDate": "2025-12-03",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_1_5_20",
        "name": "City Final Inspection",
        "startDate": "2025-12-03",
        "endDate": "2025-12-03",
        "durationDays": 1
      },
      {
        "id": "hb_1_5_21",
        "name": "Final Punch List Made a",
        "startDate": "2025-12-04",
        "endDate": "2025-12-05",
        "durationDays": 2
      }
    ],
    "links": [
      {
        "id": "l_hb_1_1_hb_1_2",
        "sourceId": "hb_1_1",
        "targetId": "hb_1_2",
        "type": "FS"
      },
      {
        "id": "l_hb_1_2_hb_1_3",
        "sourceId": "hb_1_2",
        "targetId": "hb_1_3",
        "type": "FS"
      },
      {
        "id": "l_hb_1_3_hb_1_4",
        "sourceId": "hb_1_3",
        "targetId": "hb_1_4",
        "type": "FS"
      },
      {
        "id": "l_hb_1_4_hb_1_5",
        "sourceId": "hb_1_4",
        "targetId": "hb_1_5",
        "type": "FS"
      }
    ]
  },
  {
    "key": "basement_finish",
    "name": "Basement Finishing",
    "description": "Finishing an unfinished basement. Edit in the Gantt editor.",
    "tasks": [
      {
        "id": "basement_finish_design_permit",
        "name": "Design & Permit",
        "startDate": "2025-01-06",
        "endDate": "2025-01-15",
        "durationDays": 10,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "basement_finish_layout_framing",
        "name": "Layout & Framing",
        "startDate": "2025-01-16",
        "endDate": "2025-01-25",
        "durationDays": 10
      },
      {
        "id": "basement_finish_rough_in_plumbing",
        "name": "Rough-In: Plumbing",
        "startDate": "2025-01-26",
        "endDate": "2025-01-31",
        "durationDays": 6
      },
      {
        "id": "basement_finish_rough_in_electrical",
        "name": "Rough-In: Electrical",
        "startDate": "2025-02-01",
        "endDate": "2025-02-06",
        "durationDays": 6
      },
      {
        "id": "basement_finish_rough_in_hvac",
        "name": "Rough-In: HVAC",
        "startDate": "2025-02-07",
        "endDate": "2025-02-11",
        "durationDays": 5
      },
      {
        "id": "basement_finish_inspections",
        "name": "Inspections",
        "startDate": "2025-02-12",
        "endDate": "2025-02-14",
        "durationDays": 3
      },
      {
        "id": "basement_finish_insulation",
        "name": "Insulation",
        "startDate": "2025-02-15",
        "endDate": "2025-02-18",
        "durationDays": 4
      },
      {
        "id": "basement_finish_select_finishes",
        "name": "Select Finishes",
        "startDate": "2025-02-19",
        "endDate": "2025-02-19",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "basement_finish_drywall",
        "name": "Drywall",
        "startDate": "2025-02-20",
        "endDate": "2025-03-01",
        "durationDays": 10
      },
      {
        "id": "basement_finish_paint",
        "name": "Paint",
        "startDate": "2025-03-02",
        "endDate": "2025-03-07",
        "durationDays": 6
      },
      {
        "id": "basement_finish_flooring",
        "name": "Flooring",
        "startDate": "2025-03-08",
        "endDate": "2025-03-13",
        "durationDays": 6,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "basement_finish_trim_doors",
        "name": "Trim & Doors",
        "startDate": "2025-03-14",
        "endDate": "2025-03-19",
        "durationDays": 6
      },
      {
        "id": "basement_finish_cabinets_bath_fixtures",
        "name": "Cabinets/Bath Fixtures",
        "startDate": "2025-03-20",
        "endDate": "2025-03-25",
        "durationDays": 6,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "basement_finish_final_clean_punch",
        "name": "Final Clean & Punch",
        "startDate": "2025-03-26",
        "endDate": "2025-03-29",
        "durationDays": 4
      }
    ],
    "links": [
      {
        "id": "l_basement_finish_design_permit_basement_finish_layout_framing",
        "sourceId": "basement_finish_design_permit",
        "targetId": "basement_finish_layout_framing",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_layout_framing_basement_finish_rough_in_plumbing",
        "sourceId": "basement_finish_layout_framing",
        "targetId": "basement_finish_rough_in_plumbing",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_rough_in_plumbing_basement_finish_rough_in_electrical",
        "sourceId": "basement_finish_rough_in_plumbing",
        "targetId": "basement_finish_rough_in_electrical",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_rough_in_electrical_basement_finish_rough_in_hvac",
        "sourceId": "basement_finish_rough_in_electrical",
        "targetId": "basement_finish_rough_in_hvac",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_rough_in_hvac_basement_finish_inspections",
        "sourceId": "basement_finish_rough_in_hvac",
        "targetId": "basement_finish_inspections",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_inspections_basement_finish_insulation",
        "sourceId": "basement_finish_inspections",
        "targetId": "basement_finish_insulation",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_insulation_basement_finish_select_finishes",
        "sourceId": "basement_finish_insulation",
        "targetId": "basement_finish_select_finishes",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_select_finishes_basement_finish_drywall",
        "sourceId": "basement_finish_select_finishes",
        "targetId": "basement_finish_drywall",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_drywall_basement_finish_paint",
        "sourceId": "basement_finish_drywall",
        "targetId": "basement_finish_paint",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_paint_basement_finish_flooring",
        "sourceId": "basement_finish_paint",
        "targetId": "basement_finish_flooring",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_flooring_basement_finish_trim_doors",
        "sourceId": "basement_finish_flooring",
        "targetId": "basement_finish_trim_doors",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_trim_doors_basement_finish_cabinets_bath_fixtures",
        "sourceId": "basement_finish_trim_doors",
        "targetId": "basement_finish_cabinets_bath_fixtures",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_cabinets_bath_fixtures_basement_finish_final_clean_punch",
        "sourceId": "basement_finish_cabinets_bath_fixtures",
        "targetId": "basement_finish_final_clean_punch",
        "type": "FS"
      }
    ]
  },
  {
    "key": "pool_build",
    "name": "Pool Build",
    "description": "In-ground pool construction. Edit in the Gantt editor.",
    "tasks": [
      {
        "id": "pool_build_design_permit",
        "name": "Design & Permit",
        "startDate": "2025-01-06",
        "endDate": "2025-01-19",
        "durationDays": 14,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "pool_build_select_finishes_tile_cop",
        "name": "Select Finishes (tile/coping/plaster)",
        "startDate": "2025-01-20",
        "endDate": "2025-01-20",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "pool_build_layout_excavation",
        "name": "Layout & Excavation",
        "startDate": "2025-01-21",
        "endDate": "2025-01-25",
        "durationDays": 5
      },
      {
        "id": "pool_build_steel_bond_beam",
        "name": "Steel & Bond Beam",
        "startDate": "2025-01-26",
        "endDate": "2025-01-29",
        "durationDays": 4
      },
      {
        "id": "pool_build_rough_plumbing_electrica",
        "name": "Rough Plumbing & Electrical",
        "startDate": "2025-01-30",
        "endDate": "2025-02-04",
        "durationDays": 6
      },
      {
        "id": "pool_build_inspections",
        "name": "Inspections",
        "startDate": "2025-02-05",
        "endDate": "2025-02-06",
        "durationDays": 2
      },
      {
        "id": "pool_build_gunite_shell",
        "name": "Gunite / Shell",
        "startDate": "2025-02-07",
        "endDate": "2025-02-11",
        "durationDays": 5
      },
      {
        "id": "pool_build_tile_coping",
        "name": "Tile & Coping",
        "startDate": "2025-02-12",
        "endDate": "2025-02-18",
        "durationDays": 7
      },
      {
        "id": "pool_build_decking",
        "name": "Decking",
        "startDate": "2025-02-19",
        "endDate": "2025-02-25",
        "durationDays": 7,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "pool_build_plaster_interior",
        "name": "Plaster / Interior",
        "startDate": "2025-02-26",
        "endDate": "2025-03-01",
        "durationDays": 4
      },
      {
        "id": "pool_build_equipment_set_startup",
        "name": "Equipment Set & Startup",
        "startDate": "2025-03-02",
        "endDate": "2025-03-06",
        "durationDays": 5
      },
      {
        "id": "pool_build_fence_safety",
        "name": "Fence / Safety",
        "startDate": "2025-03-07",
        "endDate": "2025-03-10",
        "durationDays": 4,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "pool_build_final_inspection_handove",
        "name": "Final Inspection & Handover",
        "startDate": "2025-03-11",
        "endDate": "2025-03-13",
        "durationDays": 3
      }
    ],
    "links": [
      {
        "id": "l_pool_build_design_permit_pool_build_select_finishes_tile_cop",
        "sourceId": "pool_build_design_permit",
        "targetId": "pool_build_select_finishes_tile_cop",
        "type": "FS"
      },
      {
        "id": "l_pool_build_select_finishes_tile_cop_pool_build_layout_excavation",
        "sourceId": "pool_build_select_finishes_tile_cop",
        "targetId": "pool_build_layout_excavation",
        "type": "FS"
      },
      {
        "id": "l_pool_build_layout_excavation_pool_build_steel_bond_beam",
        "sourceId": "pool_build_layout_excavation",
        "targetId": "pool_build_steel_bond_beam",
        "type": "FS"
      },
      {
        "id": "l_pool_build_steel_bond_beam_pool_build_rough_plumbing_electrica",
        "sourceId": "pool_build_steel_bond_beam",
        "targetId": "pool_build_rough_plumbing_electrica",
        "type": "FS"
      },
      {
        "id": "l_pool_build_rough_plumbing_electrica_pool_build_inspections",
        "sourceId": "pool_build_rough_plumbing_electrica",
        "targetId": "pool_build_inspections",
        "type": "FS"
      },
      {
        "id": "l_pool_build_inspections_pool_build_gunite_shell",
        "sourceId": "pool_build_inspections",
        "targetId": "pool_build_gunite_shell",
        "type": "FS"
      },
      {
        "id": "l_pool_build_gunite_shell_pool_build_tile_coping",
        "sourceId": "pool_build_gunite_shell",
        "targetId": "pool_build_tile_coping",
        "type": "FS"
      },
      {
        "id": "l_pool_build_tile_coping_pool_build_decking",
        "sourceId": "pool_build_tile_coping",
        "targetId": "pool_build_decking",
        "type": "FS"
      },
      {
        "id": "l_pool_build_decking_pool_build_plaster_interior",
        "sourceId": "pool_build_decking",
        "targetId": "pool_build_plaster_interior",
        "type": "FS"
      },
      {
        "id": "l_pool_build_plaster_interior_pool_build_equipment_set_startup",
        "sourceId": "pool_build_plaster_interior",
        "targetId": "pool_build_equipment_set_startup",
        "type": "FS"
      },
      {
        "id": "l_pool_build_equipment_set_startup_pool_build_fence_safety",
        "sourceId": "pool_build_equipment_set_startup",
        "targetId": "pool_build_fence_safety",
        "type": "FS"
      },
      {
        "id": "l_pool_build_fence_safety_pool_build_final_inspection_handove",
        "sourceId": "pool_build_fence_safety",
        "targetId": "pool_build_final_inspection_handove",
        "type": "FS"
      }
    ]
  },
  {
    "key": "house_remodel",
    "name": "House Remodel",
    "description": "Interior remodel / renovation. Edit in the Gantt editor.",
    "tasks": [
      {
        "id": "house_remodel_design_selections",
        "name": "Design & Selections",
        "startDate": "2025-01-06",
        "endDate": "2025-01-19",
        "durationDays": 14,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_permit",
        "name": "Permit",
        "startDate": "2025-01-20",
        "endDate": "2025-01-26",
        "durationDays": 7
      },
      {
        "id": "house_remodel_demo_reframe",
        "name": "Demo & Reframe",
        "startDate": "2025-01-27",
        "endDate": "2025-02-02",
        "durationDays": 7
      },
      {
        "id": "house_remodel_install_new_windows_door",
        "name": "Install New Windows & Doors",
        "startDate": "2025-02-03",
        "endDate": "2025-02-06",
        "durationDays": 4,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_rough_in_plumbing_elec_h",
        "name": "Rough-In: Plumbing/Elec/HVAC",
        "startDate": "2025-02-07",
        "endDate": "2025-02-16",
        "durationDays": 10
      },
      {
        "id": "house_remodel_inspections",
        "name": "Inspections",
        "startDate": "2025-02-17",
        "endDate": "2025-02-19",
        "durationDays": 3
      },
      {
        "id": "house_remodel_insulation",
        "name": "Insulation",
        "startDate": "2025-02-20",
        "endDate": "2025-02-22",
        "durationDays": 3
      },
      {
        "id": "house_remodel_drywall",
        "name": "Drywall",
        "startDate": "2025-02-23",
        "endDate": "2025-03-04",
        "durationDays": 10
      },
      {
        "id": "house_remodel_select_finishes",
        "name": "Select Finishes",
        "startDate": "2025-03-05",
        "endDate": "2025-03-05",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_cabinets",
        "name": "Cabinets",
        "startDate": "2025-03-06",
        "endDate": "2025-03-15",
        "durationDays": 10,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_countertops",
        "name": "Countertops",
        "startDate": "2025-03-16",
        "endDate": "2025-03-19",
        "durationDays": 4,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_trim_doors",
        "name": "Trim & Doors",
        "startDate": "2025-03-20",
        "endDate": "2025-03-29",
        "durationDays": 10
      },
      {
        "id": "house_remodel_paint",
        "name": "Paint",
        "startDate": "2025-03-30",
        "endDate": "2025-04-05",
        "durationDays": 7
      },
      {
        "id": "house_remodel_flooring",
        "name": "Flooring",
        "startDate": "2025-04-06",
        "endDate": "2025-04-13",
        "durationDays": 8,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_fixtures_appliances",
        "name": "Fixtures & Appliances",
        "startDate": "2025-04-14",
        "endDate": "2025-04-18",
        "durationDays": 5,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_final_clean_punch",
        "name": "Final Clean & Punch",
        "startDate": "2025-04-19",
        "endDate": "2025-04-23",
        "durationDays": 5
      }
    ],
    "links": [
      {
        "id": "l_house_remodel_design_selections_house_remodel_permit",
        "sourceId": "house_remodel_design_selections",
        "targetId": "house_remodel_permit",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_permit_house_remodel_demo_reframe",
        "sourceId": "house_remodel_permit",
        "targetId": "house_remodel_demo_reframe",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_demo_reframe_house_remodel_install_new_windows_door",
        "sourceId": "house_remodel_demo_reframe",
        "targetId": "house_remodel_install_new_windows_door",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_install_new_windows_door_house_remodel_rough_in_plumbing_elec_h",
        "sourceId": "house_remodel_install_new_windows_door",
        "targetId": "house_remodel_rough_in_plumbing_elec_h",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_rough_in_plumbing_elec_h_house_remodel_inspections",
        "sourceId": "house_remodel_rough_in_plumbing_elec_h",
        "targetId": "house_remodel_inspections",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_inspections_house_remodel_insulation",
        "sourceId": "house_remodel_inspections",
        "targetId": "house_remodel_insulation",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_insulation_house_remodel_drywall",
        "sourceId": "house_remodel_insulation",
        "targetId": "house_remodel_drywall",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_drywall_house_remodel_select_finishes",
        "sourceId": "house_remodel_drywall",
        "targetId": "house_remodel_select_finishes",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_select_finishes_house_remodel_cabinets",
        "sourceId": "house_remodel_select_finishes",
        "targetId": "house_remodel_cabinets",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_cabinets_house_remodel_countertops",
        "sourceId": "house_remodel_cabinets",
        "targetId": "house_remodel_countertops",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_countertops_house_remodel_trim_doors",
        "sourceId": "house_remodel_countertops",
        "targetId": "house_remodel_trim_doors",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_trim_doors_house_remodel_paint",
        "sourceId": "house_remodel_trim_doors",
        "targetId": "house_remodel_paint",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_paint_house_remodel_flooring",
        "sourceId": "house_remodel_paint",
        "targetId": "house_remodel_flooring",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_flooring_house_remodel_fixtures_appliances",
        "sourceId": "house_remodel_flooring",
        "targetId": "house_remodel_fixtures_appliances",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_fixtures_appliances_house_remodel_final_clean_punch",
        "sourceId": "house_remodel_fixtures_appliances",
        "targetId": "house_remodel_final_clean_punch",
        "type": "FS"
      }
    ]
  }
];
