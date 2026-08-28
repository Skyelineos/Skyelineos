/**
 * estimateTemplate.ts
 *
 * Tyler's real-world 62-line-item standard estimate template,
 * derived from his Google Sheets Master Estimate Tracker.
 *
 * Section names use mixed-case titles that match Tyler's sheets exactly.
 * Each item ships with $0 costs — Tyler fills in real numbers per project.
 * Any item can be edited, removed, or reordered after loading.
 */

// ─── LineItem shape (mirrors EstimateBuilder.tsx exactly) ─────────────────────

export interface TemplateLineItem {
  id: string;
  trade: string;         // Section / category label (used for grouping)
  description: string;  // The line item name
  qty: number;
  unit: string;
  unitCost: number;      // Sell price per unit (client-facing) — starts at 0
  subCost: number;       // Builder cost per unit (internal) — starts at 0
  total: number;
  notes?: string;
  kind?: 'material' | 'labor' | 'equipment' | 'subcontractor' | 'both';
  lineStatus?: 'inc' | 'ex' | 'note' | 'allow';
}

// ─── Section names (ordered, matching Tyler's Google Sheets) ──────────────────

/**
 * Ordered section names for the standard Skyeline estimate structure.
 * These are used as the `trade` field on template line items, which drives
 * the section grouping in EstimateBuilder's Scope of Work table.
 */
export const ESTIMATE_SECTIONS: string[] = [
  'Pre-Construction (Soft Costs)',
  'Site Work & Foundation',
  'Structure / Shell',
  'Rough MEP',
  'Exterior Finish',
  'Interior Finish',
  'Specialty / Optional',
  'Closeout',
];

/** Backward-compatible alias. */
export const TEMPLATE_SECTIONS: string[] = ESTIMATE_SECTIONS;

// ─── Raw item definitions ─────────────────────────────────────────────────────

type RawItem = {
  trade: string;
  description: string;
  unit?: string;
  kind?: TemplateLineItem['kind'];
  lineStatus?: TemplateLineItem['lineStatus'];
};

const PC  = ESTIMATE_SECTIONS[0]; // Pre-Construction (Soft Costs)
const SW  = ESTIMATE_SECTIONS[1]; // Site Work & Foundation
const SS  = ESTIMATE_SECTIONS[2]; // Structure / Shell
const MEP = ESTIMATE_SECTIONS[3]; // Rough MEP
const EF  = ESTIMATE_SECTIONS[4]; // Exterior Finish
const IF_ = ESTIMATE_SECTIONS[5]; // Interior Finish
const SPE = ESTIMATE_SECTIONS[6]; // Specialty / Optional
const CL  = ESTIMATE_SECTIONS[7]; // Closeout

const RAW_ITEMS: RawItem[] = [
  // ── Pre-Construction (Soft Costs) — 8 items ────────────────────────────────
  { trade: PC,  description: 'Plans & Specs',                                kind: 'subcontractor' },
  { trade: PC,  description: 'Engineering',                                  kind: 'subcontractor' },
  { trade: PC,  description: 'Interior Designer',                            kind: 'subcontractor' },
  { trade: PC,  description: 'SWPPP',                                        kind: 'subcontractor' },
  { trade: PC,  description: 'Building Permit',                              kind: 'material' },
  { trade: PC,  description: 'Lot Staking/Surveying',                        kind: 'subcontractor' },
  { trade: PC,  description: 'Temp Water & Power',                           kind: 'subcontractor' },
  { trade: PC,  description: 'Prep/Security',                                kind: 'material' },

  // ── Site Work & Foundation — 6 items ──────────────────────────────────────
  { trade: SW,  description: 'Excavation',                                   kind: 'subcontractor' },
  { trade: SW,  description: 'Lateral Utility Hookups',                      kind: 'subcontractor' },
  { trade: SW,  description: 'Concrete: Footings / Foundation',              kind: 'subcontractor' },
  { trade: SW,  description: 'Concrete: Flatwork (basement & garage floor)', kind: 'subcontractor' },
  { trade: SW,  description: 'Foundation Downproofing',                      kind: 'subcontractor' },
  { trade: SW,  description: 'Window Wells',                                 kind: 'subcontractor' },

  // ── Structure / Shell — 8 items ───────────────────────────────────────────
  { trade: SS,  description: 'Framing',                                      kind: 'subcontractor' },
  { trade: SS,  description: 'Structural Beams',                             kind: 'subcontractor' },
  { trade: SS,  description: 'Suspended Slab',                               kind: 'subcontractor' },
  { trade: SS,  description: 'Roofing',                                      kind: 'subcontractor' },
  { trade: SS,  description: 'Windows and Exterior Doors',                   kind: 'subcontractor' },
  { trade: SS,  description: 'Front Door',                                   kind: 'subcontractor' },
  { trade: SS,  description: 'Concrete: Self Leveling Concrete',             kind: 'subcontractor' },
  { trade: SS,  description: 'Garage Doors',                                 kind: 'subcontractor' },

  // ── Rough MEP — 6 items ────────────────────────────────────────────────────
  { trade: MEP, description: 'Plumbing',                                     kind: 'subcontractor' },
  { trade: MEP, description: 'HVAC',                                         kind: 'subcontractor' },
  { trade: MEP, description: 'Electrical',                                   kind: 'subcontractor' },
  { trade: MEP, description: 'AV (Theater/Audio/Networking)',                kind: 'subcontractor' },
  { trade: MEP, description: 'Gas Lines',                                    kind: 'subcontractor' },
  { trade: MEP, description: 'Insulation',                                   kind: 'subcontractor' },

  // ── Exterior Finish — 6 items ──────────────────────────────────────────────
  { trade: EF,  description: 'Fireplace Install',                            kind: 'subcontractor' },
  { trade: EF,  description: 'Brick',                                        kind: 'subcontractor' },
  { trade: EF,  description: 'Stone',                                        kind: 'subcontractor' },
  { trade: EF,  description: 'Stucco/Board and Batten',                      kind: 'subcontractor' },
  { trade: EF,  description: 'Gutter/Soffit',                               kind: 'subcontractor' },
  { trade: EF,  description: 'Permanent Lighting',                           kind: 'subcontractor' },

  // ── Interior Finish — 13 items ─────────────────────────────────────────────
  { trade: IF_, description: 'Sheet Rock',                                   kind: 'subcontractor' },
  { trade: IF_, description: 'Tile - Floors',                                kind: 'subcontractor', unit: 'sq ft' },
  { trade: IF_, description: 'Tile - Showers and Baths',                     kind: 'subcontractor' },
  { trade: IF_, description: 'Engineered Hardwood',                          kind: 'subcontractor', unit: 'sq ft' },
  { trade: IF_, description: 'LVP',                                          kind: 'subcontractor', unit: 'sq ft' },
  { trade: IF_, description: 'Carpet',                                       kind: 'subcontractor', unit: 'sq ft' },
  { trade: IF_, description: 'Interior Doors / Finish Trim',                 kind: 'subcontractor' },
  { trade: IF_, description: 'Stairway',                                     kind: 'subcontractor' },
  { trade: IF_, description: 'Door Handles/Bathroom Rods/Mirrors/Glass',     kind: 'subcontractor' },
  { trade: IF_, description: 'Cabinets',                                     kind: 'subcontractor' },
  { trade: IF_, description: 'Counter Tops - Granite',                       kind: 'subcontractor' },
  { trade: IF_, description: 'Paint',                                        kind: 'subcontractor' },
  { trade: IF_, description: 'Appliances',                                   kind: 'material' },

  // ── Specialty / Optional — 11 items (excluded from base price by default) ─
  { trade: SPE, description: 'Decks',                                        kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Exterior Railing',                             kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Landscape Design',                             kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Landscaping',                                  kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Master Closet Organizers',                     kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Furniture',                                    kind: 'material',      lineStatus: 'ex' },
  { trade: SPE, description: 'Decorative Beams',                             kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Pool',                                         kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Gym/Courts/Solar',                             kind: 'subcontractor', lineStatus: 'ex' },
  { trade: SPE, description: 'Sports Court Flooring',                        kind: 'subcontractor', lineStatus: 'ex', unit: 'sq ft' },
  { trade: SPE, description: 'Other',                                        kind: 'subcontractor', lineStatus: 'ex' },

  // ── Closeout — 4 items ─────────────────────────────────────────────────────
  { trade: CL,  description: 'Driveways/Walkways/Patios',                    kind: 'subcontractor' },
  { trade: CL,  description: 'Contingency',                                  kind: 'material',      lineStatus: 'allow' },
  { trade: CL,  description: 'Final Cleaning',                               kind: 'subcontractor' },
  { trade: CL,  description: 'Contractor Fee',                               kind: 'labor' },
];

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Returns a fresh copy of all 62 template items with new random UUIDs.
 * Call this each time you apply the template to avoid ID collisions.
 */
export function buildTemplateLineItems(): TemplateLineItem[] {
  return RAW_ITEMS.map(raw => ({
    id: crypto.randomUUID(),
    trade: raw.trade,
    description: raw.description,
    qty: 1,
    unit: raw.unit ?? 'lump sum',
    unitCost: 0,
    subCost: 0,
    total: 0,
    kind: raw.kind ?? 'subcontractor',
    lineStatus: raw.lineStatus ?? 'inc',
  }));
}

/** Backward-compatible alias for buildTemplateLineItems. */
export function buildEstimateTemplate(): TemplateLineItem[] {
  return buildTemplateLineItems();
}

/**
 * All 62 template items with stable placeholder IDs (for display/reference only).
 * For actual estimate creation, use buildTemplateLineItems() to get fresh UUIDs.
 */
export const ESTIMATE_TEMPLATE_ITEMS: TemplateLineItem[] = RAW_ITEMS.map((raw, i) => ({
  id: `template-${String(i + 1).padStart(3, '0')}`,
  trade: raw.trade,
  description: raw.description,
  qty: 1,
  unit: raw.unit ?? 'lump sum',
  unitCost: 0,
  subCost: 0,
  total: 0,
  kind: raw.kind ?? 'subcontractor',
  lineStatus: raw.lineStatus ?? 'inc',
}));
