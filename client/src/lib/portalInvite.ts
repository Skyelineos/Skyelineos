import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Portal invite: writes a token doc to `portalInvites/{id}` and opens the
// user's mail client (`mailto:`) with a pre-filled message that includes a
// sign-up link. No SendGrid required — the GC sends from their own email.

function randomToken(): string {
  // ~22 chars of crypto-random URL-safe text.
  const bytes = new Uint8Array(16);
  (globalThis.crypto || (window as any).crypto).getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 22);
}

interface CreateOpts {
  contactId: string;
  email: string;
  role: string;
  firstName?: string;
  invitedBy?: string;
}

export async function createPortalInvite(opts: CreateOpts): Promise<string> {
  const token = randomToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await addDoc(collection(db, 'portalInvites'), {
    token,
    contactId: opts.contactId,
    email: String(opts.email || '').trim().toLowerCase(),
    role: opts.role,
    firstName: opts.firstName || '',
    invitedBy: opts.invitedBy || '',
    status: 'pending',
    expiresAt: expiresAt.toISOString(),
    createdAt: serverTimestamp(),
  });
  return token;
}

interface MailOpts {
  email: string;
  firstName?: string;
  token: string;
}

function appBaseUrl(): string {
  if (typeof window === 'undefined') return 'https://skyelineos.web.app';
  return `${window.location.protocol}//${window.location.host}`;
}

export function buildInviteLink(token: string): string {
  return `${appBaseUrl()}/sign-in?invite=${encodeURIComponent(token)}`;
}

export function openInviteMail(opts: MailOpts) {
  const link = buildInviteLink(opts.token);
  const hi = opts.firstName ? `Hi ${opts.firstName},` : 'Hi,';
  const subject = encodeURIComponent('Your Skyeline Homes portal invitation');
  const body = encodeURIComponent(
    `${hi}\n\n`
    + `You're invited to join the Skyeline Homes portal — you'll be able to see your project status, plans, selections, and messages in one place.\n\n`
    + `Tap to set up your account:\n${link}\n\n`
    + `If the link doesn't open, copy and paste it into your browser. The invite is valid for 30 days.\n\n`
    + `— Skyeline Homes`,
  );
  window.location.href = `mailto:${encodeURIComponent(opts.email)}?subject=${subject}&body=${body}`;
}
