/**
 * Trade → (plan categories, selection categories) smart defaults for the
 * bid package auto-attachment. Tyler can override per-package; this is the
 * default that gets pre-checked on the modal.
 *
 * Plan categories come from documents/{}.category — Step5Plans.tsx writes
 * them with sheet-type tags (S, A, E, M, P, R for structural/architectural/
 * electrical/mechanical/plumbing/roof).
 *
 * Selection categories come from projects/{id}/selections/{}.category —
 * SelectionsManager writes them as lower-case category names.
 */
export const TRADE_DEFAULTS: Record<string, {
  planCategories: string[];      // tags to match documents.category
  planSheetPrefixes: string[];   // tags to match documents.sheetPrefix (S, A, etc) — falls back to filename match
  selectionCategories: string[]; // values to match selections.category
  rationale: string;             // shown in modal tooltip
}> = {
  framing: {
    planCategories: ['plans', 'structural'],
    planSheetPrefixes: ['S', 'R'],   // S=structural, R=roof
    selectionCategories: [],          // framing rarely has client-selected items
    rationale: 'Structural + roof plans drive framing scope.',
  },
  cabinets: {
    planCategories: ['plans', 'architectural'],
    planSheetPrefixes: ['A'],
    selectionCategories: ['cabinets', 'cabinetry', 'kitchen', 'bath'],
    rationale: 'A sheets show cabinet elevations; client selections drive style + finish.',
  },
  plumbing: {
    planCategories: ['plans', 'plumbing'],
    planSheetPrefixes: ['P', 'A'],
    selectionCategories: ['plumbing', 'fixtures', 'appliances'],  // kitchen sinks, washer hookups
    rationale: 'Plumbing plans + fixture selections + appliances (kitchen, laundry).',
  },
  electrical: {
    planCategories: ['plans', 'electrical'],
    planSheetPrefixes: ['E', 'A'],
    selectionCategories: ['lighting', 'electrical', 'appliances'],
    rationale: 'Electrical plans + lighting fixture selections + appliances driving load.',
  },
  hvac: {
    planCategories: ['plans', 'mechanical'],
    planSheetPrefixes: ['M'],
    selectionCategories: [],
    rationale: 'Mechanical drawings drive HVAC scope.',
  },
  roofing: {
    planCategories: ['plans', 'architectural', 'roof'],
    planSheetPrefixes: ['A', 'R'],
    selectionCategories: ['roofing', 'roof'],
    rationale: 'A sheets show roof elevations; selections give material + color.',
  },
  tile: {
    planCategories: ['plans', 'architectural'],
    planSheetPrefixes: ['A'],
    selectionCategories: ['tile', 'flooring'],
    rationale: 'Architectural plans show tile locations; selections give product + grout.',
  },
  flooring: {
    planCategories: ['plans', 'architectural'],
    planSheetPrefixes: ['A'],
    selectionCategories: ['flooring', 'carpet', 'hardwood'],
    rationale: 'A sheets show layout; selections give product + finish.',
  },
  paint: {
    planCategories: ['plans', 'architectural'],
    planSheetPrefixes: ['A'],
    selectionCategories: ['paint'],
    rationale: 'A sheets show rooms; client paint selections give colors per surface.',
  },
  drywall: {
    planCategories: ['plans', 'architectural'],
    planSheetPrefixes: ['A'],
    selectionCategories: [],
    rationale: 'Architectural plans drive drywall scope.',
  },
  concrete: {
    planCategories: ['plans', 'structural', 'site'],
    planSheetPrefixes: ['S', 'C'],
    selectionCategories: [],
    rationale: 'Structural + site plans drive concrete scope.',
  },
  landscaping: {
    planCategories: ['plans', 'site'],
    planSheetPrefixes: ['C', 'L'],
    selectionCategories: ['landscaping', 'hardscape'],
    rationale: 'Site/landscape plans + client selections for hardscape + plants.',
  },
};

/** Fallback for trades not in the map — attach plans only, no selections. */
export const TRADE_DEFAULT_FALLBACK = {
  planCategories: ['plans'],
  planSheetPrefixes: [],
  selectionCategories: [],
  rationale: 'No specific mapping — attach all plans by default.',
} as const;

/** Resolve defaults for a trade label. Case + space insensitive. */
export function defaultsForTrade(trade: string) {
  const key = trade.trim().toLowerCase().replace(/\s+/g, '_');
  return TRADE_DEFAULTS[key] || TRADE_DEFAULT_FALLBACK;
}

/** Match a document against a trade's plan defaults. Returns true if it should be pre-checked. */
export function isDefaultPlanForTrade(
  doc: { category?: string; sheetPrefix?: string; filename?: string },
  trade: string,
): boolean {
  const d = defaultsForTrade(trade);
  if (doc.category && d.planCategories.includes(doc.category.toLowerCase())) return true;
  if (doc.sheetPrefix && d.planSheetPrefixes.includes(doc.sheetPrefix.toUpperCase())) return true;
  // Filename fallback: match leading sheet prefix from filename like "S-2.3.pdf" or "A-1.0_floor_plan.pdf"
  if (doc.filename) {
    const m = doc.filename.match(/^([A-Z])[-_.]/);
    if (m && d.planSheetPrefixes.includes(m[1])) return true;
  }
  return false;
}

/** Match a selection against a trade's selection defaults. Loose substring match. */
export function isDefaultSelectionForTrade(sel: { category?: string }, trade: string): boolean {
  const d = defaultsForTrade(trade);
  if (!sel.category) return false;
  const cat = sel.category.toLowerCase();
  return d.selectionCategories.some(c => cat.includes(c) || c.includes(cat));
}
