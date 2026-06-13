// Project-type buckets used to organize schedule templates (and match a
// template to a project). Granular set per product direction.
export const PROJECT_TYPES = [
  'Custom Home',
  'Remodel',
  'Addition',
  'Basement',
  'Pool',
  'ADU',
  'Other',
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

// Map a project doc's stored `projectType` (legacy enum: new_build / remodel /
// addition) onto our display buckets so template matching lines up.
export function normalizeProjectType(raw?: string | null): ProjectType {
  const v = String(raw || '').toLowerCase();
  if (v === 'new_build' || v === 'custom home' || v === 'custom_home' || v === 'new build') return 'Custom Home';
  if (v === 'remodel') return 'Remodel';
  if (v === 'addition') return 'Addition';
  if (v === 'basement') return 'Basement';
  if (v === 'pool') return 'Pool';
  if (v === 'adu') return 'ADU';
  const hit = PROJECT_TYPES.find((t) => t.toLowerCase() === v);
  return (hit as ProjectType) || 'Other';
}
