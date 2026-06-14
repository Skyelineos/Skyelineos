import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Names of OTHER contacts already using `email` (case-insensitive). Backs the
// soft duplicate-email warning: Firebase Auth allows one account per email, so
// contacts that share an email can't each get their own portal login — only one
// gets linked and the rest are left without portal access.
export async function contactsWithEmail(email: string, excludeId?: string): Promise<string[]> {
  const norm = email.trim().toLowerCase();
  if (!norm) return [];
  const snap = await getDocs(collection(db, 'contacts'));
  return snap.docs
    .filter(d => d.id !== excludeId)
    .filter(d => String((d.data() as any).email || '').trim().toLowerCase() === norm)
    .map(d => {
      const data = d.data() as any;
      return String(data.name || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unnamed contact');
    });
}

// Browser confirm for the soft warning. Returns true to proceed anyway.
export function confirmDuplicateEmail(email: string, names: string[]): boolean {
  const who = names.length === 1
    ? `“${names[0]}” already uses`
    : `${names.length} other contacts already use`;
  return window.confirm(
    `${who} ${email}.\n\n`
    + (names.length > 1 ? `${names.join(', ')}\n\n` : '')
    + `Contacts that share an email can't each have their own portal login — only one `
    + `can be linked, and the others won't get portal access. Add anyway?`,
  );
}
