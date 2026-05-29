/**
 * Shared types for the Project Setup Wizard.
 *
 * A `ProjectDraft` is just a partial project doc that lives in the same
 * `projects` collection with `status: 'draft'`. The wizard incrementally
 * fills it in across N steps; the final "Create project" action flips
 * status to 'active'. Reusing the projects collection (vs a separate
 * `projectDrafts` collection) means we get listing + resume + cleanup
 * mostly for free, and there's no schema migration when the wizard
 * ships.
 *
 * Adding a new step? Add the fields it captures here, bump the step
 * list in the wizard, extend the completeness scorer in
 * `lib/projectSetup.ts`. That's it.
 */

import type { Timestamp } from 'firebase/firestore';

/** Suggested finish tier labels — purely cosmetic, the user can rename or
 *  replace these per project. No $/sqft anchor on purpose; the user's
 *  cost structure is in flux. */
export const FINISH_TIER_SUGGESTIONS = ['Standard', 'Premium', 'Luxury'] as const;
export type FinishTierSuggestion = (typeof FINISH_TIER_SUGGESTIONS)[number];

/** Default allowance categories. Editable per project so unusual builds
 *  (workshop, accessory dwelling unit, etc.) can drop irrelevant ones. */
export const DEFAULT_ALLOWANCE_CATEGORIES = [
  'Kitchen',
  'Bath',
  'Flooring',
  'Lighting',
  'Plumbing fixtures',
  'Appliances',
  'Cabinetry',
  'Tile',
  'Countertops',
  'Exterior finishes',
  'Landscaping',
] as const;

/** A single client on the project. Two-client households (married couples)
 *  are common; the wizard supports primary + secondary slots. */
export interface ProjectClientRef {
  contactId: string;
  name: string;
  email?: string;
  phone?: string;
  /** Set when the contact was created INSIDE the wizard, vs picked from
   *  the existing contacts list. Useful for telemetry / debugging. */
  createdInWizard?: boolean;
}

/** A team member on the project — designer, PM, lead carpenter, etc. */
export interface ProjectTeamRef {
  contactId: string;
  name: string;
  email?: string;
  phone?: string;
  /** Role on THIS project. Stored on the project so the same contact
   *  could be a designer on one and a PM on another. */
  role: 'designer' | 'projectManager' | 'leadCarpenter' | 'superintendent';
}

/** Per-category allowance — caller stores categories as a Record so the
 *  wizard can edit / remove individual entries cleanly. */
export type AllowancesMap = Record<string, number>;

/** Milestone on the construction timeline. Drives the client's schedule
 *  view + the sub-bid window. */
export interface ProjectMilestone {
  id: string;
  name: string;
  /** YYYY-MM-DD — string for easier form binding. */
  targetDate: string;
  status: 'planned' | 'in_progress' | 'done';
}

/** The full shape the wizard incrementally fills in. Stored as a regular
 *  project doc with status='draft' until the user publishes. */
export interface ProjectSetupDraft {
  id?: string;

  // ── Step 1: Identity ────────────────────────────────────────────────
  name: string;
  projectCode?: string;
  address: string;
  squareFootage: number;
  targetCompletion: string;     // YYYY-MM-DD

  // ── Step 2: Clients ─────────────────────────────────────────────────
  clients: ProjectClientRef[];  // [primary, ...optional spouse]
  clientName?: string;          // denormalized for list views
  clientEmail?: string;
  clientPhone?: string;

  // ── Step 3: Team ────────────────────────────────────────────────────
  team: ProjectTeamRef[];
  designerContactId?: string;
  designerName?: string;
  projectManagerId?: string;
  projectManagerName?: string;

  // ── Step 4: Budget & tier ───────────────────────────────────────────
  estimatedBudget?: number;
  finishTier?: string;
  allowances?: AllowancesMap;

  // ── Step 5: Plans & docs ────────────────────────────────────────────
  plansDocIds?: string[];

  // ── Step 6: Timeline ────────────────────────────────────────────────
  startDate?: string;
  milestones?: ProjectMilestone[];

  // ── Step 7: Scope ───────────────────────────────────────────────────
  scopeStatement?: string;
  specialConsiderations?: string;

  // ── Bookkeeping ─────────────────────────────────────────────────────
  status: 'draft' | 'planning' | 'active';
  /** Step index the user last completed (0-based). Used to resume. */
  setupStep?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
}

/** Step IDs — used both as keys and as URL segments. Kept stable; if a
 *  step is removed it stays in this enum so old drafts can still resolve
 *  their `setupStep` to a known label. */
export const WIZARD_STEPS = [
  'identity',
  'clients',
  'team',
  'budget',
  'plans',
  'timeline',
  'scope',
  'review',
] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABELS: Record<WizardStepId, string> = {
  identity: 'Project basics',
  clients:  'Clients',
  team:     'Team',
  budget:   'Budget & tier',
  plans:    'Plans & docs',
  timeline: 'Timeline',
  scope:    'Scope statement',
  review:   'Review',
};
