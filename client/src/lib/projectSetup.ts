/**
 * Project setup completeness scorer.
 *
 * Given a draft (or live) project, returns what's filled in vs missing,
 * organized by the role that consumes the data. This is the single
 * source of truth for:
 *   - The Step 8 "Review & completeness" scorecard in the wizard
 *   - A compact completeness widget on /projects/:id/overview (so
 *     already-published projects can be audited too)
 *   - Any future "is this project ready to bid out?" gating
 *
 * Add a new field to the project model? Add a check here. The wizard +
 * overview widget pick it up automatically.
 */

import type { ProjectSetupDraft } from '@/types/projectSetup';

export type CompletenessSeverity = 'block' | 'warn' | 'ok';
export type CompletenessRole = 'gc' | 'client' | 'designer' | 'sub';

export interface CompletenessItem {
  /** Stable id — used as a React key + to wire "fix now" deep links. */
  id: string;
  /** Short human label, e.g. "Designer not assigned". */
  label: string;
  /** Which role is affected. One item can affect multiple roles —
   *  we duplicate per role so each role's scorecard is self-contained. */
  role: CompletenessRole;
  /** Severity:
   *    'block' — must be fixed before publishing (Create Project disabled)
   *    'warn'  — can publish but the role will see a gap
   *    'ok'    — present + valid (omitted from the missing list in UI) */
  severity: CompletenessSeverity;
  /** Optional URL fragment the wizard can jump to (e.g. 'team'). */
  jumpToStep?: string;
}

export interface CompletenessReport {
  /** Items grouped by role. Order within each role is stable. */
  byRole: Record<CompletenessRole, CompletenessItem[]>;
  /** Flat list, useful for "any blockers?" checks. */
  all: CompletenessItem[];
  /** True if there's at least one 'block' item — the wizard uses this
   *  to disable the Create button. */
  hasBlockers: boolean;
  /** 0-100. Pure cosmetic — drives the progress bar at the top of the
   *  scorecard. Counts each 'ok' check toward the total. */
  percent: number;
}

/**
 * Compute the completeness report. Pure.
 */
export function computeProjectCompleteness(p: Partial<ProjectSetupDraft>): CompletenessReport {
  const items: CompletenessItem[] = [];

  // ── GC (you) ────────────────────────────────────────────────────────
  items.push(check('gc-name', 'gc', 'identity', !!p.name?.trim(),
    'Project name', 'block'));
  items.push(check('gc-address', 'gc', 'identity', !!p.address?.trim(),
    'Project address', 'block'));
  items.push(check('gc-sqft', 'gc', 'identity', (p.squareFootage || 0) > 0,
    'Square footage', 'warn'));
  items.push(check('gc-budget', 'gc', 'budget', (p.estimatedBudget || 0) > 0,
    'Estimated budget', 'warn'));
  items.push(check('gc-pm', 'gc', 'team', !!p.projectManagerId,
    'Project manager assigned', 'warn'));

  // ── Client ──────────────────────────────────────────────────────────
  items.push(check('client-primary', 'client', 'clients', (p.clients?.length || 0) > 0,
    'Primary client', 'block'));
  items.push(check('client-email', 'client', 'clients',
    !!p.clients?.[0]?.email?.trim(),
    'Primary client email (needed for portal access)', 'block'));
  items.push(check('client-designer', 'client', 'team', !!p.designerContactId,
    'Designer assigned (so client sees selection options)', 'warn'));
  items.push(check('client-targetdate', 'client', 'identity', !!p.targetCompletion,
    'Target completion date', 'warn'));
  items.push(check('client-allowances', 'client', 'budget',
    Object.values(p.allowances || {}).some(v => v > 0),
    'At least one allowance set (so client knows the budget per category)', 'warn'));

  // ── Designer ────────────────────────────────────────────────────────
  items.push(check('designer-assigned', 'designer', 'team', !!p.designerContactId,
    'Designer assigned to this project', 'block'));
  items.push(check('designer-tier', 'designer', 'budget', !!p.finishTier?.trim(),
    'Finish tier (drives curation level)', 'warn'));
  items.push(check('designer-allowances', 'designer', 'budget',
    Object.values(p.allowances || {}).some(v => v > 0),
    'Per-category allowances (so designer curates within budget)', 'warn'));
  items.push(check('designer-plans', 'designer', 'plans', (p.plansDocIds?.length || 0) > 0,
    'Floor plans uploaded', 'warn'));

  // ── Subcontractors ──────────────────────────────────────────────────
  items.push(check('sub-address', 'sub', 'identity', !!p.address?.trim(),
    'Project address (so subs know the jobsite)', 'block'));
  items.push(check('sub-plans', 'sub', 'plans', (p.plansDocIds?.length || 0) > 0,
    'Plans uploaded (so subs can bid against actual drawings)', 'block'));
  items.push(check('sub-scope', 'sub', 'scope', !!p.scopeStatement?.trim(),
    'Scope statement (project context for bidding)', 'block'));
  items.push(check('sub-start', 'sub', 'timeline', !!p.startDate,
    'Projected start date (so subs can sequence their bid)', 'warn'));
  items.push(check('sub-budget', 'sub', 'budget', (p.estimatedBudget || 0) > 0,
    'Estimated budget (frames the bid range)', 'warn'));

  const byRole: Record<CompletenessRole, CompletenessItem[]> = {
    gc: items.filter(i => i.role === 'gc'),
    client: items.filter(i => i.role === 'client'),
    designer: items.filter(i => i.role === 'designer'),
    sub: items.filter(i => i.role === 'sub'),
  };
  const hasBlockers = items.some(i => i.severity === 'block');
  const okCount = items.filter(i => i.severity === 'ok').length;
  const percent = items.length === 0 ? 0 : Math.round((okCount / items.length) * 100);

  return { byRole, all: items, hasBlockers, percent };
}

/** Helper to build a check. If `present` is true the item is 'ok'
 *  (severity downgraded); otherwise it stays at the declared severity. */
function check(
  id: string,
  role: CompletenessRole,
  jumpToStep: string,
  present: boolean,
  label: string,
  whenMissing: 'block' | 'warn',
): CompletenessItem {
  return {
    id,
    role,
    jumpToStep,
    label,
    severity: present ? 'ok' : whenMissing,
  };
}
