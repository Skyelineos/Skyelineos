// Per-project-type starter SCHEDULE templates (Spec Home, Basement Finish,
// Remodel, Pool). Authored as rough-but-realistic GC baselines and seeded into
// the `scheduleTemplates` collection tagged with `projectType` so they auto-
// attach to new jobs of that type (Templates → Schedule).
//
// Custom Home is intentionally NOT here — that build type is driven by the
// existing "House Build" schedule starter and the Custom Home Master Task List.
//
// Task model: the schedule editor stores a flat task list (phase header rows +
// tasks) + FS links. Each task also carries construction metadata (trade,
// description, client-approval / inspection / long-lead flags, optional) which
// persists on the doc for reporting and future UI.
import type { Link } from '@/modules/gantt/types';

export interface TypeTplTask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  status?: 'on_track' | 'delayed' | 'pending_approval';
  isPhase?: boolean;
  decision?: boolean;
  // construction metadata (persisted; surfaced in UI over time)
  trade?: string;
  description?: string;
  clientApprovalRequired?: boolean;
  inspectionRequired?: boolean;
  longLeadConcern?: boolean;
  optional?: boolean;
}

export interface TypeScheduleTemplate {
  key: string;
  name: string;
  projectType: string;
  description: string;
  /** Older template names this should overwrite (so seeding fills stubs, no dupes). */
  aliases?: string[];
  tasks: TypeTplTask[];
  links: Link[];
}

interface TaskSpec {
  name: string;
  days: number;
  trade?: string;
  desc?: string;
  approval?: boolean;
  inspection?: boolean;
  lead?: boolean;
  optional?: boolean;
}
interface PhaseSpec { phase: string; tasks: TaskSpec[] }

const MS_DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, n: number) => new Date(d.getTime() + n * MS_DAY);

// Turn readable phase/task specs into the flat task list + sequential FS chain
// the schedule editor expects. Dates are nominal (re-anchored to the project
// start when the template is applied).
function build(
  key: string,
  name: string,
  projectType: string,
  description: string,
  phases: PhaseSpec[],
  aliases?: string[],
): TypeScheduleTemplate {
  const tasks: TypeTplTask[] = [];
  const links: Link[] = [];
  let cursor = new Date('2025-01-06T00:00:00Z');
  let prevLeaf: string | null = null;

  phases.forEach((ph, pi) => {
    const phaseId = `${key}_p${pi + 1}`;
    const phaseStart = new Date(cursor);
    const children: TypeTplTask[] = [];
    let c = new Date(cursor);

    ph.tasks.forEach((t, ti) => {
      const id = `${phaseId}_t${ti + 1}`;
      const start = new Date(c);
      const end = plus(start, Math.max(0, t.days - 1));
      children.push({
        id,
        name: t.name,
        startDate: iso(start),
        endDate: iso(end),
        durationDays: t.days,
        status: t.approval ? 'pending_approval' : undefined,
        decision: t.approval || undefined,
        trade: t.trade,
        description: t.desc,
        clientApprovalRequired: t.approval || undefined,
        inspectionRequired: t.inspection || undefined,
        longLeadConcern: t.lead || undefined,
        optional: t.optional || undefined,
      });
      if (prevLeaf) links.push({ sourceId: prevLeaf, targetId: id, type: 'FS' });
      prevLeaf = id;
      c = plus(end, 1);
    });

    const phaseEnd = plus(c, -1);
    tasks.push({
      id: phaseId,
      name: ph.phase,
      startDate: iso(phaseStart),
      endDate: iso(phaseEnd),
      durationDays: Math.max(1, Math.round((phaseEnd.getTime() - phaseStart.getTime()) / MS_DAY) + 1),
      isPhase: true,
    });
    tasks.push(...children);
    cursor = new Date(c);
  });

  return { key, name, projectType, description, aliases, tasks, links };
}

// ── SPEC HOME ───────────────────────────────────────────────────────────────
const SPEC_HOME = build('spec_home', 'Spec Home', 'Spec Home',
  'Builder-spec home: lot readiness → product planning → build → sell. ~70 tasks.',
  [
    { phase: 'Land / Lot Readiness', tasks: [
      { name: 'Confirm lot ownership / title status', days: 2, trade: 'Office', desc: 'Verify clear title and recorded ownership before spending.' },
      { name: 'Verify zoning, setbacks & easements', days: 3, trade: 'Office', desc: 'Confirm buildable envelope; catch setback/easement conflicts early.' },
      { name: 'Confirm utility availability (power/water/sewer/gas)', days: 3, trade: 'Office', desc: 'Hidden delay source — confirm taps/stubs exist or plan extensions.' },
      { name: 'Order soils / geotech report', days: 7, trade: 'Geotech', desc: 'Drives foundation design.', lead: true, optional: true },
    ]},
    { phase: 'Product Planning', tasks: [
      { name: 'Select plan / elevation', days: 5, trade: 'Office' },
      { name: 'Confirm spec finish package', days: 4, trade: 'Designer', desc: 'Lock the standard finish package for the market/price point.' },
      { name: 'Finalize construction budget', days: 4, trade: 'Office' },
    ]},
    { phase: 'Preconstruction', tasks: [
      { name: 'Structural engineering', days: 10, trade: 'Engineer', lead: true },
      { name: 'Create construction schedule', days: 2, trade: 'PM' },
      { name: 'Open job / set up cost codes', days: 1, trade: 'Office' },
    ]},
    { phase: 'Permitting', tasks: [
      { name: 'Submit building permit', days: 3, trade: 'Office' },
      { name: 'Permit review & issuance', days: 20, trade: 'City', desc: 'Plan on weeks, not days — gate before site work.', lead: true },
    ]},
    { phase: 'Procurement (Long-Lead)', tasks: [
      { name: 'Order roof trusses', days: 2, trade: 'Office', lead: true },
      { name: 'Order windows', days: 2, trade: 'Office', lead: true },
      { name: 'Order exterior doors', days: 2, trade: 'Office', lead: true },
      { name: 'Order cabinets', days: 2, trade: 'Office', lead: true },
      { name: 'Order appliances', days: 2, trade: 'Office', lead: true },
      { name: 'Order plumbing fixtures', days: 2, trade: 'Office', lead: true },
      { name: 'Order lighting package', days: 2, trade: 'Office', lead: true },
    ]},
    { phase: 'Site Prep', tasks: [
      { name: 'Site clearing & rough grade', days: 3, trade: 'Excavator' },
      { name: 'Install temporary utilities', days: 2, trade: 'Electrician' },
      { name: 'Install SWPPP / silt fence & job sign', days: 1, trade: 'GC' },
    ]},
    { phase: 'Excavation', tasks: [
      { name: 'Stake the lot', days: 1, trade: 'Surveyor' },
      { name: 'Excavation / dig', days: 4, trade: 'Excavator' },
      { name: 'Stake again for footings', days: 1, trade: 'Surveyor' },
    ]},
    { phase: 'Foundation', tasks: [
      { name: 'Footings — form, set & pour', days: 4, trade: 'Concrete', inspection: true },
      { name: 'Foundation walls — form & pour', days: 6, trade: 'Concrete', inspection: true },
      { name: 'Waterproofing & damp-proofing', days: 2, trade: 'Waterproofing' },
      { name: 'Underground plumbing', days: 3, trade: 'Plumber', inspection: true },
      { name: 'Backfill', days: 2, trade: 'Excavator' },
      { name: 'Flatwork prep & basement slab', days: 3, trade: 'Concrete' },
    ]},
    { phase: 'Framing', tasks: [
      { name: 'Framing', days: 20, trade: 'Framer' },
      { name: 'Roof dry-in', days: 3, trade: 'Roofer' },
      { name: 'Window install', days: 3, trade: 'Framer' },
      { name: 'Exterior door install', days: 2, trade: 'Framer' },
    ]},
    { phase: 'Rough Mechanical', tasks: [
      { name: 'Rough plumbing', days: 5, trade: 'Plumber' },
      { name: 'Rough HVAC', days: 5, trade: 'HVAC' },
      { name: 'Rough electrical', days: 5, trade: 'Electrician' },
      { name: 'Low-voltage / AV rough', days: 2, trade: 'Low-Voltage', optional: true },
    ]},
    { phase: 'Inspections', tasks: [
      { name: '4-way / rough inspection', days: 2, trade: 'City', inspection: true },
    ]},
    { phase: 'Insulation / Drywall', tasks: [
      { name: 'Insulation', days: 3, trade: 'Insulation', inspection: true },
      { name: 'Drywall hang', days: 4, trade: 'Drywall' },
      { name: 'Drywall finish (tape / mud / texture)', days: 6, trade: 'Drywall' },
    ]},
    { phase: 'Interior Finishes', tasks: [
      { name: 'Interior paint', days: 6, trade: 'Painter' },
      { name: 'Cabinets', days: 4, trade: 'Cabinets' },
      { name: 'Countertops — template & install', days: 10, trade: 'Countertops', lead: true },
      { name: 'Tile', days: 6, trade: 'Tile' },
      { name: 'Flooring', days: 5, trade: 'Flooring' },
      { name: 'Interior trim & doors', days: 6, trade: 'Trim Carpenter' },
      { name: 'Plumbing finish', days: 3, trade: 'Plumber' },
      { name: 'Electrical finish', days: 3, trade: 'Electrician' },
      { name: 'HVAC finish / trim', days: 2, trade: 'HVAC' },
      { name: 'Appliance install', days: 1, trade: 'Appliance' },
    ]},
    { phase: 'Exterior Finishes', tasks: [
      { name: 'Exterior finishes (stucco / stone / siding)', days: 12, trade: 'Stucco/Mason' },
      { name: 'Garage door', days: 1, trade: 'Garage Door' },
      { name: 'Final grade', days: 2, trade: 'Excavator' },
      { name: 'Landscaping', days: 5, trade: 'Landscaper' },
    ]},
    { phase: 'Utility Finalization', tasks: [
      { name: 'Permanent power & water meter set', days: 3, trade: 'Utility', lead: true },
    ]},
    { phase: 'Cleaning / Staging', tasks: [
      { name: 'Final clean', days: 2, trade: 'Cleaning' },
      { name: 'Stage home', days: 2, trade: 'Stager', optional: true },
    ]},
    { phase: 'Marketing / Sales Prep', tasks: [
      { name: 'Professional photos', days: 1, trade: 'Photographer' },
      { name: 'MLS / listing prep', days: 2, trade: 'Agent' },
    ]},
    { phase: 'Final Inspection', tasks: [
      { name: 'City final inspection', days: 2, trade: 'City', inspection: true },
      { name: 'Certificate of occupancy', days: 2, trade: 'City' },
    ]},
    { phase: 'Buyer Walkthrough', tasks: [
      { name: 'Buyer walkthrough', days: 1, trade: 'PM', approval: true },
    ]},
    { phase: 'Punch List', tasks: [
      { name: 'Final punch list', days: 5, trade: 'GC' },
    ]},
    { phase: 'Closeout', tasks: [
      { name: 'Warranty handoff & documents', days: 2, trade: 'Office' },
    ]},
  ],
);

// ── BASEMENT FINISH ──────────────────────────────────────────────────────────
const BASEMENT = build('basement_finish', 'Basement Finish', 'Basement',
  'Finishing an existing basement: scope → permit → rough → finish → closeout. ~42 tasks.',
  [
    { phase: 'Existing Conditions', tasks: [
      { name: 'Document existing basement condition', days: 1, trade: 'PM', desc: 'Photo/video; note moisture, cracks, existing rough-ins.' },
      { name: 'Confirm ceiling heights', days: 1, trade: 'PM', desc: 'Verify finished-height code minimums under beams/ducts.' },
      { name: 'Verify existing plumbing rough-ins', days: 1, trade: 'Plumber' },
      { name: 'Verify electrical panel capacity', days: 1, trade: 'Electrician', desc: 'Hidden delay — panel may need an upgrade/sub-panel.' },
      { name: 'Confirm HVAC supply / return needs', days: 1, trade: 'HVAC' },
      { name: 'Confirm bedroom egress requirements', days: 1, trade: 'PM', desc: 'Egress window/well often the schedule + budget surprise.' },
    ]},
    { phase: 'Design / Scope', tasks: [
      { name: 'Finalize layout', days: 3, trade: 'Designer', approval: true },
      { name: 'Confirm bathroom scope', days: 1, trade: 'PM', approval: true },
      { name: 'Confirm wet bar / kitchenette scope', days: 1, trade: 'PM', approval: true, optional: true },
      { name: 'Create finish selections', days: 4, trade: 'Designer', approval: true },
    ]},
    { phase: 'Budget / Contract', tasks: [
      { name: 'Finalize budget & sign contract', days: 3, trade: 'Office', approval: true },
      { name: 'Order long-lead items (egress window, vanity, glass)', days: 2, trade: 'Office', lead: true },
    ]},
    { phase: 'Permit', tasks: [
      { name: 'Submit permit', days: 3, trade: 'Office' },
      { name: 'Permit issuance', days: 14, trade: 'City', lead: true },
    ]},
    { phase: 'Preconstruction', tasks: [
      { name: 'Protect existing home areas / floors', days: 1, trade: 'GC', desc: 'Dust barriers + path protection in an occupied home.' },
      { name: 'Material staging', days: 1, trade: 'GC' },
      { name: 'Cut egress window & well (if required)', days: 2, trade: 'Concrete', optional: true },
    ]},
    { phase: 'Framing', tasks: [
      { name: 'Layout walls', days: 1, trade: 'Framer' },
      { name: 'Frame walls', days: 4, trade: 'Framer' },
      { name: 'Frame soffits', days: 2, trade: 'Framer' },
      { name: 'Frame mechanical chases', days: 1, trade: 'Framer' },
    ]},
    { phase: 'Mechanical Roughs', tasks: [
      { name: 'Plumbing rough', days: 3, trade: 'Plumber' },
      { name: 'HVAC rough', days: 2, trade: 'HVAC' },
      { name: 'Electrical rough', days: 3, trade: 'Electrician' },
      { name: 'Low-voltage rough', days: 1, trade: 'Low-Voltage', optional: true },
    ]},
    { phase: 'Inspections', tasks: [
      { name: 'Rough / framing inspection', days: 1, trade: 'City', inspection: true },
    ]},
    { phase: 'Insulation', tasks: [
      { name: 'Insulation', days: 2, trade: 'Insulation', inspection: true },
    ]},
    { phase: 'Drywall', tasks: [
      { name: 'Drywall hang', days: 3, trade: 'Drywall' },
      { name: 'Drywall finish', days: 4, trade: 'Drywall' },
    ]},
    { phase: 'Interior Finishes', tasks: [
      { name: 'Paint', days: 4, trade: 'Painter' },
      { name: 'Interior doors', days: 2, trade: 'Trim Carpenter' },
      { name: 'Trim', days: 3, trade: 'Trim Carpenter' },
      { name: 'Cabinets / vanity', days: 2, trade: 'Cabinets' },
      { name: 'Countertops', days: 7, trade: 'Countertops', lead: true },
      { name: 'Tile', days: 4, trade: 'Tile' },
      { name: 'Flooring', days: 3, trade: 'Flooring' },
      { name: 'Plumbing finish', days: 2, trade: 'Plumber' },
      { name: 'Electrical finish', days: 2, trade: 'Electrician' },
      { name: 'HVAC trim', days: 1, trade: 'HVAC' },
      { name: 'Shower glass', days: 1, trade: 'Glass', lead: true, optional: true },
    ]},
    { phase: 'Final Inspection', tasks: [
      { name: 'Final inspection', days: 1, trade: 'City', inspection: true },
    ]},
    { phase: 'Closeout', tasks: [
      { name: 'Final clean', days: 1, trade: 'Cleaning' },
      { name: 'Client walkthrough', days: 1, trade: 'PM', approval: true },
      { name: 'Punch list', days: 3, trade: 'GC' },
      { name: 'Warranty setup', days: 1, trade: 'Office' },
    ]},
  ],
  ['Basement Finishing'],
);

// ── REMODEL ──────────────────────────────────────────────────────────────────
const REMODEL = build('house_remodel', 'Remodel', 'Remodel',
  'Whole-home / room remodel in an occupied house: protect → demo → discover → rebuild. ~68 tasks.',
  [
    { phase: 'Existing Conditions', tasks: [
      { name: 'Existing condition walkthrough', days: 1, trade: 'PM' },
      { name: 'Photo / video documentation', days: 1, trade: 'PM', desc: 'Protects you on pre-existing damage disputes.' },
      { name: 'Identify unknowns & risk areas', days: 1, trade: 'PM', desc: 'Flag likely hidden conditions (knob-and-tube, rot, asbestos).' },
      { name: 'Confirm client living arrangements', days: 1, trade: 'PM' },
      { name: 'Confirm dust protection plan', days: 1, trade: 'PM' },
      { name: 'Confirm temporary kitchen / bath needs', days: 1, trade: 'PM', optional: true },
    ]},
    { phase: 'Design / Scope', tasks: [
      { name: 'Finalize design scope', days: 5, trade: 'Designer', approval: true },
      { name: 'Finalize selections', days: 7, trade: 'Designer', approval: true },
    ]},
    { phase: 'Budget / Contract', tasks: [
      { name: 'Finalize budget & sign contract', days: 4, trade: 'Office', approval: true },
      { name: 'Confirm allowance items', days: 2, trade: 'Office', approval: true },
    ]},
    { phase: 'Engineering', tasks: [
      { name: 'Engineering review (if structural)', days: 10, trade: 'Engineer', lead: true, optional: true },
    ]},
    { phase: 'Permit', tasks: [
      { name: 'Submit permit', days: 3, trade: 'Office' },
      { name: 'Permit issuance', days: 15, trade: 'City', lead: true },
    ]},
    { phase: 'Procurement (Long-Lead)', tasks: [
      { name: 'Order cabinets', days: 2, trade: 'Office', lead: true },
      { name: 'Order windows / doors', days: 2, trade: 'Office', lead: true, optional: true },
      { name: 'Order plumbing fixtures', days: 2, trade: 'Office', lead: true },
      { name: 'Order appliances', days: 2, trade: 'Office', lead: true },
      { name: 'Order tile / flooring', days: 2, trade: 'Office', lead: true },
      { name: 'Order light fixtures', days: 2, trade: 'Office', lead: true },
    ]},
    { phase: 'Client Protection Plan', tasks: [
      { name: 'Confirm utility shutoff requirements', days: 1, trade: 'GC' },
      { name: 'Protect floors & pathways', days: 1, trade: 'GC' },
      { name: 'Install dust barriers', days: 1, trade: 'GC' },
      { name: 'Set up negative air', days: 1, trade: 'GC', optional: true },
    ]},
    { phase: 'Demolition', tasks: [
      { name: 'Hazmat test (asbestos / lead) — pre-1980 homes', days: 2, trade: 'Testing', desc: 'Test before demo; positive results change scope + cost.', optional: true },
      { name: 'Demolition', days: 4, trade: 'Demo' },
      { name: 'Haul-off', days: 2, trade: 'Demo' },
      { name: 'Discovery inspection (hidden conditions)', days: 1, trade: 'PM', desc: 'Open-wall review — the classic schedule wildcard.' },
      { name: 'Change order review (if discovery found issues)', days: 2, trade: 'Office', approval: true, optional: true },
    ]},
    { phase: 'Structural / Framing', tasks: [
      { name: 'Structural framing', days: 6, trade: 'Framer' },
      { name: 'Window / door modifications', days: 3, trade: 'Framer', optional: true },
    ]},
    { phase: 'Mechanical Roughs', tasks: [
      { name: 'Plumbing rough', days: 4, trade: 'Plumber' },
      { name: 'HVAC rough', days: 3, trade: 'HVAC' },
      { name: 'Electrical rough', days: 4, trade: 'Electrician' },
      { name: 'Reroute ductwork / relocate vents', days: 2, trade: 'HVAC', optional: true },
    ]},
    { phase: 'Inspections', tasks: [
      { name: 'Rough inspection', days: 1, trade: 'City', inspection: true },
      { name: 'Pre-drywall QC walk', days: 1, trade: 'PM', desc: 'Quality check behind the walls before close-up.' },
    ]},
    { phase: 'Drywall / Finishes', tasks: [
      { name: 'Insulation', days: 2, trade: 'Insulation', inspection: true },
      { name: 'Drywall patch / hang', days: 4, trade: 'Drywall' },
      { name: 'Drywall finish', days: 4, trade: 'Drywall' },
      { name: 'Paint', days: 5, trade: 'Painter' },
      { name: 'Cabinets', days: 3, trade: 'Cabinets' },
      { name: 'Countertops', days: 10, trade: 'Countertops', lead: true },
      { name: 'Tile', days: 5, trade: 'Tile' },
      { name: 'Backsplash tile', days: 2, trade: 'Tile' },
      { name: 'Flooring', days: 4, trade: 'Flooring' },
      { name: 'Trim', days: 4, trade: 'Trim Carpenter' },
      { name: 'Interior doors & hardware', days: 2, trade: 'Trim Carpenter' },
      { name: 'Plumbing finish', days: 3, trade: 'Plumber' },
      { name: 'Electrical finish', days: 3, trade: 'Electrician' },
      { name: 'HVAC finish', days: 2, trade: 'HVAC' },
      { name: 'Appliance install', days: 1, trade: 'Appliance' },
    ]},
    { phase: 'Final Completion', tasks: [
      { name: 'Pre-final QC walk', days: 1, trade: 'PM', desc: 'Internal quality walk before the client sees it.' },
      { name: 'Final inspection', days: 1, trade: 'City', inspection: true },
      { name: 'Deep clean', days: 2, trade: 'Cleaning' },
      { name: 'Client walkthrough', days: 1, trade: 'PM', approval: true },
      { name: 'Punch list', days: 4, trade: 'GC' },
      { name: 'Touch-up & re-clean', days: 2, trade: 'GC' },
    ]},
    { phase: 'Closeout', tasks: [
      { name: 'Closeout documentation', days: 2, trade: 'Office' },
      { name: 'Warranty setup', days: 1, trade: 'Office' },
    ]},
  ],
  ['House Remodel'],
);

// ── POOL ─────────────────────────────────────────────────────────────────────
const POOL = build('pool_build', 'Pool', 'Pool',
  'In-ground pool build: design/approvals → dig → shell → finish → startup. ~50 tasks.',
  [
    { phase: 'Design', tasks: [
      { name: 'Site evaluation', days: 2, trade: 'Pool Designer' },
      { name: 'Confirm access for excavation equipment', days: 1, trade: 'PM', desc: 'Common surprise — gates/fences/utilities block the dig.' },
      { name: 'Confirm setbacks / easements', days: 2, trade: 'Office' },
      { name: 'Confirm utility conflicts (gas/electric/sewer)', days: 2, trade: 'Office' },
      { name: 'Pool design approval', days: 3, trade: 'PM', approval: true },
    ]},
    { phase: 'Engineering', tasks: [
      { name: 'Engineering', days: 10, trade: 'Engineer', lead: true },
    ]},
    { phase: 'HOA / City Approval', tasks: [
      { name: 'HOA approval', days: 14, trade: 'Office', lead: true, optional: true },
      { name: 'Permit submission', days: 3, trade: 'Office' },
      { name: 'Permit issuance', days: 20, trade: 'City', lead: true },
    ]},
    { phase: 'Preconstruction (Selections)', tasks: [
      { name: 'Select pool interior finish', days: 2, trade: 'Owner', approval: true },
      { name: 'Select tile / coping', days: 2, trade: 'Owner', approval: true },
      { name: 'Select decking', days: 2, trade: 'Owner', approval: true },
      { name: 'Select equipment package', days: 2, trade: 'Owner', approval: true, lead: true },
    ]},
    { phase: 'Excavation', tasks: [
      { name: 'Layout pool', days: 1, trade: 'Pool Sub' },
      { name: 'Pre-excavation utility locate (811)', days: 2, trade: 'PM', desc: 'Mandatory locate before digging.' },
      { name: 'Excavation', days: 3, trade: 'Excavator' },
      { name: 'Soil condition review', days: 1, trade: 'PM', desc: 'Rock/water table can change cost + method.' },
    ]},
    { phase: 'Steel / Plumbing / Electrical', tasks: [
      { name: 'Form pool', days: 2, trade: 'Pool Sub' },
      { name: 'Steel / rebar install', days: 3, trade: 'Pool Sub' },
      { name: 'Bonding', days: 1, trade: 'Electrician' },
      { name: 'Rough plumbing', days: 3, trade: 'Pool Sub' },
      { name: 'Rough electrical', days: 2, trade: 'Electrician' },
      { name: 'Pool light niche install', days: 1, trade: 'Electrician' },
      { name: 'Equipment pad prep', days: 1, trade: 'Pool Sub' },
      { name: 'Pre-gunite inspection', days: 1, trade: 'City', inspection: true },
    ]},
    { phase: 'Shell', tasks: [
      { name: 'Shotcrete / gunite', days: 2, trade: 'Gunite' },
      { name: 'Cure period', days: 7, trade: 'Pool Sub', desc: 'Hold for proper cure before tile/finish.' },
    ]},
    { phase: 'Tile / Coping', tasks: [
      { name: 'Tile install', days: 3, trade: 'Tile' },
      { name: 'Coping install', days: 3, trade: 'Mason' },
    ]},
    { phase: 'Decking', tasks: [
      { name: 'Deck drain layout', days: 1, trade: 'Pool Sub' },
      { name: 'Decking prep', days: 2, trade: 'Concrete' },
      { name: 'Deck pour / install', days: 3, trade: 'Concrete' },
    ]},
    { phase: 'Equipment', tasks: [
      { name: 'Equipment set', days: 2, trade: 'Pool Sub' },
      { name: 'Plumbing equipment connections', days: 2, trade: 'Pool Sub' },
      { name: 'Electrical equipment connections', days: 2, trade: 'Electrician' },
      { name: 'Automation setup', days: 1, trade: 'Pool Sub', optional: true },
    ]},
    { phase: 'Startup', tasks: [
      { name: 'Interior finish / plaster', days: 2, trade: 'Plaster' },
      { name: 'Fill pool', days: 2, trade: 'Pool Sub' },
      { name: 'Startup chemicals', days: 1, trade: 'Pool Sub' },
      { name: 'Equipment startup', days: 2, trade: 'Pool Sub' },
    ]},
    { phase: 'Final Inspection', tasks: [
      { name: 'Final inspection', days: 1, trade: 'City', inspection: true },
      { name: 'Safety barrier / fence inspection', days: 1, trade: 'City', inspection: true },
    ]},
    { phase: 'Owner Training', tasks: [
      { name: 'Owner training', days: 1, trade: 'Pool Sub', approval: true },
    ]},
    { phase: 'Closeout', tasks: [
      { name: 'Final clean', days: 1, trade: 'Cleaning' },
      { name: 'Punch list', days: 2, trade: 'GC' },
      { name: 'Warranty handoff', days: 1, trade: 'Office' },
    ]},
  ],
  ['Pool Build'],
);

export const TYPE_SCHEDULE_TEMPLATES: TypeScheduleTemplate[] = [SPEC_HOME, BASEMENT, REMODEL, POOL];
