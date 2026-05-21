// Additive extensions to the existing Selection model in client/src/types/selections.ts
// Merge these fields into your `Selection` interface (and optionally CatalogItem).
//
// These fields are added when a selection is seeded from the standard template.
// All are optional so existing à la carte selections continue to work unchanged.

import type { BuildPhase, DecisionOwner } from '@/data/selectionsTemplate';

export interface SelectionTemplateFields {
  /** Stable id from the standard template — used for idempotent re-seeding */
  templateItemId?: string;
  /** Version of the template that seeded this row — surface when out of date */
  templateVersion?: string;
  /** Subcategory string from the template, e.g. "Site & Sitework" */
  subcategory?: string;
  /** The plain-English item label from the template, e.g. "Driveway material" */
  item?: string;
  /** Build phase by which this selection must be locked */
  phase?: BuildPhase;
  /** Who owns the decision */
  decisionOwner?: DecisionOwner;
  /** Status across the full lifecycle — replaces / parallels orderStatus */
  status?: 'Not Started' | 'In Discussion' | 'Selected' | 'Ordered' | 'Received' | 'Installed';
  /** Designer-set allowance budget */
  allowanceAmount?: number | null;
  /** Actual landed cost (sum of selected items + freight + taxes) */
  actualCost?: number | null;
  /** Client option pick id from sel.items[] when approved */
  selectedOptionId?: string;
  /** Audit */
  seededBy?: string;
  seededAt?: any;
  clientApprovedAt?: any;
  clientApprovedBy?: string;
}

/**
 * To add these to your existing model, edit client/src/types/selections.ts:
 *
 *   import type { SelectionTemplateFields } from './selections-template-extensions';
 *
 *   export interface Selection extends SelectionTemplateFields {
 *     // ...existing fields
 *   }
 */
