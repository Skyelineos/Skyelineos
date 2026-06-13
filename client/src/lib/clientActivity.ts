// Client portal engagement log. Append-only events written by the client
// (and other portal users) as they move through their portal, so the GC can
// see real engagement — logged in, opened selections, viewed an invoice,
// approved a selection. Best-effort: logging never blocks or breaks the UI.
import {
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export type ClientActivityType =
  | 'login'
  | 'view_tab'
  | 'view_selections'
  | 'view_invoice'
  | 'approve_selection'
  | 'other';

export interface ClientActivityEvent {
  id: string;
  uid: string;
  contactId?: string | null;
  projectId?: string | null;
  role?: string | null;
  type: ClientActivityType;
  label?: string | null;
  refType?: string | null;
  refId?: string | null;
  createdAt?: any;
}

interface LogOpts {
  uid: string;
  type: ClientActivityType;
  contactId?: string;
  projectId?: string;
  role?: string;
  label?: string;
  refType?: string;
  refId?: string;
  /** When set, the event is logged at most once per browser session for this key. */
  once?: string;
}

export async function logClientActivity(opts: LogOpts): Promise<void> {
  try {
    if (!opts.uid) return;
    if (opts.once) {
      const key = `cact:${opts.once}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
      } catch {
        /* sessionStorage may be unavailable; fall through and log anyway */
      }
    }
    await addDoc(collection(db, 'clientActivity'), {
      uid: opts.uid,
      contactId: opts.contactId ?? null,
      projectId: opts.projectId ?? null,
      role: opts.role ?? null,
      type: opts.type,
      label: opts.label ?? null,
      refType: opts.refType ?? null,
      refId: opts.refId ?? null,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Swallow — activity logging is non-critical and must never surface to the user.
  }
}

// Staff-side read: all activity for a given portal user (by their auth uid).
export async function fetchClientActivity(uid: string, max = 60): Promise<ClientActivityEvent[]> {
  if (!uid) return [];
  const q = query(
    collection(db, 'clientActivity'),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

const TYPE_LABEL: Record<ClientActivityType, string> = {
  login: 'Signed in',
  view_tab: 'Opened',
  view_selections: 'Viewed selections',
  view_invoice: 'Viewed invoice',
  approve_selection: 'Approved a selection',
  other: 'Activity',
};

export function describeActivity(e: ClientActivityEvent): string {
  if (e.type === 'view_tab' && e.label) return `Opened ${e.label}`;
  if (e.label) return `${TYPE_LABEL[e.type]} — ${e.label}`;
  return TYPE_LABEL[e.type] ?? 'Activity';
}
