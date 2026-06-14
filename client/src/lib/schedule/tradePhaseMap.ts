// The tunable knobs for estimate-derived scheduling:
//   1. PHASE_ORDER       — the build sequence
//   2. PHASE_DEFAULT_DAYS — starter calendar-day durations per phase (TUNE THESE)
//   3. phaseForTrade()    — which build phase a given trade belongs to
//
// Tyler can adjust the durations and trade→phase rules here without touching the
// generator math.

import type { BuildPhase } from './types';

export const PHASE_ORDER: BuildPhase[] = [
  'Pre-Construction',
  'Foundation',
  'Framing',
  'Rough-In',
  'Pre-Drywall',
  'Finish',
  'Closeout',
];

// Pre-Construction (permitting/mobilization) and Closeout (final/punch) always
// happen on a custom build, so they appear even if no estimate line maps to them.
export const ALWAYS_INCLUDE: BuildPhase[] = ['Pre-Construction', 'Closeout'];

// Starter durations in CALENDAR days, tuned so a full custom build totals
// ~12 months (365 days). Finish is the dominant phase. Tune to Skyeline's
// real numbers.
export const PHASE_DEFAULT_DAYS: Record<BuildPhase, number> = {
  'Pre-Construction': 45,
  'Foundation': 30,
  'Framing': 45,
  'Rough-In': 45,
  'Pre-Drywall': 20,
  'Finish': 150,
  'Closeout': 30,
};

// Friendly label shown when an always-include phase has no estimate line items.
export const PHASE_PLACEHOLDER_TASK: Record<BuildPhase, string> = {
  'Pre-Construction': 'Permitting & Mobilization',
  'Foundation': 'Foundation',
  'Framing': 'Framing',
  'Rough-In': 'Rough-Ins',
  'Pre-Drywall': 'Insulation & Pre-Drywall',
  'Finish': 'Finishes',
  'Closeout': 'Final Inspections & Punch List',
};

// Ordered keyword rules — first phase whose keywords match the (lowercased)
// trade name wins. Order matters: more specific phases are checked first so e.g.
// "finish carpentry" lands in Finish, not Framing.
const PHASE_KEYWORDS: Array<{ phase: BuildPhase; keywords: string[] }> = [
  { phase: 'Pre-Construction', keywords: [
    'permit', 'survey', 'site prep', 'sitework', 'excavat', 'demo', 'demolition',
    'temporary', 'mobiliz', 'engineering', 'design', 'soil', 'grading', 'erosion',
    'utility connect', 'septic', 'well',
  ] },
  { phase: 'Closeout', keywords: [
    'closeout', 'close-out', 'punch', 'final clean', 'final grade', 'occupancy',
    'landscap', 'driveway', 'final inspection', 'warranty', 'turnover',
  ] },
  { phase: 'Foundation', keywords: [
    'foundation', 'footing', 'concrete', 'slab', 'rebar', 'waterproof',
    'backfill', 'flatwork', 'stem wall', 'caisson', 'pier', 'damp proof',
  ] },
  { phase: 'Framing', keywords: [
    'framing', 'frame', 'lumber', 'truss', 'structural steel', 'steel',
    'sheathing', 'rough carpentry', 'deck framing', 'roof structure',
  ] },
  { phase: 'Rough-In', keywords: [
    'plumb', 'electric', 'hvac', 'mechanical', 'rough-in', 'rough in', 'roughin',
    'low voltage', 'low-voltage', 'fire sprinkler', 'sprinkler', 'gas',
    'roofing', 'roof', 'window', 'exterior door', 'dry-in', 'dryin', 'siding',
    'stucco', 'masonry', 'exterior',
  ] },
  { phase: 'Pre-Drywall', keywords: [
    'insulation', 'insulate', 'pre-drywall', 'predrywall', 'air seal', 'vapor',
  ] },
  { phase: 'Finish', keywords: [
    'drywall', 'sheetrock', 'paint', 'cabinet', 'trim', 'finish carpentry',
    'millwork', 'tile', 'floor', 'hardwood', 'carpet', 'countertop', 'counter top',
    'fixture', 'appliance', 'interior door', 'closet', 'mirror', 'glass', 'shower',
    'hardware', 'stair', 'railing', 'plaster', 'wallpaper', 'shelv', 'finish',
  ] },
];

/**
 * Resolve a trade name to a build phase. Unknown / generic trades fall back to
 * 'Finish' (the catch-all for miscellaneous interior scope).
 */
export function phaseForTrade(trade: string | undefined): BuildPhase {
  const t = (trade || '').toLowerCase().trim();
  if (!t) return 'Finish';
  for (const { phase, keywords } of PHASE_KEYWORDS) {
    if (keywords.some(k => t.includes(k))) return phase;
  }
  return 'Finish';
}
