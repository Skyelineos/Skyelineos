// AUTO-GENERATED starter schedule templates seeded into Firestore `scheduleTemplates`.
// House Build is built from Skyeline's 173-step process sheet (phase headers + step
// rows; decision/selection steps flagged via status 'pending_approval'). Basement,
// Pool and Remodel are starting skeletons to flesh out in the Gantt template editor.
// Durations are estimates — tune per project. The editor renders a flat task list
// with dependency links, so phases are header rows rather than nested children.
import type { Link } from '@/modules/gantt/types';

export interface StarterScheduleTask {
  id: string; name: string; startDate: string; endDate: string; durationDays?: number;
  status?: 'on_track' | 'delayed' | 'pending_approval';
  isPhase?: boolean; decision?: boolean; responsible?: string; vendors?: string;
}
export interface StarterScheduleTemplate {
  key: string; name: string; description: string; tasks: StarterScheduleTask[]; links: Link[];
}

export const STARTER_SCHEDULE_TEMPLATES: StarterScheduleTemplate[] = [
  {
    "key": "house_build",
    "name": "House Build",
    "description": "Full custom home build from Skyeline's process \u2014 173 steps across 7 phases (~12 months). Decision/selection steps are flagged. Durations are estimates; tune per project size.",
    "tasks": [
      {
        "id": "hb_phase_pre_construction",
        "name": "\u25a0 PRE-CONSTRUCTION",
        "startDate": "2025-01-06",
        "endDate": "2025-02-19",
        "durationDays": 45,
        "isPhase": true
      },
      {
        "id": "hb_1",
        "name": "Pre construction meeting with owner and contractor",
        "startDate": "2025-01-06",
        "endDate": "2025-01-08",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_2",
        "name": "Meet with architect",
        "startDate": "2025-01-09",
        "endDate": "2025-01-11",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_3",
        "name": "Architect does preliminary layout",
        "startDate": "2025-01-12",
        "endDate": "2025-01-14",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_4",
        "name": "Changes and adjustments to preliminary plans",
        "startDate": "2025-01-15",
        "endDate": "2025-01-17",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_5",
        "name": "Secure lot",
        "startDate": "2025-01-18",
        "endDate": "2025-01-20",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_6",
        "name": "Elevations added to plans",
        "startDate": "2025-01-21",
        "endDate": "2025-01-23",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_7",
        "name": "Site surveys and soils reports if applicable",
        "startDate": "2025-01-24",
        "endDate": "2025-01-26",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_8",
        "name": "Plans go to engineering",
        "startDate": "2025-01-27",
        "endDate": "2025-01-29",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_9",
        "name": "Final changes to plans",
        "startDate": "2025-01-30",
        "endDate": "2025-02-01",
        "durationDays": 3,
        "responsible": "Tyler"
      },
      {
        "id": "hb_10",
        "name": "Plans finalized and stamped",
        "startDate": "2025-02-02",
        "endDate": "2025-02-04",
        "durationDays": 3,
        "responsible": "Tyler",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_11",
        "name": "Apply for permit",
        "startDate": "2025-02-05",
        "endDate": "2025-02-07",
        "durationDays": 3,
        "responsible": "Office"
      },
      {
        "id": "hb_12",
        "name": "Set up SWPPP and make sure rain gutters are protected from debri throughout project",
        "startDate": "2025-02-08",
        "endDate": "2025-02-09",
        "durationDays": 2,
        "responsible": "Office/Super"
      },
      {
        "id": "hb_13",
        "name": "Set up for toilet and dumping services",
        "startDate": "2025-02-10",
        "endDate": "2025-02-11",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_14",
        "name": "Temp power set up",
        "startDate": "2025-02-12",
        "endDate": "2025-02-13",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_15",
        "name": "Prepare construction site",
        "startDate": "2025-02-14",
        "endDate": "2025-02-15",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_16",
        "name": "Set layout/backsets",
        "startDate": "2025-02-16",
        "endDate": "2025-02-17",
        "durationDays": 2,
        "responsible": "Surveyor"
      },
      {
        "id": "hb_17",
        "name": "Mark out for excavation",
        "startDate": "2025-02-18",
        "endDate": "2025-02-19",
        "durationDays": 2,
        "responsible": "Office",
        "vendors": "Dudley Engineering"
      },
      {
        "id": "hb_phase_foundation",
        "name": "\u25a0 FOUNDATION",
        "startDate": "2025-02-20",
        "endDate": "2025-03-31",
        "durationDays": 40,
        "isPhase": true
      },
      {
        "id": "hb_18",
        "name": "Excavation begins",
        "startDate": "2025-02-20",
        "endDate": "2025-02-21",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1.Cody Excavation"
      },
      {
        "id": "hb_19",
        "name": "Select Windows",
        "startDate": "2025-02-22",
        "endDate": "2025-02-23",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "1. Jones Paint and Glass",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_20",
        "name": "Select roof shingles/style and get ordered",
        "startDate": "2025-02-24",
        "endDate": "2025-02-25",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "1.LKL",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_21",
        "name": "Make selections for exterior doors, interior doors, and interior finish trim",
        "startDate": "2025-02-26",
        "endDate": "2025-02-27",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "Rocky Mountain Windows and Doors",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_22",
        "name": "Make plumbing selections",
        "startDate": "2025-02-28",
        "endDate": "2025-03-01",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "Peterson Plumbing",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_23",
        "name": "Select Fireplace",
        "startDate": "2025-03-02",
        "endDate": "2025-03-03",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "1. Hearth and Home",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_24",
        "name": "Select Mantel and Hearth (if applicabale)",
        "startDate": "2025-03-04",
        "endDate": "2025-03-05",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "Stone Mountain Casting & Design",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_25",
        "name": "Make electrical selections pertinent to rough in",
        "startDate": "2025-03-06",
        "endDate": "2025-03-07",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "Hansen Lighting",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_26",
        "name": "Make Selections for Exterior materials for the house (rock, brick, stucco, hardi plank, hardi shaker...etc)",
        "startDate": "2025-03-08",
        "endDate": "2025-03-09",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "1.LKL",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_27",
        "name": "Haul away soil if applicable",
        "startDate": "2025-03-10",
        "endDate": "2025-03-11",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "Scheduled by Excavator"
      },
      {
        "id": "hb_28",
        "name": "Prepare footing forms",
        "startDate": "2025-03-12",
        "endDate": "2025-03-13",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1.Jeff Dumas"
      },
      {
        "id": "hb_29",
        "name": "Footing form inspection",
        "startDate": "2025-03-14",
        "endDate": "2025-03-15",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_30",
        "name": "Pour footings",
        "startDate": "2025-03-16",
        "endDate": "2025-03-17",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1.Jeff Dumas"
      },
      {
        "id": "hb_31",
        "name": "Footings inspection",
        "startDate": "2025-03-18",
        "endDate": "2025-03-18",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_32",
        "name": "Prepare foundation wall forms",
        "startDate": "2025-03-19",
        "endDate": "2025-03-19",
        "durationDays": 1,
        "responsible": "Super",
        "vendors": "1.Jeff Dumas"
      },
      {
        "id": "hb_33",
        "name": "Foundation wall form inspection",
        "startDate": "2025-03-20",
        "endDate": "2025-03-20",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_34",
        "name": "Pour the foundation",
        "startDate": "2025-03-21",
        "endDate": "2025-03-21",
        "durationDays": 1,
        "responsible": "Super",
        "vendors": "1. Jeff Dumas"
      },
      {
        "id": "hb_35",
        "name": "Remove foundation forms",
        "startDate": "2025-03-22",
        "endDate": "2025-03-22",
        "durationDays": 1,
        "responsible": "Super",
        "vendors": "1. Jeff Dumas"
      },
      {
        "id": "hb_36",
        "name": "Underground Plumbing",
        "startDate": "2025-03-23",
        "endDate": "2025-03-23",
        "durationDays": 1,
        "responsible": "Super",
        "vendors": "1. Skyline Plumbing"
      },
      {
        "id": "hb_37",
        "name": "Knock off pins around exterior",
        "startDate": "2025-03-24",
        "endDate": "2025-03-24",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_38",
        "name": "Foundation waterproof seal",
        "startDate": "2025-03-25",
        "endDate": "2025-03-25",
        "durationDays": 1,
        "responsible": "Super",
        "vendors": "1. Pro Sandoval (Niagra Waterproofing)"
      },
      {
        "id": "hb_39",
        "name": "Foundation seal inspection",
        "startDate": "2025-03-26",
        "endDate": "2025-03-26",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_40",
        "name": "Install window Wells",
        "startDate": "2025-03-27",
        "endDate": "2025-03-27",
        "durationDays": 1,
        "responsible": "Super",
        "vendors": "Clyde Co"
      },
      {
        "id": "hb_41",
        "name": "Backfill site and initial grading",
        "startDate": "2025-03-28",
        "endDate": "2025-03-28",
        "durationDays": 1,
        "responsible": "Super",
        "vendors": "1. Cody Excavation"
      },
      {
        "id": "hb_42",
        "name": "Apply for new service line for gas to Dominion Energy",
        "startDate": "2025-03-29",
        "endDate": "2025-03-29",
        "durationDays": 1,
        "responsible": "Office"
      },
      {
        "id": "hb_43",
        "name": "Install Camera at site and make sure cellular chip is active",
        "startDate": "2025-03-30",
        "endDate": "2025-03-30",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_44",
        "name": "Make Garage Door Selections to Order in",
        "startDate": "2025-03-31",
        "endDate": "2025-03-31",
        "durationDays": 1,
        "responsible": "Owner/Tyler",
        "vendors": "White Cap",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_phase_framing",
        "name": "\u25a0 FRAMING",
        "startDate": "2025-04-01",
        "endDate": "2025-04-30",
        "durationDays": 30,
        "isPhase": true
      },
      {
        "id": "hb_45",
        "name": "Framing begins",
        "startDate": "2025-04-01",
        "endDate": "2025-04-03",
        "durationDays": 3,
        "responsible": "Super",
        "vendors": "1. Erasmo Crew"
      },
      {
        "id": "hb_46",
        "name": "Any preferences on hvac units/brands/special items",
        "startDate": "2025-04-04",
        "endDate": "2025-04-06",
        "durationDays": 3,
        "responsible": "Owner",
        "vendors": "1st Choice HVAC",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_47",
        "name": "Layout exterior walls and snap lines for square walls",
        "startDate": "2025-04-07",
        "endDate": "2025-04-09",
        "durationDays": 3,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_48",
        "name": "Lay bottom plate",
        "startDate": "2025-04-10",
        "endDate": "2025-04-12",
        "durationDays": 3,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_49",
        "name": "Rollout floor joists and subfloor",
        "startDate": "2025-04-13",
        "endDate": "2025-04-15",
        "durationDays": 3,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_50",
        "name": "Basement load bearing walls constructed",
        "startDate": "2025-04-16",
        "endDate": "2025-04-18",
        "durationDays": 3,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_51",
        "name": "Exterior walls main floor constructed",
        "startDate": "2025-04-19",
        "endDate": "2025-04-20",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_52",
        "name": "Interior walls constructed",
        "startDate": "2025-04-21",
        "endDate": "2025-04-22",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_53",
        "name": "Set Trusses",
        "startDate": "2025-04-23",
        "endDate": "2025-04-24",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_54",
        "name": "Sheet Roof",
        "startDate": "2025-04-25",
        "endDate": "2025-04-26",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1. Utah Framing Company"
      },
      {
        "id": "hb_55",
        "name": "Walkthrough with HVAC, electrical, and plumbing together to discuss layout and mechanical room layout and how to work around each other during rough in",
        "startDate": "2025-04-27",
        "endDate": "2025-04-28",
        "durationDays": 2,
        "responsible": "Super/Tyler",
        "vendors": "HVAC, Plumbing, Electrical/Client"
      },
      {
        "id": "hb_56",
        "name": "Finalize Selection for Stair railing and balaster",
        "startDate": "2025-04-29",
        "endDate": "2025-04-30",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "1.Burton Lumber https://www.rwspecialties.com/stair-parts",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_phase_rough_in",
        "name": "\u25a0 ROUGH-IN",
        "startDate": "2025-05-01",
        "endDate": "2025-06-24",
        "durationDays": 55,
        "isPhase": true
      },
      {
        "id": "hb_57",
        "name": "Dry In Roof",
        "startDate": "2025-05-01",
        "endDate": "2025-05-02",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1. My Roof"
      },
      {
        "id": "hb_58",
        "name": "Install Windows and Exterior Doors",
        "startDate": "2025-05-03",
        "endDate": "2025-05-04",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1. Rocky Mountain Windows and Doors"
      },
      {
        "id": "hb_59",
        "name": "HVAC, and plumbing rough in start",
        "startDate": "2025-05-05",
        "endDate": "2025-05-06",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "Awarded Trade"
      },
      {
        "id": "hb_60",
        "name": "Electrical",
        "startDate": "2025-05-07",
        "endDate": "2025-05-08",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "Skyridge Electrical"
      },
      {
        "id": "hb_61",
        "name": "AV/Low voltage install",
        "startDate": "2025-05-09",
        "endDate": "2025-05-10",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "Skyridge Electrical"
      },
      {
        "id": "hb_62",
        "name": "Get subfloor uneven seams/ high points sanded",
        "startDate": "2025-05-11",
        "endDate": "2025-05-12",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "Super"
      },
      {
        "id": "hb_63",
        "name": "Site walk exterior with owner, stone guys, siding/soffit/fascia to go over final selections on exterior material",
        "startDate": "2025-05-13",
        "endDate": "2025-05-14",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "1.Emco 2.Other Siding Company",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_64",
        "name": "Make selections for flooring and get ordered",
        "startDate": "2025-05-15",
        "endDate": "2025-05-16",
        "durationDays": 2,
        "responsible": "Owner",
        "vendors": "1.Mountain West Wholesale Flooring",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_65",
        "name": "Final changes to any major rough framing",
        "startDate": "2025-05-17",
        "endDate": "2025-05-18",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1.Utah Framing Company"
      },
      {
        "id": "hb_66",
        "name": "Roofers should be close to done or at least started",
        "startDate": "2025-05-19",
        "endDate": "2025-05-20",
        "durationDays": 2,
        "responsible": "Super",
        "vendors": "1.My Roof"
      },
      {
        "id": "hb_67",
        "name": "Begin Selecting Appliances (youll see below we have to finalize the range and hood combo at this time, the rest can be finalized later)",
        "startDate": "2025-05-21",
        "endDate": "2025-05-22",
        "durationDays": 2,
        "responsible": "Owner/Tyler",
        "vendors": "1. Cabinet Gallery",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_68",
        "name": "Need final selection for at least Vent hood appliance for vent sizing (6\u201d or 8\u201d)",
        "startDate": "2025-05-23",
        "endDate": "2025-05-24",
        "durationDays": 2,
        "responsible": "Owner/Super",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_69",
        "name": "Complete rough plumbing, electrical and HVAC",
        "startDate": "2025-05-25",
        "endDate": "2025-05-26",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_70",
        "name": "Install fireplace units",
        "startDate": "2025-05-27",
        "endDate": "2025-05-28",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_71",
        "name": "Any last minute changes to minor framing, plumbing, electrical and HVAC",
        "startDate": "2025-05-29",
        "endDate": "2025-05-30",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_72",
        "name": "Install Exterior Doors",
        "startDate": "2025-05-31",
        "endDate": "2025-06-01",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_73",
        "name": "Rough In site cleanup",
        "startDate": "2025-06-02",
        "endDate": "2025-06-03",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_74",
        "name": "Contractor walks through house prior to inspection",
        "startDate": "2025-06-04",
        "endDate": "2025-06-05",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_75",
        "name": "4 Way Inspection & permanent power inspection",
        "startDate": "2025-06-06",
        "endDate": "2025-06-07",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_76",
        "name": "Changes/corrections made from inspection if needed",
        "startDate": "2025-06-08",
        "endDate": "2025-06-09",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_77",
        "name": "Final 4 way inspection",
        "startDate": "2025-06-10",
        "endDate": "2025-06-11",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_78",
        "name": "Request for gas meter set-call dominion energy",
        "startDate": "2025-06-12",
        "endDate": "2025-06-13",
        "durationDays": 2,
        "responsible": "Office"
      },
      {
        "id": "hb_79",
        "name": "Check water meter well for debri or damage-make sure it has a functioning city meter cap",
        "startDate": "2025-06-14",
        "endDate": "2025-06-14",
        "durationDays": 1,
        "responsible": "Office"
      },
      {
        "id": "hb_80",
        "name": "Schedule for water meter set",
        "startDate": "2025-06-15",
        "endDate": "2025-06-15",
        "durationDays": 1,
        "responsible": "Office"
      },
      {
        "id": "hb_81",
        "name": "Permanent power set",
        "startDate": "2025-06-16",
        "endDate": "2025-06-16",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_82",
        "name": "Remove temp power stick",
        "startDate": "2025-06-17",
        "endDate": "2025-06-17",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_83",
        "name": "Any final changes to rough in",
        "startDate": "2025-06-18",
        "endDate": "2025-06-18",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_84",
        "name": "Drywall does site measure and takeoff",
        "startDate": "2025-06-19",
        "endDate": "2025-06-19",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_85",
        "name": "Add any backing marked by drywall guy",
        "startDate": "2025-06-20",
        "endDate": "2025-06-20",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_86",
        "name": "Begin Cabinet Design with Cabinet Company",
        "startDate": "2025-06-21",
        "endDate": "2025-06-21",
        "durationDays": 1,
        "responsible": "Owner/Tyler",
        "vendors": "1.Maple Landing Cabinetry",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_87",
        "name": "Make Tile Selections for bathrooms and tile flooring",
        "startDate": "2025-06-22",
        "endDate": "2025-06-22",
        "durationDays": 1,
        "responsible": "Owner/Tyler",
        "vendors": "1.Floor and Decor",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_88",
        "name": "Make final selections for Finish trim and order package",
        "startDate": "2025-06-23",
        "endDate": "2025-06-23",
        "durationDays": 1,
        "responsible": "Super",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_89",
        "name": "Finalize appliance selections",
        "startDate": "2025-06-24",
        "endDate": "2025-06-24",
        "durationDays": 1,
        "responsible": "Owner/Tyler",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_phase_pre_drywall",
        "name": "\u25a0 PRE-DRYWALL",
        "startDate": "2025-06-25",
        "endDate": "2025-07-09",
        "durationDays": 15,
        "isPhase": true
      },
      {
        "id": "hb_90",
        "name": "Install insulation",
        "startDate": "2025-06-25",
        "endDate": "2025-06-26",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_91",
        "name": "Insulation Inspection",
        "startDate": "2025-06-27",
        "endDate": "2025-06-28",
        "durationDays": 2,
        "responsible": "Syoer"
      },
      {
        "id": "hb_92",
        "name": "Stock site with drywall materials",
        "startDate": "2025-06-29",
        "endDate": "2025-06-30",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_93",
        "name": "Fire up the furnaces for drywall guys if during cold weather",
        "startDate": "2025-07-01",
        "endDate": "2025-07-02",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_94",
        "name": "Install drywall",
        "startDate": "2025-07-03",
        "endDate": "2025-07-04",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_95",
        "name": "Drywall screw inspection",
        "startDate": "2025-07-05",
        "endDate": "2025-07-05",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_96",
        "name": "Contractor walks job to see if there are potential issues with any drywall items (windows line up, long runs are straight not bowed out)",
        "startDate": "2025-07-06",
        "endDate": "2025-07-06",
        "durationDays": 1,
        "responsible": "Super/Tyler"
      },
      {
        "id": "hb_97",
        "name": "Drywall tape and mud and texture",
        "startDate": "2025-07-07",
        "endDate": "2025-07-07",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_98",
        "name": "Walkthrough with home owner",
        "startDate": "2025-07-08",
        "endDate": "2025-07-08",
        "durationDays": 1,
        "responsible": "Tyler"
      },
      {
        "id": "hb_99",
        "name": "Any fixes to drywall",
        "startDate": "2025-07-09",
        "endDate": "2025-07-09",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_phase_finish",
        "name": "\u25a0 FINISH",
        "startDate": "2025-07-10",
        "endDate": "2025-12-06",
        "durationDays": 150,
        "isPhase": true
      },
      {
        "id": "hb_100",
        "name": "Begin tile work interior",
        "startDate": "2025-07-10",
        "endDate": "2025-07-13",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_101",
        "name": "House wrap",
        "startDate": "2025-07-14",
        "endDate": "2025-07-17",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_102",
        "name": "Vapor barrier inspection",
        "startDate": "2025-07-18",
        "endDate": "2025-07-21",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_103",
        "name": "Stock site with exterior materials",
        "startDate": "2025-07-22",
        "endDate": "2025-07-25",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_104",
        "name": "Exterior should have started or be starting",
        "startDate": "2025-07-26",
        "endDate": "2025-07-29",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_105",
        "name": "Lathe inspection",
        "startDate": "2025-07-30",
        "endDate": "2025-08-02",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_106",
        "name": "Walk through with finish carpenter, home owner and builder",
        "startDate": "2025-08-03",
        "endDate": "2025-08-06",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_107",
        "name": "Finalize speciality interior trim design/selections",
        "startDate": "2025-08-07",
        "endDate": "2025-08-10",
        "durationDays": 4,
        "responsible": "Super",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_108",
        "name": "Stock house with interior finish materials",
        "startDate": "2025-08-11",
        "endDate": "2025-08-14",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_109",
        "name": "Deliver flooring materials for tile work",
        "startDate": "2025-08-15",
        "endDate": "2025-08-18",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_110",
        "name": "Start interior finish work",
        "startDate": "2025-08-19",
        "endDate": "2025-08-22",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_111",
        "name": "Exterior should be well on its way at this point",
        "startDate": "2025-08-23",
        "endDate": "2025-08-26",
        "durationDays": 4,
        "responsible": "Super"
      },
      {
        "id": "hb_112",
        "name": "Make any final changes to cabinet layout",
        "startDate": "2025-08-27",
        "endDate": "2025-08-29",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_113",
        "name": "Make final selections for Interior paint colors and/or wallpaper",
        "startDate": "2025-08-30",
        "endDate": "2025-09-01",
        "durationDays": 3,
        "responsible": "Super",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_114",
        "name": "Complete finish carpentry",
        "startDate": "2025-09-02",
        "endDate": "2025-09-04",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_115",
        "name": "Complete all tile work",
        "startDate": "2025-09-05",
        "endDate": "2025-09-07",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_116",
        "name": "Template/measure for any shower glass",
        "startDate": "2025-09-08",
        "endDate": "2025-09-10",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_117",
        "name": "Get any extra materials returned",
        "startDate": "2025-09-11",
        "endDate": "2025-09-13",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_118",
        "name": "Begin Paint prep",
        "startDate": "2025-09-14",
        "endDate": "2025-09-16",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_119",
        "name": "Painting interior",
        "startDate": "2025-09-17",
        "endDate": "2025-09-19",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_120",
        "name": "Set forms driveways/walkways/patios/AC pads",
        "startDate": "2025-09-20",
        "endDate": "2025-09-22",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_121",
        "name": "Pour driveways/walkways/patios/AC pads",
        "startDate": "2025-09-23",
        "endDate": "2025-09-25",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_122",
        "name": "Garage doors should be installed",
        "startDate": "2025-09-26",
        "endDate": "2025-09-28",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_123",
        "name": "Make sure to place garage door openers and pad in a safe place",
        "startDate": "2025-09-29",
        "endDate": "2025-10-01",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_124",
        "name": "Depending on where soffit is at, when it\u2019s complete get attic insulation blown in",
        "startDate": "2025-10-02",
        "endDate": "2025-10-04",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_125",
        "name": "Make final selection for countertops",
        "startDate": "2025-10-05",
        "endDate": "2025-10-07",
        "durationDays": 3,
        "responsible": "Super",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_126",
        "name": "Make final selections for hardware",
        "startDate": "2025-10-08",
        "endDate": "2025-10-10",
        "durationDays": 3,
        "responsible": "Super",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_127",
        "name": "Paint complete",
        "startDate": "2025-10-11",
        "endDate": "2025-10-13",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_128",
        "name": "Electrical Finish can start",
        "startDate": "2025-10-14",
        "endDate": "2025-10-16",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_129",
        "name": "Install hard-surface flooring",
        "startDate": "2025-10-17",
        "endDate": "2025-10-19",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_130",
        "name": "Clean start up on any fireplaces",
        "startDate": "2025-10-20",
        "endDate": "2025-10-22",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_131",
        "name": "Set ACs, water heaters, water softeners",
        "startDate": "2025-10-23",
        "endDate": "2025-10-25",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_132",
        "name": "Cabinets complete at least base installation",
        "startDate": "2025-10-26",
        "endDate": "2025-10-28",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_133",
        "name": "Countertop template",
        "startDate": "2025-10-29",
        "endDate": "2025-10-31",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_134",
        "name": "Set backbase, install balusters, fix any Finish carpenters items",
        "startDate": "2025-11-01",
        "endDate": "2025-11-03",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_135",
        "name": "Electrical Finish should be going",
        "startDate": "2025-11-04",
        "endDate": "2025-11-06",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_136",
        "name": "Countertop Installation",
        "startDate": "2025-11-07",
        "endDate": "2025-11-09",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_137",
        "name": "Plumbing finish trim begins",
        "startDate": "2025-11-10",
        "endDate": "2025-11-12",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_138",
        "name": "Electrical wraps up and should have all power on and breakers in for AC units and appliances",
        "startDate": "2025-11-13",
        "endDate": "2025-11-15",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_139",
        "name": "Appliance Installation",
        "startDate": "2025-11-16",
        "endDate": "2025-11-18",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_140",
        "name": "Test all appliances and gas units interior and exterior",
        "startDate": "2025-11-19",
        "endDate": "2025-11-21",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_141",
        "name": "Exterior grading and site cleanup",
        "startDate": "2025-11-22",
        "endDate": "2025-11-24",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_142",
        "name": "Begin Finish HVAC trims",
        "startDate": "2025-11-25",
        "endDate": "2025-11-27",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_143",
        "name": "Get subfloor vacuumed and prepped for carpet",
        "startDate": "2025-11-28",
        "endDate": "2025-11-30",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_144",
        "name": "Carpet installation",
        "startDate": "2025-12-01",
        "endDate": "2025-12-03",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_145",
        "name": "Install mirrors, shower doors, hardware, etc",
        "startDate": "2025-12-04",
        "endDate": "2025-12-06",
        "durationDays": 3,
        "responsible": "Super"
      },
      {
        "id": "hb_phase_closeout",
        "name": "\u25a0 CLOSEOUT",
        "startDate": "2025-12-07",
        "endDate": "2026-01-05",
        "durationDays": 30,
        "isPhase": true
      },
      {
        "id": "hb_146",
        "name": "Get blower door test",
        "startDate": "2025-12-07",
        "endDate": "2025-12-08",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_147",
        "name": "Post blower door test inside of electrical panel and check for insulation sticker on panel door or furnace",
        "startDate": "2025-12-09",
        "endDate": "2025-12-10",
        "durationDays": 2,
        "responsible": "Super"
      },
      {
        "id": "hb_148",
        "name": "Cabinet Company wrap up handles, knobs and touch ups",
        "startDate": "2025-12-11",
        "endDate": "2025-12-11",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_149",
        "name": "Get exterior windows cleaned",
        "startDate": "2025-12-12",
        "endDate": "2025-12-12",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_150",
        "name": "Make any final returns",
        "startDate": "2025-12-13",
        "endDate": "2025-12-13",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_151",
        "name": "Place extra spare material in cold storage or as directed by owner",
        "startDate": "2025-12-14",
        "endDate": "2025-12-14",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_152",
        "name": "Clean up, power wash all exterior surfaces and garage floors",
        "startDate": "2025-12-15",
        "endDate": "2025-12-15",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_153",
        "name": "If applicable do epoxy for garage floors",
        "startDate": "2025-12-16",
        "endDate": "2025-12-16",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_154",
        "name": "Have toilet and dumpster removed",
        "startDate": "2025-12-17",
        "endDate": "2025-12-17",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_155",
        "name": "All gutters extended 10\u2019 from house",
        "startDate": "2025-12-18",
        "endDate": "2025-12-18",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_156",
        "name": "Street gutters and site cleared of debri",
        "startDate": "2025-12-19",
        "endDate": "2025-12-19",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_157",
        "name": "Attic access door in garage secured with latches",
        "startDate": "2025-12-20",
        "endDate": "2025-12-20",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_158",
        "name": "Make sure address house numbers posted clearly",
        "startDate": "2025-12-21",
        "endDate": "2025-12-21",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_159",
        "name": "Interior cleaning",
        "startDate": "2025-12-22",
        "endDate": "2025-12-22",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_160",
        "name": "Final Inspection",
        "startDate": "2025-12-23",
        "endDate": "2025-12-23",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_161",
        "name": "Final inspection corrections made",
        "startDate": "2025-12-24",
        "endDate": "2025-12-24",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_162",
        "name": "Re Inspect if applicable",
        "startDate": "2025-12-25",
        "endDate": "2025-12-25",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_163",
        "name": "Certificate of Occupancy released from city",
        "startDate": "2025-12-26",
        "endDate": "2025-12-26",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_164",
        "name": "Final site cleanup",
        "startDate": "2025-12-27",
        "endDate": "2025-12-27",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_165",
        "name": "Touchups to the interior cleaning if needed",
        "startDate": "2025-12-28",
        "endDate": "2025-12-28",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_166",
        "name": "Final walkthrough with the owner",
        "startDate": "2025-12-29",
        "endDate": "2025-12-29",
        "durationDays": 1,
        "responsible": "Tyler/Super/Owner"
      },
      {
        "id": "hb_167",
        "name": "Final punch list made",
        "startDate": "2025-12-30",
        "endDate": "2025-12-30",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_168",
        "name": "Adjustments to final Invoices",
        "startDate": "2025-12-31",
        "endDate": "2025-12-31",
        "durationDays": 1,
        "responsible": "Tyler/Office"
      },
      {
        "id": "hb_169",
        "name": "Final draw is collected and/or agreement is determined and signed for move in",
        "startDate": "2026-01-01",
        "endDate": "2026-01-01",
        "durationDays": 1,
        "responsible": "Office"
      },
      {
        "id": "hb_170",
        "name": "Owner closes on house",
        "startDate": "2026-01-02",
        "endDate": "2026-01-02",
        "durationDays": 1,
        "responsible": "Owner",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_171",
        "name": "Move in",
        "startDate": "2026-01-03",
        "endDate": "2026-01-03",
        "durationDays": 1,
        "responsible": "Owner",
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "hb_172",
        "name": "Complete punch list as agreed",
        "startDate": "2026-01-04",
        "endDate": "2026-01-04",
        "durationDays": 1,
        "responsible": "Super"
      },
      {
        "id": "hb_173",
        "name": "1 year warranty",
        "startDate": "2026-01-05",
        "endDate": "2026-01-05",
        "durationDays": 1,
        "responsible": "Tyler"
      }
    ],
    "links": [
      {
        "id": "l_hb_phase_pre_construction_hb_phase_foundation",
        "sourceId": "hb_phase_pre_construction",
        "targetId": "hb_phase_foundation",
        "type": "FS"
      },
      {
        "id": "l_hb_phase_foundation_hb_phase_framing",
        "sourceId": "hb_phase_foundation",
        "targetId": "hb_phase_framing",
        "type": "FS"
      },
      {
        "id": "l_hb_phase_framing_hb_phase_rough_in",
        "sourceId": "hb_phase_framing",
        "targetId": "hb_phase_rough_in",
        "type": "FS"
      },
      {
        "id": "l_hb_phase_rough_in_hb_phase_pre_drywall",
        "sourceId": "hb_phase_rough_in",
        "targetId": "hb_phase_pre_drywall",
        "type": "FS"
      },
      {
        "id": "l_hb_phase_pre_drywall_hb_phase_finish",
        "sourceId": "hb_phase_pre_drywall",
        "targetId": "hb_phase_finish",
        "type": "FS"
      },
      {
        "id": "l_hb_phase_finish_hb_phase_closeout",
        "sourceId": "hb_phase_finish",
        "targetId": "hb_phase_closeout",
        "type": "FS"
      }
    ]
  },
  {
    "key": "basement_finish",
    "name": "Basement Finishing",
    "description": "Finishing an unfinished basement. Edit/expand in the Gantt editor.",
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
        "id": "basement_finish_select_finishes_floor_paint_trim",
        "name": "Select Finishes (floor/paint/trim)",
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
        "id": "l_basement_finish_insulation_basement_finish_select_finishes_floor_paint_trim",
        "sourceId": "basement_finish_insulation",
        "targetId": "basement_finish_select_finishes_floor_paint_trim",
        "type": "FS"
      },
      {
        "id": "l_basement_finish_select_finishes_floor_paint_trim_basement_finish_drywall",
        "sourceId": "basement_finish_select_finishes_floor_paint_trim",
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
    "description": "In-ground pool construction. Edit/expand in the Gantt editor.",
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
        "id": "pool_build_select_finishes_tile_coping_plaster",
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
        "id": "pool_build_rough_plumbing_electrical",
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
        "id": "pool_build_plaster_interior_finish",
        "name": "Plaster / Interior Finish",
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
        "id": "pool_build_final_inspection_handover",
        "name": "Final Inspection & Handover",
        "startDate": "2025-03-11",
        "endDate": "2025-03-13",
        "durationDays": 3
      }
    ],
    "links": [
      {
        "id": "l_pool_build_design_permit_pool_build_select_finishes_tile_coping_plaster",
        "sourceId": "pool_build_design_permit",
        "targetId": "pool_build_select_finishes_tile_coping_plaster",
        "type": "FS"
      },
      {
        "id": "l_pool_build_select_finishes_tile_coping_plaster_pool_build_layout_excavation",
        "sourceId": "pool_build_select_finishes_tile_coping_plaster",
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
        "id": "l_pool_build_steel_bond_beam_pool_build_rough_plumbing_electrical",
        "sourceId": "pool_build_steel_bond_beam",
        "targetId": "pool_build_rough_plumbing_electrical",
        "type": "FS"
      },
      {
        "id": "l_pool_build_rough_plumbing_electrical_pool_build_inspections",
        "sourceId": "pool_build_rough_plumbing_electrical",
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
        "id": "l_pool_build_decking_pool_build_plaster_interior_finish",
        "sourceId": "pool_build_decking",
        "targetId": "pool_build_plaster_interior_finish",
        "type": "FS"
      },
      {
        "id": "l_pool_build_plaster_interior_finish_pool_build_equipment_set_startup",
        "sourceId": "pool_build_plaster_interior_finish",
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
        "id": "l_pool_build_fence_safety_pool_build_final_inspection_handover",
        "sourceId": "pool_build_fence_safety",
        "targetId": "pool_build_final_inspection_handover",
        "type": "FS"
      }
    ]
  },
  {
    "key": "house_remodel",
    "name": "House Remodel",
    "description": "Interior remodel / renovation. Edit/expand in the Gantt editor.",
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
        "id": "house_remodel_demo",
        "name": "Demo",
        "startDate": "2025-01-27",
        "endDate": "2025-02-02",
        "durationDays": 7
      },
      {
        "id": "house_remodel_framing_changes",
        "name": "Framing Changes",
        "startDate": "2025-02-03",
        "endDate": "2025-02-09",
        "durationDays": 7
      },
      {
        "id": "house_remodel_rough_in_plumbing_elec_hvac",
        "name": "Rough-In: Plumbing/Elec/HVAC",
        "startDate": "2025-02-10",
        "endDate": "2025-02-19",
        "durationDays": 10
      },
      {
        "id": "house_remodel_inspections",
        "name": "Inspections",
        "startDate": "2025-02-20",
        "endDate": "2025-02-22",
        "durationDays": 3
      },
      {
        "id": "house_remodel_insulation",
        "name": "Insulation",
        "startDate": "2025-02-23",
        "endDate": "2025-02-25",
        "durationDays": 3
      },
      {
        "id": "house_remodel_drywall",
        "name": "Drywall",
        "startDate": "2025-02-26",
        "endDate": "2025-03-07",
        "durationDays": 10
      },
      {
        "id": "house_remodel_select_finishes",
        "name": "Select Finishes",
        "startDate": "2025-03-08",
        "endDate": "2025-03-08",
        "durationDays": 1,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_cabinets",
        "name": "Cabinets",
        "startDate": "2025-03-09",
        "endDate": "2025-03-18",
        "durationDays": 10,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_countertops",
        "name": "Countertops",
        "startDate": "2025-03-19",
        "endDate": "2025-03-22",
        "durationDays": 4,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_trim_doors",
        "name": "Trim & Doors",
        "startDate": "2025-03-23",
        "endDate": "2025-04-01",
        "durationDays": 10
      },
      {
        "id": "house_remodel_paint",
        "name": "Paint",
        "startDate": "2025-04-02",
        "endDate": "2025-04-08",
        "durationDays": 7
      },
      {
        "id": "house_remodel_flooring",
        "name": "Flooring",
        "startDate": "2025-04-09",
        "endDate": "2025-04-16",
        "durationDays": 8,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_fixtures_appliances",
        "name": "Fixtures & Appliances",
        "startDate": "2025-04-17",
        "endDate": "2025-04-21",
        "durationDays": 5,
        "status": "pending_approval",
        "decision": true
      },
      {
        "id": "house_remodel_final_clean_punch",
        "name": "Final Clean & Punch",
        "startDate": "2025-04-22",
        "endDate": "2025-04-26",
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
        "id": "l_house_remodel_permit_house_remodel_demo",
        "sourceId": "house_remodel_permit",
        "targetId": "house_remodel_demo",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_demo_house_remodel_framing_changes",
        "sourceId": "house_remodel_demo",
        "targetId": "house_remodel_framing_changes",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_framing_changes_house_remodel_rough_in_plumbing_elec_hvac",
        "sourceId": "house_remodel_framing_changes",
        "targetId": "house_remodel_rough_in_plumbing_elec_hvac",
        "type": "FS"
      },
      {
        "id": "l_house_remodel_rough_in_plumbing_elec_hvac_house_remodel_inspections",
        "sourceId": "house_remodel_rough_in_plumbing_elec_hvac",
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
