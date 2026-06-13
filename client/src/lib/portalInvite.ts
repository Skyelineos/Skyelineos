import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { authFetch } from '@/lib/authFetch';
import {
  ensureSeedTemplates,
  listTemplates,
  type TemplateStage,
} from '@/lib/emailTemplates';

// Portal invite: writes a token doc to `portalInvites/{id}` and sends a real
// SendGrid email (via the /api/send-portal-invite backend route) rendered from
// a stored template. The old `mailto:` draft flow was removed — invites now go
// out automatically from the app.

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL || 'https://api-mtph34upva-uc.a.run.app';

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

interface SendOpts extends CreateOpts {
  /** Explicit template to send. */
  templateId?: string;
  /** When no templateId is given, prefer the first template for this stage. */
  preferStage?: TemplateStage;
}

// Creates an invite token and emails it via SendGrid using a stored template.
// Resolves the template by explicit id, else the first one for `preferStage`,
// else the first available. Returns the template name for the success toast.
export async function sendPortalInviteEmail(opts: SendOpts): Promise<{ templateName: string }> {
  await ensureSeedTemplates();
  const templates = await listTemplates();
  if (templates.length === 0) {
    throw new Error('No invite templates available — add one from “Invite to portal → Manage templates”.');
  }
  let chosen =
    (opts.templateId && templates.find(t => t.id === opts.templateId)) ||
    (opts.preferStage && templates.find(t => t.stage === opts.preferStage)) ||
    templates[0];

  const token = await createPortalInvite(opts);
  const res = await authFetch(`${API_BASE}/api/send-portal-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      email: opts.email,
      firstName: opts.firstName,
      templateId: chosen.id,
      contactId: opts.contactId,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Send failed (${res.status})`);
  }
  return { templateName: chosen.name };
}
