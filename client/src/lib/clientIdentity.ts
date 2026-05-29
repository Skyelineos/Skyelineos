/**
 * Resolve the union of identifiers that might match a given client user
 * to project/bid/contact records.
 *
 * Background: the codebase has multiple writer paths that store client
 * identity differently:
 *   - `NewProjectForm` writes `clientIds: [contactId, ...]` (the canonical
 *     path) — primary array of contact-doc IDs.
 *   - `CreateProjectModal` + `EditProjectForm` write `clientId: contactId`
 *     (singular). Older path, still in some records.
 *   - The signed-in client's `user.id` is a number (legacy SQL id), NOT a
 *     contact-doc ID. Their contact is linked via `contact.linkedUserId =
 *     auth.uid`.
 *
 * Without resolving the bridge, every client-side query that filters by
 * "this user's projects" returns empty for real clients — the today feed
 * has been silently broken because of this.
 *
 * This helper returns every identifier we can find that a project document
 * might be keyed by, so callers can do `where('clientIds',
 * 'array-contains-any', resolved)` and hit any shape of record.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export interface ClientIdentitySet {
  /** Firebase Auth UID. Empty string if not signed in. */
  uid: string;
  /** Lowercased + trimmed auth email. Empty string if none. */
  email: string;
  /** Raw-cased email (in case a contact was created with weird casing). */
  emailRaw: string;
  /** Stringified user.id from the legacy user object — sometimes used as
   *  clientId on older projects. */
  legacyUserIdStr: string;
  /** Contact-doc IDs where linkedUserId or email matches the signed-in user. */
  contactIds: string[];
  /** Combined identifier list ready to feed into array-contains-any.
   *  Capped at 10 (Firestore's limit). De-duped. */
  arrayContainsAny: string[];
}

interface ResolveArgs {
  /** Auth UID — pass auth.currentUser?.uid OR the impersonated UID. */
  uid: string;
  /** Auth email — pass auth.currentUser?.email OR the impersonated email. */
  email: string;
  /** Optional legacy user.id from the user doc — adds another candidate. */
  legacyUserId?: string | number;
  /** When admin is impersonating, the viewed user's contact-doc id. The
   *  helper folds it into the contact set so projects keyed by THAT id
   *  resolve too. */
  impersonatedContactId?: string;
}

/**
 * Pure-async lookup: takes the raw inputs, hits Firestore for matching
 * contacts, and returns the full identifier set.
 *
 * Caller decides where the inputs come from (typical: `useAuth()` for the
 * real user; `useAdminView()` for impersonation). This stays pure so the
 * tests don't need a hook environment.
 */
export async function resolveClientIdentity(args: ResolveArgs): Promise<ClientIdentitySet> {
  const uid = args.uid || '';
  const email = (args.email || '').toLowerCase().trim();
  const emailRaw = (args.email || '').trim();
  const legacyUserIdStr = args.legacyUserId != null ? String(args.legacyUserId) : '';

  const contactIds = new Set<string>();
  if (args.impersonatedContactId) contactIds.add(args.impersonatedContactId);

  try {
    if (uid) {
      const s = await getDocs(query(collection(db, 'contacts'), where('linkedUserId', '==', uid)));
      s.docs.forEach(d => contactIds.add(d.id));
    }
    if (email) {
      const s = await getDocs(query(collection(db, 'contacts'), where('email', '==', email)));
      s.docs.forEach(d => contactIds.add(d.id));
      if (emailRaw && emailRaw !== email) {
        const s2 = await getDocs(query(collection(db, 'contacts'), where('email', '==', emailRaw)));
        s2.docs.forEach(d => contactIds.add(d.id));
      }
    }
  } catch (e) {
    console.warn('[clientIdentity] contact resolve failed', e);
  }

  const all = new Set<string>();
  if (uid) all.add(uid);
  if (legacyUserIdStr) all.add(legacyUserIdStr);
  if (email) all.add(email);
  if (emailRaw && emailRaw !== email) all.add(emailRaw);
  contactIds.forEach(id => all.add(id));

  const arrayContainsAny = Array.from(all).filter(Boolean).slice(0, 10);

  return {
    uid,
    email,
    emailRaw,
    legacyUserIdStr,
    contactIds: Array.from(contactIds),
    arrayContainsAny,
  };
}

/** Convenience wrapper that pulls from the live Firebase Auth user. */
export async function resolveCurrentClientIdentity(legacyUserId?: string | number): Promise<ClientIdentitySet> {
  const authUser = auth.currentUser;
  return resolveClientIdentity({
    uid: authUser?.uid || '',
    email: authUser?.email || '',
    legacyUserId,
  });
}
