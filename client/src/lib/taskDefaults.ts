/**
 * taskDefaults — pick a sensible default assignee for a new task so the user
 * doesn't have to manually pick every time. Heuristics in priority order:
 *
 *   1. Trade-scoped task on a project with an awarded sub for that trade
 *      → that sub.
 *   2. Selection / design-related task → project's designer.
 *   3. Client-facing task → primary client on the project.
 *   4. Bid-related task → GC (project's GC / creator / admin).
 *   5. Project has an assigned project manager → that PM.
 *   6. Fallback → caller-supplied `defaultFallbackUserId` (typically the GC /
 *      currently signed-in admin).
 *
 * The result is **a default, not a hard assignment** — callers should
 * pre-populate the assignee field and let the user override before saving.
 *
 * This helper is intentionally side-effect-free: it takes everything it needs
 * as arguments. Callers fetch projects + bids + contacts however they prefer
 * (most call sites already subscribe to these collections for other reasons).
 */

import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type TaskAssigneeKind =
  | 'selection'        // designer
  | 'bid'              // GC
  | 'client_action'    // primary client
  | 'walkthrough'      // primary client (+ cc GC handled by caller)
  | 'site'             // PM or trade sub if known
  | 'admin'            // GC / fallback
  | 'generic';         // generic — runs full heuristic ladder

export interface DefaultAssigneeArgs {
  taskKind?: TaskAssigneeKind;
  projectId?: string;
  /** Trade name like "Plumbing", "Tile". Optional — only used for rung 1. */
  trade?: string;
  /** UID/contact id of caller — used as the ultimate fallback so unassigned
   *  doesn't happen by accident. */
  defaultFallbackUserId?: string;
  defaultFallbackUserName?: string;
}

export interface DefaultAssignee {
  assignedToId: string;
  assignedToName: string;
  /** Which rung of the ladder fired — useful for logs/debugging only. */
  reason:
    | 'awarded_sub_for_trade'
    | 'project_designer'
    | 'primary_client'
    | 'project_pm'
    | 'project_gc'
    | 'fallback'
    | 'none';
}

const empty = (reason: DefaultAssignee['reason'] = 'none'): DefaultAssignee => ({
  assignedToId: '',
  assignedToName: '',
  reason,
});

/**
 * Run the heuristic ladder. Returns the first match, or the fallback, or
 * empty if even the fallback was missing.
 */
export async function getDefaultAssigneeForTask(args: DefaultAssigneeArgs): Promise<DefaultAssignee> {
  const { taskKind = 'generic', projectId, trade, defaultFallbackUserId, defaultFallbackUserName } = args;

  // No project context — nothing to infer from. Use fallback directly.
  if (!projectId) {
    return defaultFallbackUserId
      ? { assignedToId: defaultFallbackUserId, assignedToName: defaultFallbackUserName || '', reason: 'fallback' }
      : empty();
  }

  // Load project once — every rung needs it.
  let project: any = null;
  try {
    const snap = await getDoc(doc(db, 'projects', projectId));
    if (snap.exists()) project = snap.data();
  } catch (e) {
    console.warn('[taskDefaults] project lookup failed', e);
  }
  if (!project) {
    return defaultFallbackUserId
      ? { assignedToId: defaultFallbackUserId, assignedToName: defaultFallbackUserName || '', reason: 'fallback' }
      : empty();
  }

  // Rung 1 — trade-scoped + awarded sub. Look up bidRequests on this project
  // where the trade matches and an award has been made.
  if (trade && (taskKind === 'site' || taskKind === 'generic')) {
    try {
      const bidReqsSnap = await getDocs(query(
        collection(db, 'projects', projectId, 'bidRequests'),
        where('trade', '==', trade),
        where('status', 'in', ['awarded', 'closed']),
      ));
      for (const d of bidReqsSnap.docs) {
        const data = d.data() as any;
        // Awarded vendor on the bid request — pull from `awardedBidId` /
        // `awardedVendor` if the project model uses it; otherwise look at
        // the first vendor with status === 'awarded'.
        const awarded = (data.vendors || []).find((v: any) => v.bidStatus === 'awarded' || v.awardedAt);
        if (awarded) {
          const id = awarded.linkedUserId || awarded.contactId || awarded.email || '';
          const name = awarded.vendorName || awarded.name || '';
          if (id) return { assignedToId: id, assignedToName: name, reason: 'awarded_sub_for_trade' };
        }
      }
    } catch (e) {
      console.warn('[taskDefaults] awarded sub lookup failed', e);
    }
  }

  // Rung 2 — selection / design task → project's designer.
  if (taskKind === 'selection') {
    if (project.designerContactId || project.designerName) {
      return {
        assignedToId: project.designerContactId || '',
        assignedToName: project.designerName || '',
        reason: 'project_designer',
      };
    }
  }

  // Rung 3 — client-facing task → primary client.
  if (taskKind === 'client_action' || taskKind === 'walkthrough') {
    const primaryClientId = Array.isArray(project.clientIds) && project.clientIds.length > 0
      ? project.clientIds[0]
      : '';
    if (primaryClientId || project.clientName) {
      return {
        assignedToId: primaryClientId,
        assignedToName: project.clientName || '',
        reason: 'primary_client',
      };
    }
  }

  // Rung 4 — bid-related task → GC. Falls through to project PM / fallback
  // below since there's no dedicated GC field on the project model today.

  // Rung 5 — project has an assigned PM (either top-level or under
  // projectMetadata.assignedProjectManager — NewProjectForm currently writes
  // it into the metadata JSON blob).
  let pmId = project.projectManagerId || '';
  let pmName = project.projectManagerName || '';
  if (!pmId && typeof project.projectMetadata === 'string') {
    try {
      const meta = JSON.parse(project.projectMetadata) as any;
      if (meta?.assignedProjectManager) {
        pmId = meta.assignedProjectManager;
      }
    } catch { /* invalid JSON — skip */ }
  }
  if (pmId) {
    return { assignedToId: pmId, assignedToName: pmName, reason: 'project_pm' };
  }

  // Rung 6 — fallback (GC / creator).
  if (defaultFallbackUserId) {
    return {
      assignedToId: defaultFallbackUserId,
      assignedToName: defaultFallbackUserName || '',
      reason: 'fallback',
    };
  }

  return empty();
}

/**
 * Convenience: infer the TaskAssigneeKind from a free-text title using simple
 * keyword matching. Lets the Tasks page call the heuristic without forcing
 * callers to classify their own tasks. Conservative — returns 'generic' when
 * nothing matches.
 */
export function inferTaskKindFromTitle(title: string): TaskAssigneeKind {
  const t = title.toLowerCase();
  if (/(selection|finish|tile choice|paint choice|fixture|appliance|cabinet)/.test(t)) return 'selection';
  if (/(bid|estimate|quote|proposal)/.test(t)) return 'bid';
  if (/(walkthrough|punch list|punch-list|client walk)/.test(t)) return 'walkthrough';
  if (/(client|owner|homeowner|approve|sign off|sign-off)/.test(t)) return 'client_action';
  if (/(install|frame|rough[- ]in|trim|grade|excavat|concrete|drywall|paint|inspect)/.test(t)) return 'site';
  return 'generic';
}
