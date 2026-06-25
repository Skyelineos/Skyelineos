// Construction Phase Catalog
//
// The canonical list of construction phases and the default tasks under each
// phase that Skyeline runs through on every custom build / spec home. This
// catalog is the source of truth that the project task engine uses to spin
// up a new project's task list (see projectTaskEngine.ts).
//
// Phases mirror how Tyler walks a job: Site Prep → Foundation → Framing →
// the three roughs (plumbing/electrical/HVAC) → Framing Inspection →
// Insulation → Drywall → Paint → Cabinets → Flooring → Trim → the three
// finishes → Doors/Hardware → Exterior → Landscaping → Punch List → Final
// → Close. Spec homes share the same flow but skip a few client-selection
// gates (see projectTaskEngine.ts for the SPEC adjustments).
//
// Materials are tracked at the category level (lumber package, concrete,
// TPO roofing, mini splits, Hardi siding, …) rather than down to specific
// SKUs — those live in the bid/estimate side of the system. Each material
// row carries the trade type that supplies it so the materials tracker can
// pick the right vendor from sms_contacts when Tyler is ready to order.

// ── Phase + trade enums ──────────────────────────────────────────────────────
// Phases are ordered (the index here drives the recommended sequence on the
// project task list — see generateProjectTaskList).
export const CONSTRUCTION_PHASES = [
  'SITE_PREP',
  'FOUNDATION',
  'FRAMING',
  'ROUGH_PLUMBING',
  'ROUGH_ELECTRICAL',
  'ROUGH_HVAC',
  'FRAMING_INSPECTION',
  'INSULATION',
  'DRYWALL',
  'PAINT',
  'CABINETS',
  'FLOORING',
  'TRIM',
  'FINISH_PLUMBING',
  'FINISH_ELECTRICAL',
  'FINISH_HVAC',
  'DOORS_HARDWARE',
  'EXTERIOR',
  'LANDSCAPING',
  'PUNCH_LIST',
  'FINAL_INSPECTION',
  'CLOSE',
] as const;
export type ConstructionPhase = typeof CONSTRUCTION_PHASES[number];

// Trade types — kept in sync with how sub contacts are tagged in sms_contacts
// (see sms/types.ts: SmsContact.trade is a free-form string but the SUB
// contact records use these canonical values, matching contacts-extracted.json).
export const TRADE_TYPES = [
  'FRAMER',
  'CONCRETE',
  'PLUMBER',
  'ELECTRICIAN',
  'HVAC',
  'ROOFING',
  'STUCCO_SIDING',
  'INSULATION',
  'DRYWALLER',
  'PAINTER',
  'CABINET',
  'TILE',
  'FLOORING',
  'DOOR_WINDOW',
  'LANDSCAPING',
  'INSPECTOR',
  'INTERNAL',     // Skyeline staff (Chris, Easton, Brandon, Nicole)
  'GC',           // Tyler / general contractor work
  'VENDOR',       // material supplier (lumber yard, appliance, etc.)
] as const;
export type TradeType = typeof TRADE_TYPES[number];

// ── Material category shape ──────────────────────────────────────────────────
// Order-lead-time is what the materials tracker uses to back-schedule the
// "order by" date from the task start. Tyler's parade-home crunches taught
// us not to assume one-week lead times for anything — TPO and custom doors
// in particular have bitten us before.
export interface MaterialCategory {
  category: string;             // 'lumber', 'concrete', 'roofing', 'tile', …
  description: string;          // human-readable order description
  orderLeadTimeDays: number;    // schedule the order this many days ahead of task start
  vendorTradeType: TradeType;   // which trade type supplies it (drives vendor lookup)
}

// ── Phase task shape ─────────────────────────────────────────────────────────
// A row in the catalog. When a new project is created, generateProjectTaskList
// copies each row into project_tasks/{id} with the project + start-date applied.
export interface PhaseTask {
  id: string;                   // catalog id, e.g. 'framing.walls'
  name: string;                 // human label, e.g. 'Frame exterior walls'
  phase: ConstructionPhase;
  trade: TradeType;             // primary trade responsible
  typicalDays: number;          // typical duration (calendar days)
  dependsOn: string[];          // catalog ids that must be done first
  materials: MaterialCategory[]; // material orders this task triggers
  checklistItems: string[];     // QA / inspection items Tyler walks at completion
  // Some tasks (Holmes test, blower door, parade prep) only apply to certain
  // project types. The task engine filters on this when generating the list.
  specOnly?: boolean;           // skip on CUSTOM
  customOnly?: boolean;         // skip on SPEC
}

// ── The catalog ──────────────────────────────────────────────────────────────
// Ordered roughly by phase + intra-phase dependency. 60+ tasks across the full
// build flow. Edit with care — projectTaskEngine.ts references task ids by
// string from dependsOn arrays.

export const PHASE_CATALOG: PhaseTask[] = [
  // ────────────────── SITE PREP ──────────────────
  {
    id: 'siteprep.permits',
    name: 'Pull building permits',
    phase: 'SITE_PREP',
    trade: 'GC',
    typicalDays: 14,
    dependsOn: [],
    materials: [],
    checklistItems: [
      'Plans stamped and approved',
      'Permit posted at jobsite',
      'Inspection card on site',
    ],
  },
  {
    id: 'siteprep.utilities',
    name: 'Mark utilities (Blue Stakes)',
    phase: 'SITE_PREP',
    trade: 'GC',
    typicalDays: 3,
    dependsOn: ['siteprep.permits'],
    materials: [],
    checklistItems: ['Blue Stakes ticket on file', 'Markings visible on site'],
  },
  {
    id: 'siteprep.clear',
    name: 'Clear and grub site',
    phase: 'SITE_PREP',
    trade: 'LANDSCAPING',
    typicalDays: 2,
    dependsOn: ['siteprep.utilities'],
    materials: [],
    checklistItems: ['Trees/brush cleared', 'Topsoil stockpiled', 'Dumpster on site'],
  },
  {
    id: 'siteprep.excavation',
    name: 'Excavate foundation',
    phase: 'SITE_PREP',
    trade: 'CONCRETE',
    typicalDays: 3,
    dependsOn: ['siteprep.clear'],
    materials: [],
    checklistItems: [
      'Hole to plan depth',
      'Footings squared and level',
      'Spoils piled away from hole',
    ],
  },
  {
    id: 'siteprep.temppower',
    name: 'Install temp power pole',
    phase: 'SITE_PREP',
    trade: 'ELECTRICIAN',
    typicalDays: 2,
    dependsOn: ['siteprep.utilities'],
    materials: [
      {
        category: 'temp_power',
        description: 'Temp power pole + meter base',
        orderLeadTimeDays: 7,
        vendorTradeType: 'ELECTRICIAN',
      },
    ],
    checklistItems: ['Temp pole set', 'Power live', 'GFI outlets working'],
  },

  // ────────────────── FOUNDATION ──────────────────
  {
    id: 'foundation.footings',
    name: 'Form and pour footings',
    phase: 'FOUNDATION',
    trade: 'CONCRETE',
    typicalDays: 3,
    dependsOn: ['siteprep.excavation'],
    materials: [
      {
        category: 'concrete',
        description: 'Footing concrete (3000-3500 psi) + rebar',
        orderLeadTimeDays: 3,
        vendorTradeType: 'CONCRETE',
      },
    ],
    checklistItems: ['Footings level', 'Rebar tied per plan', 'Inspection passed'],
  },
  {
    id: 'foundation.walls',
    name: 'Form and pour foundation walls',
    phase: 'FOUNDATION',
    trade: 'CONCRETE',
    typicalDays: 5,
    dependsOn: ['foundation.footings'],
    materials: [
      {
        category: 'concrete',
        description: 'Wall concrete + wall rebar package',
        orderLeadTimeDays: 3,
        vendorTradeType: 'CONCRETE',
      },
      {
        category: 'foundation_hardware',
        description: 'Anchor bolts, hold-downs, sill seal',
        orderLeadTimeDays: 5,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: [
      'Walls plumb and straight',
      'Anchor bolts set per plan',
      'No honeycombing on strip',
    ],
  },
  {
    id: 'foundation.waterproof',
    name: 'Waterproof foundation walls',
    phase: 'FOUNDATION',
    trade: 'CONCRETE',
    typicalDays: 2,
    dependsOn: ['foundation.walls'],
    materials: [
      {
        category: 'waterproofing',
        description: 'Foundation waterproofing membrane + drain board',
        orderLeadTimeDays: 5,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: ['Full coverage to grade', 'No skips at corners', 'Drain board installed'],
  },
  {
    id: 'foundation.drainage',
    name: 'Install foundation drainage',
    phase: 'FOUNDATION',
    trade: 'PLUMBER',
    typicalDays: 2,
    dependsOn: ['foundation.waterproof'],
    materials: [
      {
        category: 'drainage',
        description: 'Perforated drain pipe + gravel + fabric',
        orderLeadTimeDays: 5,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: ['Pipe sloped to daylight/sump', 'Wrapped in fabric', 'Gravel placed'],
  },
  {
    id: 'foundation.backfill',
    name: 'Backfill and compact',
    phase: 'FOUNDATION',
    trade: 'CONCRETE',
    typicalDays: 2,
    dependsOn: ['foundation.drainage'],
    materials: [],
    checklistItems: ['Compacted in lifts', 'No damage to waterproofing', 'Grade rough-shaped'],
  },
  {
    id: 'foundation.underslabplumbing',
    name: 'Underslab plumbing rough',
    phase: 'FOUNDATION',
    trade: 'PLUMBER',
    typicalDays: 3,
    dependsOn: ['foundation.backfill'],
    materials: [
      {
        category: 'plumbing_rough',
        description: 'ABS/PVC drain, vent stubs, cleanouts',
        orderLeadTimeDays: 5,
        vendorTradeType: 'PLUMBER',
      },
    ],
    checklistItems: ['Lines per plan', 'Slopes correct', 'Pressure test passed'],
  },
  {
    id: 'foundation.slab',
    name: 'Pour basement/garage slab',
    phase: 'FOUNDATION',
    trade: 'CONCRETE',
    typicalDays: 3,
    dependsOn: ['foundation.underslabplumbing'],
    materials: [
      {
        category: 'concrete',
        description: 'Slab concrete + vapor barrier + wire mesh',
        orderLeadTimeDays: 3,
        vendorTradeType: 'CONCRETE',
      },
    ],
    checklistItems: ['Slab level and flat', 'Control joints cut', 'No surface cracking'],
  },

  // ────────────────── FRAMING ──────────────────
  {
    id: 'framing.deliver',
    name: 'Lumber package delivered',
    phase: 'FRAMING',
    trade: 'VENDOR',
    typicalDays: 1,
    dependsOn: ['foundation.slab'],
    materials: [
      {
        category: 'lumber',
        description: 'Framing lumber package (2x4, 2x6, LVL beams, joists, sheathing)',
        orderLeadTimeDays: 14,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: [
      'Package complete per bid',
      'LVL count matches plan',
      'No damaged material',
      'Stacked off ground',
    ],
  },
  {
    id: 'framing.firstfloor',
    name: 'Frame first floor walls',
    phase: 'FRAMING',
    trade: 'FRAMER',
    typicalDays: 5,
    dependsOn: ['framing.deliver'],
    materials: [],
    checklistItems: [
      'Walls plumb and square',
      'Studs 16" oc per plan',
      'Headers per schedule',
      'Sheathing nailed off',
    ],
  },
  {
    id: 'framing.floorsystem',
    name: 'Install floor system + subfloor',
    phase: 'FRAMING',
    trade: 'FRAMER',
    typicalDays: 3,
    dependsOn: ['framing.firstfloor'],
    materials: [
      {
        category: 'subfloor',
        description: 'I-joists or TJI, rim board, subfloor glue + Advantech sheathing',
        orderLeadTimeDays: 10,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: ['Joists per plan', 'Glue + ringshank nails', 'Subfloor squeak-free'],
  },
  {
    id: 'framing.secondfloor',
    name: 'Frame second floor walls',
    phase: 'FRAMING',
    trade: 'FRAMER',
    typicalDays: 5,
    dependsOn: ['framing.floorsystem'],
    materials: [],
    checklistItems: ['Walls plumb', 'Headers per plan', 'Sheathing nailed off'],
  },
  {
    id: 'framing.trusses',
    name: 'Set roof trusses',
    phase: 'FRAMING',
    trade: 'FRAMER',
    typicalDays: 3,
    dependsOn: ['framing.secondfloor'],
    materials: [
      {
        category: 'trusses',
        description: 'Engineered roof truss package',
        orderLeadTimeDays: 21,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: ['Trusses braced per spec', 'Hurricane ties at each bearing', 'Layout per plan'],
  },
  {
    id: 'framing.sheathing',
    name: 'Roof sheathing + dry-in',
    phase: 'FRAMING',
    trade: 'FRAMER',
    typicalDays: 3,
    dependsOn: ['framing.trusses'],
    materials: [
      {
        category: 'roof_sheathing',
        description: 'Roof sheathing + synthetic underlayment + ice & water shield',
        orderLeadTimeDays: 10,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: ['Sheathing nailed off', 'Underlayment tight', 'House is dry'],
  },
  {
    id: 'framing.windows',
    name: 'Install windows + exterior doors',
    phase: 'FRAMING',
    trade: 'DOOR_WINDOW',
    typicalDays: 3,
    dependsOn: ['framing.sheathing'],
    materials: [
      {
        category: 'windows',
        description: 'Windows + exterior doors (per schedule)',
        orderLeadTimeDays: 35,
        vendorTradeType: 'DOOR_WINDOW',
      },
    ],
    checklistItems: [
      'Windows plumb, square, level',
      'Flashing tape applied',
      'Exterior doors hung and weatherstripped',
    ],
  },

  // ────────────────── ROUGH PLUMBING ──────────────────
  {
    id: 'rough.plumbing',
    name: 'Plumbing rough-in (top out)',
    phase: 'ROUGH_PLUMBING',
    trade: 'PLUMBER',
    typicalDays: 5,
    dependsOn: ['framing.sheathing'],
    materials: [
      {
        category: 'plumbing_rough',
        description: 'PEX, copper, ABS/PVC DWV, tub/shower valves',
        orderLeadTimeDays: 10,
        vendorTradeType: 'PLUMBER',
      },
    ],
    checklistItems: [
      'All fixtures stubbed in',
      'Tub/shower valves set',
      'DWV vented per code',
      'Pressure test passed',
    ],
  },
  {
    id: 'rough.gas',
    name: 'Gas line rough-in',
    phase: 'ROUGH_PLUMBING',
    trade: 'PLUMBER',
    typicalDays: 2,
    dependsOn: ['rough.plumbing'],
    materials: [
      {
        category: 'gas_line',
        description: 'Black iron or CSST gas line',
        orderLeadTimeDays: 7,
        vendorTradeType: 'PLUMBER',
      },
    ],
    checklistItems: ['Lines run to appliances', 'Pressure test passed', 'Gas inspection scheduled'],
  },

  // ────────────────── ROUGH ELECTRICAL ──────────────────
  {
    id: 'rough.electrical',
    name: 'Electrical rough-in',
    phase: 'ROUGH_ELECTRICAL',
    trade: 'ELECTRICIAN',
    typicalDays: 5,
    dependsOn: ['framing.sheathing'],
    materials: [
      {
        category: 'electrical_rough',
        description: 'Romex, boxes, panel, breakers, can lights',
        orderLeadTimeDays: 10,
        vendorTradeType: 'ELECTRICIAN',
      },
    ],
    checklistItems: [
      'Boxes at correct heights',
      'Service panel set',
      'Can lights laid out per plan',
      'Low-voltage rough complete (network/AV/security)',
    ],
  },
  {
    id: 'rough.lowvoltage',
    name: 'Low voltage rough (network, AV, security)',
    phase: 'ROUGH_ELECTRICAL',
    trade: 'ELECTRICIAN',
    typicalDays: 2,
    dependsOn: ['rough.electrical'],
    materials: [
      {
        category: 'low_voltage',
        description: 'CAT6, speaker wire, security pre-wire',
        orderLeadTimeDays: 7,
        vendorTradeType: 'ELECTRICIAN',
      },
    ],
    checklistItems: ['All pre-wire pulled', 'Drops labeled', 'Home-run to closet'],
  },

  // ────────────────── ROUGH HVAC ──────────────────
  {
    id: 'rough.hvac',
    name: 'HVAC rough-in (ductwork)',
    phase: 'ROUGH_HVAC',
    trade: 'HVAC',
    typicalDays: 5,
    dependsOn: ['framing.sheathing'],
    materials: [
      {
        category: 'hvac_ductwork',
        description: 'Sheet metal duct, flex, registers, mini split line sets',
        orderLeadTimeDays: 14,
        vendorTradeType: 'HVAC',
      },
    ],
    checklistItems: [
      'Trunks and runs sized per Manual D',
      'Equipment locations set',
      'Mini split line sets pre-pulled if applicable',
      'Returns sized correctly',
    ],
  },

  // ────────────────── FRAMING INSPECTION ──────────────────
  {
    id: 'inspection.framing',
    name: 'Framing inspection (city)',
    phase: 'FRAMING_INSPECTION',
    trade: 'INSPECTOR',
    typicalDays: 1,
    dependsOn: ['rough.plumbing', 'rough.electrical', 'rough.hvac', 'rough.gas'],
    materials: [],
    checklistItems: [
      'Plans on site',
      'Permit card current',
      'All roughs called in and passed',
      'Strapping/blocking complete',
    ],
  },

  // ────────────────── INSULATION ──────────────────
  {
    id: 'insulation.batts',
    name: 'Wall insulation (batts + blown)',
    phase: 'INSULATION',
    trade: 'INSULATION',
    typicalDays: 3,
    dependsOn: ['inspection.framing'],
    materials: [
      {
        category: 'insulation',
        description: 'R-21 batts walls, R-49 blown attic, sound batts at baths/laundry',
        orderLeadTimeDays: 7,
        vendorTradeType: 'INSULATION',
      },
    ],
    checklistItems: [
      'Full cavity fill',
      'Vapor barrier where required',
      'Air-seal complete behind tubs/showers',
    ],
  },
  {
    id: 'inspection.insulation',
    name: 'Insulation inspection',
    phase: 'INSULATION',
    trade: 'INSPECTOR',
    typicalDays: 1,
    dependsOn: ['insulation.batts'],
    materials: [],
    checklistItems: ['Inspector signed off', 'Ready for rock'],
  },

  // ────────────────── DRYWALL ──────────────────
  {
    id: 'drywall.hang',
    name: 'Hang drywall',
    phase: 'DRYWALL',
    trade: 'DRYWALLER',
    typicalDays: 4,
    dependsOn: ['inspection.insulation'],
    materials: [
      {
        category: 'drywall',
        description: 'Drywall (1/2", 5/8" at garage/ceiling), screws, corner bead',
        orderLeadTimeDays: 7,
        vendorTradeType: 'DRYWALLER',
      },
    ],
    checklistItems: ['Sheets staggered', 'No gaps > 1/4"', 'Screws spaced correctly'],
  },
  {
    id: 'drywall.tape',
    name: 'Tape, mud, sand drywall',
    phase: 'DRYWALL',
    trade: 'DRYWALLER',
    typicalDays: 7,
    dependsOn: ['drywall.hang'],
    materials: [
      {
        category: 'drywall_finish',
        description: 'Tape, joint compound, texture',
        orderLeadTimeDays: 3,
        vendorTradeType: 'DRYWALLER',
      },
    ],
    checklistItems: ['Smooth walk on level 4/5 finish', 'Texture per spec', 'No screw pops'],
  },

  // ────────────────── PAINT ──────────────────
  {
    id: 'paint.primer',
    name: 'Prime walls and ceilings',
    phase: 'PAINT',
    trade: 'PAINTER',
    typicalDays: 2,
    dependsOn: ['drywall.tape'],
    materials: [
      {
        category: 'paint',
        description: 'Primer + paint package (per design selections)',
        orderLeadTimeDays: 5,
        vendorTradeType: 'PAINTER',
      },
    ],
    checklistItems: ['Even coverage', 'No drips', 'Masking in place'],
  },
  {
    id: 'paint.color',
    name: 'Paint color coats (walls + ceilings)',
    phase: 'PAINT',
    trade: 'PAINTER',
    typicalDays: 3,
    dependsOn: ['paint.primer'],
    materials: [],
    checklistItems: [
      'Colors match selection sheet',
      'No roller marks',
      'Cut lines crisp at ceiling',
    ],
  },

  // ────────────────── CABINETS ──────────────────
  {
    id: 'cabinets.deliver',
    name: 'Cabinets delivered',
    phase: 'CABINETS',
    trade: 'VENDOR',
    typicalDays: 1,
    dependsOn: ['paint.color'],
    materials: [
      {
        category: 'cabinets',
        description: 'Kitchen + bath cabinets per design selections',
        orderLeadTimeDays: 56,
        vendorTradeType: 'CABINET',
      },
    ],
    checklistItems: [
      'All boxes match cut sheet',
      'No damage on inspection',
      'Hardware bagged separately',
    ],
  },
  {
    id: 'cabinets.install',
    name: 'Install cabinets',
    phase: 'CABINETS',
    trade: 'CABINET',
    typicalDays: 4,
    dependsOn: ['cabinets.deliver'],
    materials: [],
    checklistItems: ['Boxes level + plumb', 'Filler strips scribed', 'Toe kicks in place'],
  },
  {
    id: 'cabinets.tops',
    name: 'Template and install countertops',
    phase: 'CABINETS',
    trade: 'CABINET',
    typicalDays: 10,
    dependsOn: ['cabinets.install'],
    materials: [
      {
        category: 'countertops',
        description: 'Quartz/granite slabs + edge profile',
        orderLeadTimeDays: 14,
        vendorTradeType: 'CABINET',
      },
    ],
    checklistItems: [
      'Seams tight',
      'Overhang per spec',
      'Sink cutout aligned',
      'Edge profile matches selection',
    ],
  },

  // ────────────────── FLOORING ──────────────────
  {
    id: 'flooring.tile',
    name: 'Set tile (baths, kitchen, entry)',
    phase: 'FLOORING',
    trade: 'TILE',
    typicalDays: 5,
    dependsOn: ['paint.color'],
    materials: [
      {
        category: 'tile',
        description: 'Tile + thinset + grout (per selections)',
        orderLeadTimeDays: 14,
        vendorTradeType: 'TILE',
      },
    ],
    checklistItems: [
      'Layout matches design',
      'Grout joints consistent',
      'No lippage > 1/32"',
      'Shower waterproofing pre-test passed',
    ],
  },
  {
    id: 'flooring.wood',
    name: 'Install hardwood / LVP flooring',
    phase: 'FLOORING',
    trade: 'FLOORING',
    typicalDays: 4,
    dependsOn: ['cabinets.tops'],
    materials: [
      {
        category: 'flooring',
        description: 'White oak / engineered hardwood / LVP per selections',
        orderLeadTimeDays: 21,
        vendorTradeType: 'FLOORING',
      },
    ],
    checklistItems: [
      'Direction matches plan',
      'Stagger pattern correct',
      'Transitions trimmed',
      'No squeaks',
    ],
  },
  {
    id: 'flooring.carpet',
    name: 'Install carpet (bedrooms)',
    phase: 'FLOORING',
    trade: 'FLOORING',
    typicalDays: 2,
    dependsOn: ['flooring.wood'],
    materials: [
      {
        category: 'carpet',
        description: 'Carpet + pad per bedroom plan',
        orderLeadTimeDays: 14,
        vendorTradeType: 'FLOORING',
      },
    ],
    checklistItems: ['Seams not visible', 'Stretched tight', 'Tack strips installed'],
  },

  // ────────────────── TRIM ──────────────────
  {
    id: 'trim.base',
    name: 'Base and case trim',
    phase: 'TRIM',
    trade: 'DOOR_WINDOW',
    typicalDays: 5,
    dependsOn: ['flooring.wood'],
    materials: [
      {
        category: 'trim',
        description: 'Base, case, crown moulding per spec',
        orderLeadTimeDays: 10,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: ['Miters tight', 'Caulked joints', 'No hammer marks'],
  },
  {
    id: 'trim.stairs',
    name: 'Install stair parts (treads, risers, rail)',
    phase: 'TRIM',
    trade: 'DOOR_WINDOW',
    typicalDays: 5,
    dependsOn: ['trim.base'],
    materials: [
      {
        category: 'stair_parts',
        description: 'Treads, risers, newels, balusters, handrail',
        orderLeadTimeDays: 21,
        vendorTradeType: 'VENDOR',
      },
    ],
    checklistItems: [
      'No squeaks',
      'Risers flush with treads',
      'Handrail height per code (34-38")',
      'Baluster spacing < 4"',
    ],
  },

  // ────────────────── FINISH PLUMBING ──────────────────
  {
    id: 'finish.plumbing',
    name: 'Set plumbing fixtures',
    phase: 'FINISH_PLUMBING',
    trade: 'PLUMBER',
    typicalDays: 3,
    dependsOn: ['cabinets.tops', 'flooring.tile'],
    materials: [
      {
        category: 'plumbing_finish',
        description: 'Faucets, toilets, sinks, shower trim per selections',
        orderLeadTimeDays: 21,
        vendorTradeType: 'PLUMBER',
      },
    ],
    checklistItems: [
      'No leaks',
      'Water turned on and pressure good',
      'Drains running',
      'Caulk at all fixtures',
    ],
  },

  // ────────────────── FINISH ELECTRICAL ──────────────────
  {
    id: 'finish.electrical',
    name: 'Trim electrical (devices, fixtures)',
    phase: 'FINISH_ELECTRICAL',
    trade: 'ELECTRICIAN',
    typicalDays: 3,
    dependsOn: ['paint.color'],
    materials: [
      {
        category: 'lighting',
        description: 'Light fixtures, switches, outlets, cover plates per selections',
        orderLeadTimeDays: 21,
        vendorTradeType: 'ELECTRICIAN',
      },
    ],
    checklistItems: [
      'All devices working',
      'Cover plates flush',
      'Fixtures hung level',
      'Smokes and COs installed and chirp-tested',
    ],
  },

  // ────────────────── FINISH HVAC ──────────────────
  {
    id: 'finish.hvac',
    name: 'HVAC startup + commissioning',
    phase: 'FINISH_HVAC',
    trade: 'HVAC',
    typicalDays: 2,
    dependsOn: ['rough.hvac', 'paint.color'],
    materials: [
      {
        category: 'hvac_equipment',
        description: 'Furnace, AC, mini splits, thermostats',
        orderLeadTimeDays: 28,
        vendorTradeType: 'HVAC',
      },
    ],
    checklistItems: [
      'System runs cooling and heating',
      'Mini splits paired to remotes',
      'Thermostats programmed',
      'Filters installed',
    ],
  },

  // ────────────────── DOORS / HARDWARE ──────────────────
  {
    id: 'doors.interior',
    name: 'Hang interior doors',
    phase: 'DOORS_HARDWARE',
    trade: 'DOOR_WINDOW',
    typicalDays: 3,
    dependsOn: ['trim.base'],
    materials: [
      {
        category: 'interior_doors',
        description: 'Interior door slabs + jambs per schedule',
        orderLeadTimeDays: 28,
        vendorTradeType: 'DOOR_WINDOW',
      },
    ],
    checklistItems: [
      'Doors open and close cleanly',
      'Reveal even all sides',
      'No binding on latch',
    ],
  },
  {
    id: 'doors.hardware',
    name: 'Install knobs, hinges, deadbolts',
    phase: 'DOORS_HARDWARE',
    trade: 'DOOR_WINDOW',
    typicalDays: 2,
    dependsOn: ['doors.interior'],
    materials: [
      {
        category: 'door_hardware',
        description: 'Knobs, levers, hinges, deadbolts per selections',
        orderLeadTimeDays: 14,
        vendorTradeType: 'DOOR_WINDOW',
      },
    ],
    checklistItems: ['Hardware matches selections', 'Strikes adjusted', 'Keys labeled'],
  },

  // ────────────────── EXTERIOR ──────────────────
  {
    id: 'exterior.roofing',
    name: 'Install roofing (TPO / shingles)',
    phase: 'EXTERIOR',
    trade: 'ROOFING',
    typicalDays: 4,
    dependsOn: ['framing.sheathing'],
    materials: [
      {
        category: 'roofing',
        description: 'TPO membrane or asphalt shingles + flashing + edge metal',
        orderLeadTimeDays: 14,
        vendorTradeType: 'ROOFING',
      },
    ],
    checklistItems: [
      'No exposed fasteners',
      'Flashing at all penetrations',
      'Edge metal continuous',
      'Hose check passed (TPO)',
    ],
  },
  {
    id: 'exterior.siding',
    name: 'Install siding (Hardi / stucco)',
    phase: 'EXTERIOR',
    trade: 'STUCCO_SIDING',
    typicalDays: 7,
    dependsOn: ['exterior.roofing', 'framing.windows'],
    materials: [
      {
        category: 'siding',
        description: 'Hardi siding / stucco system + trim',
        orderLeadTimeDays: 21,
        vendorTradeType: 'STUCCO_SIDING',
      },
    ],
    checklistItems: [
      'Reveal consistent',
      'Caulk at trim',
      'No exposed nails',
      'Flashing tight at windows',
    ],
  },
  {
    id: 'exterior.soffit',
    name: 'Soffit, fascia, gutters',
    phase: 'EXTERIOR',
    trade: 'STUCCO_SIDING',
    typicalDays: 3,
    dependsOn: ['exterior.siding'],
    materials: [
      {
        category: 'gutters',
        description: 'Soffit panels, fascia, seamless gutters + downspouts',
        orderLeadTimeDays: 14,
        vendorTradeType: 'STUCCO_SIDING',
      },
    ],
    checklistItems: ['Gutters sloped to downspouts', 'No gaps in soffit', 'Downspouts tied out'],
  },
  {
    id: 'exterior.paint',
    name: 'Exterior paint / stain',
    phase: 'EXTERIOR',
    trade: 'PAINTER',
    typicalDays: 4,
    dependsOn: ['exterior.soffit'],
    materials: [
      {
        category: 'exterior_paint',
        description: 'Exterior paint + caulk',
        orderLeadTimeDays: 7,
        vendorTradeType: 'PAINTER',
      },
    ],
    checklistItems: ['Full coverage', 'No drips on siding', 'All gaps caulked'],
  },
  {
    id: 'exterior.flatwork',
    name: 'Driveway + flatwork concrete',
    phase: 'EXTERIOR',
    trade: 'CONCRETE',
    typicalDays: 4,
    dependsOn: ['foundation.backfill'],
    materials: [
      {
        category: 'flatwork',
        description: 'Concrete for driveway, walks, patios',
        orderLeadTimeDays: 3,
        vendorTradeType: 'CONCRETE',
      },
    ],
    checklistItems: ['Slopes away from house', 'Control joints cut', 'Broom finish even'],
  },

  // ────────────────── LANDSCAPING ──────────────────
  {
    id: 'landscape.grading',
    name: 'Final grade + topsoil',
    phase: 'LANDSCAPING',
    trade: 'LANDSCAPING',
    typicalDays: 3,
    dependsOn: ['exterior.flatwork'],
    materials: [
      {
        category: 'topsoil',
        description: 'Topsoil + amendments',
        orderLeadTimeDays: 5,
        vendorTradeType: 'LANDSCAPING',
      },
    ],
    checklistItems: ['Positive grade away from house', 'No low spots near foundation'],
  },
  {
    id: 'landscape.sprinkler',
    name: 'Sprinkler system',
    phase: 'LANDSCAPING',
    trade: 'LANDSCAPING',
    typicalDays: 3,
    dependsOn: ['landscape.grading'],
    materials: [
      {
        category: 'irrigation',
        description: 'Sprinkler heads, valves, controller, mainline pipe',
        orderLeadTimeDays: 7,
        vendorTradeType: 'LANDSCAPING',
      },
    ],
    checklistItems: ['Coverage tested per zone', 'Controller programmed', 'Backflow inspected'],
  },
  {
    id: 'landscape.sod',
    name: 'Sod + plants',
    phase: 'LANDSCAPING',
    trade: 'LANDSCAPING',
    typicalDays: 3,
    dependsOn: ['landscape.sprinkler'],
    materials: [
      {
        category: 'sod',
        description: 'Sod + plants per landscape plan',
        orderLeadTimeDays: 5,
        vendorTradeType: 'LANDSCAPING',
      },
    ],
    checklistItems: ['Sod seams tight', 'Plants per plan', 'Watered in'],
  },
  {
    id: 'landscape.fence',
    name: 'Install fence',
    phase: 'LANDSCAPING',
    trade: 'LANDSCAPING',
    typicalDays: 4,
    dependsOn: ['landscape.grading'],
    materials: [
      {
        category: 'fence',
        description: 'Fence material per plan',
        orderLeadTimeDays: 14,
        vendorTradeType: 'LANDSCAPING',
      },
    ],
    checklistItems: ['Posts plumb', 'Gates swing freely', 'No gaps at grade'],
  },

  // ────────────────── PUNCH LIST ──────────────────
  {
    id: 'punch.bluetape',
    name: 'Blue tape walk + punch list',
    phase: 'PUNCH_LIST',
    trade: 'GC',
    typicalDays: 2,
    dependsOn: [
      'finish.plumbing',
      'finish.electrical',
      'finish.hvac',
      'doors.hardware',
      'trim.stairs',
      'flooring.carpet',
    ],
    materials: [],
    checklistItems: [
      'All rooms walked',
      'Items tagged with blue tape',
      'Punch list documented per trade',
    ],
  },
  {
    id: 'punch.touchup',
    name: 'Punch list touch-ups (paint, drywall, trim)',
    phase: 'PUNCH_LIST',
    trade: 'PAINTER',
    typicalDays: 3,
    dependsOn: ['punch.bluetape'],
    materials: [],
    checklistItems: ['All blue tape items addressed', 'Touch-up paint blends', 'No visible defects'],
  },
  {
    id: 'punch.cleaning',
    name: 'Final cleaning',
    phase: 'PUNCH_LIST',
    trade: 'INTERNAL',
    typicalDays: 2,
    dependsOn: ['punch.touchup'],
    materials: [],
    checklistItems: [
      'Windows cleaned in/out',
      'Floors mopped/vacuumed',
      'Cabinets wiped',
      'Construction debris removed',
    ],
  },
  {
    id: 'punch.ducts',
    name: 'Duct cleaning',
    phase: 'PUNCH_LIST',
    trade: 'HVAC',
    typicalDays: 1,
    dependsOn: ['punch.cleaning'],
    materials: [],
    checklistItems: ['All ducts cleaned', 'New filter installed', 'Vents wiped'],
  },

  // ────────────────── FINAL INSPECTION ──────────────────
  {
    id: 'final.blowerdoor',
    name: 'Blower door test',
    phase: 'FINAL_INSPECTION',
    trade: 'INSPECTOR',
    typicalDays: 1,
    dependsOn: ['punch.cleaning'],
    materials: [],
    checklistItems: ['ACH50 below code threshold', 'Test report on file'],
  },
  {
    id: 'final.holmes',
    name: 'Holmes test (energy)',
    phase: 'FINAL_INSPECTION',
    trade: 'INSPECTOR',
    typicalDays: 1,
    dependsOn: ['final.blowerdoor'],
    materials: [],
    checklistItems: ['Test report passed', 'HERS index documented'],
  },
  {
    id: 'final.city',
    name: 'Final city inspection',
    phase: 'FINAL_INSPECTION',
    trade: 'INSPECTOR',
    typicalDays: 1,
    dependsOn: ['final.holmes', 'punch.ducts'],
    materials: [],
    checklistItems: [
      'Inspector walked house',
      'All trades signed off',
      'Permit closed',
      'CO issued',
    ],
  },

  // ────────────────── CLOSE ──────────────────
  {
    id: 'close.walkthrough',
    name: 'Client walkthrough + key handoff',
    phase: 'CLOSE',
    trade: 'GC',
    typicalDays: 1,
    dependsOn: ['final.city'],
    customOnly: true,
    materials: [],
    checklistItems: [
      'Client walked all systems',
      'Keys delivered',
      'Warranty book + manuals handed off',
      'HVAC + irrigation programmed with client',
    ],
  },
  {
    id: 'close.parade',
    name: 'Parade home prep',
    phase: 'CLOSE',
    trade: 'GC',
    typicalDays: 5,
    dependsOn: ['final.city'],
    specOnly: true,
    materials: [],
    checklistItems: [
      'Staging in place',
      'Signage installed',
      'Photo + video walkthroughs done',
      'Site clean for visitors',
    ],
  },
  {
    id: 'close.listing',
    name: 'Listing handoff (spec)',
    phase: 'CLOSE',
    trade: 'GC',
    typicalDays: 1,
    dependsOn: ['final.city'],
    specOnly: true,
    materials: [],
    checklistItems: ['Realtor walked house', 'Marketing photos delivered', 'Listing live'],
  },
  {
    id: 'close.warranty',
    name: '30-day warranty walk',
    phase: 'CLOSE',
    trade: 'GC',
    typicalDays: 1,
    dependsOn: ['close.walkthrough'],
    customOnly: true,
    materials: [],
    checklistItems: ['Walked all systems', 'Open items logged', 'Warranty list to trades'],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
// Looked up by id from the dependsOn arrays in projectTaskEngine.
export function getPhaseTask(id: string): PhaseTask | undefined {
  return PHASE_CATALOG.find((t) => t.id === id);
}

// All tasks in a single phase, preserving catalog order.
export function getTasksForPhase(phase: ConstructionPhase): PhaseTask[] {
  return PHASE_CATALOG.filter((t) => t.phase === phase);
}

// Tasks for the given project type (spec vs custom). Strips out
// customOnly/specOnly tasks that don't apply.
export function getTasksForProjectType(type: 'CUSTOM' | 'SPEC'): PhaseTask[] {
  return PHASE_CATALOG.filter((t) => {
    if (type === 'CUSTOM' && t.specOnly) return false;
    if (type === 'SPEC' && t.customOnly) return false;
    return true;
  });
}

// Ordered list of phases for UI / scheduling sequencing.
export const PHASE_ORDER: Readonly<ConstructionPhase[]> = CONSTRUCTION_PHASES;
