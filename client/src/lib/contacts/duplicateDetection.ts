import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Duplicate-contact detection shared by the Lead channel (Sales.tsx) and the
// Add-Contact channel (Contacts.tsx). Both channels write a row into the
// `contacts` collection (a new lead also creates a `type: 'client'` contact
// twin), so matching against `contacts` alone catches existing leads too.
//
// We surface a potential duplicate when the new entry shares ANY of the four
// fields the operator cares about: name, email, phone, or address. Email/phone
// matches are treated as STRONG (near-certain same person); a name or address
// match alone is WEAK (could be a coincidence — a common name, or two people at
// the same build address). The UI lets the operator decide: merge, create a new
// record anyway, or cancel and edit.

export type MatchField = 'name' | 'email' | 'phone' | 'address';

export interface DuplicateCandidate {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  // Lead channel supplies a job address; Add-Contact does not. Either is fine.
  address?: string;
  city?: string;
}

export interface DuplicateMatch {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  role: string;
  /** Which fields matched the new entry. */
  matchedOn: MatchField[];
  /** strong = email or phone matched; weak = only name/address matched. */
  strength: 'strong' | 'weak';
  /** Raw contact data, so callers can compute a non-destructive merge. */
  data: Record<string, any>;
}

// --- Normalizers (kept consistent with the rest of the codebase) ----------

/** Email: trim + lowercase. Mirrors duplicateEmail.ts / ensureContactAuth.ts. */
export function normalizeEmail(s: string | undefined | null): string {
  return String(s || '').trim().toLowerCase();
}

/** Phone: digits only, last 10. Mirrors postSignupLinkRoute.ts normalizePhone. */
export function normalizePhone(s: string | undefined | null): string {
  return String(s || '').replace(/\D/g, '').slice(-10);
}

/** Name: lowercase, strip punctuation, collapse whitespace. */
export function normalizeName(s: string | undefined | null): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Address: lowercase, expand a few common abbreviations, strip punctuation. */
export function normalizeAddress(s: string | undefined | null): string {
  let a = String(s || '').toLowerCase();
  a = a.replace(/[^a-z0-9\s]/g, ' ');
  // Light directional / street-type normalization so "19 W 4750 N" and
  // "19 west 4750 north" collapse together.
  const abbr: Record<string, string> = {
    n: 'north', s: 'south', e: 'east', w: 'west',
    st: 'street', ave: 'avenue', rd: 'road', blvd: 'boulevard',
    dr: 'drive', ln: 'lane', ct: 'court', cir: 'circle', hwy: 'highway',
  };
  a = a
    .split(/\s+/)
    .map(tok => abbr[tok] || tok)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return a;
}

function candidateName(c: DuplicateCandidate): string {
  const joined = `${c.firstName || ''} ${c.lastName || ''}`.trim();
  return normalizeName(c.name || joined);
}

// --- Detection -------------------------------------------------------------

/**
 * Find existing contacts that look like duplicates of `candidate`. Scans the
 * full `contacts` collection (the established pattern — see duplicateEmail.ts;
 * a single-GC business has a small contact set). Returns strong matches first.
 *
 * @param excludeId  A contact id to skip (when editing an existing record).
 */
export async function findDuplicateContacts(
  candidate: DuplicateCandidate,
  opts: { excludeId?: string } = {},
): Promise<DuplicateMatch[]> {
  const nName = candidateName(candidate);
  const nEmail = normalizeEmail(candidate.email);
  const nPhone = normalizePhone(candidate.phone);
  const nAddr = normalizeAddress(candidate.address);

  // Nothing identifiable to match on — don't scan.
  if (!nName && !nEmail && !nPhone && !nAddr) return [];

  const snap = await getDocs(collection(db, 'contacts'));
  const matches: DuplicateMatch[] = [];

  for (const docSnap of snap.docs) {
    if (docSnap.id === opts.excludeId) continue;
    const d = docSnap.data() as any;

    const dName = normalizeName(d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim());
    const dEmail = normalizeEmail(d.email);
    const dPhone = normalizePhone(d.phone);
    // Contacts may store the address under `address` (lead twin) or `jobAddress`.
    const dAddr = normalizeAddress(d.address || d.jobAddress);

    const matchedOn: MatchField[] = [];
    if (nEmail && dEmail && nEmail === dEmail) matchedOn.push('email');
    if (nPhone && dPhone && nPhone === dPhone) matchedOn.push('phone');
    if (nName && dName && nName === dName) matchedOn.push('name');
    if (nAddr && dAddr && nAddr === dAddr) matchedOn.push('address');

    if (matchedOn.length === 0) continue;

    const strength: DuplicateMatch['strength'] =
      matchedOn.includes('email') || matchedOn.includes('phone') ? 'strong' : 'weak';

    matches.push({
      id: docSnap.id,
      name: String(d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unnamed contact'),
      email: String(d.email || ''),
      phone: String(d.phone || ''),
      company: String(d.company || ''),
      address: String(d.address || d.jobAddress || ''),
      city: String(d.city || ''),
      role: String(d.role || d.type || ''),
      matchedOn,
      strength,
      data: d,
    });
  }

  // Strong matches first, then by how many fields matched.
  return matches.sort((a, b) => {
    if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
    return b.matchedOn.length - a.matchedOn.length;
  });
}

/**
 * Compute a NON-DESTRUCTIVE merge patch: fill in fields that are blank on the
 * existing contact (`target`) from the new entry (`candidate`). Never overwrites
 * a value the existing record already has — the operator can edit those by hand
 * if needed. Returns only the fields that would actually change.
 */
export function computeMergeUpdates(
  target: Record<string, any>,
  candidate: DuplicateCandidate,
): Record<string, any> {
  const updates: Record<string, any> = {};
  const isBlank = (v: any) => v === undefined || v === null || String(v).trim() === '';

  const joinedName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
  const fields: Array<[string, any]> = [
    ['name', candidate.name || joinedName],
    ['firstName', candidate.firstName],
    ['lastName', candidate.lastName],
    ['email', candidate.email],
    ['phone', candidate.phone],
    ['company', candidate.company],
    ['address', candidate.address],
    ['city', candidate.city],
  ];

  for (const [key, value] of fields) {
    if (!isBlank(value) && isBlank(target[key])) {
      updates[key] = value;
    }
  }
  return updates;
}

const FIELD_LABEL: Record<MatchField, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
};

/** Human-readable summary of which fields matched, e.g. "Email and phone". */
export function describeMatch(matchedOn: MatchField[]): string {
  const labels = matchedOn.map(f => FIELD_LABEL[f]);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1].toLowerCase()}`;
  return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1].toLowerCase();
}
