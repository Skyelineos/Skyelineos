// Client-side helper for sub-submitted invoice / pay-application.
//
// Two-step flow (attachment is optional):
//   1. If an attachment PDF/image is provided, upload it to
//      projects/{projectId}/sub-invoices/{subContactId}/{uuid}.{ext} (covered
//      by Stream 1's isOnProject() Storage rule).
//   2. POST /api/sub/invoices/submit with the invoice metadata. Server
//      validates the sub is awarded on the project and writes /financials
//      so the GC's existing Bills page surfaces it.

import { getAuth } from 'firebase/auth';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export interface SubmitSubInvoiceArgs {
  subContactId: string;
  projectId: string;
  invoiceNumber: string;
  amount: number;
  percentComplete: number;     // 0..100
  description?: string;
  attachment?: File;
  onProgress?: (pct: number) => void;
}

export interface SubmitSubInvoiceResult {
  ok: boolean;
  financialsId: string;
  invoiceNumber: string;
  amount: number;
  projectName?: string;
}

export const MAX_SUB_INVOICE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_PREFIXES = ['image/'];
const ALLOWED_EXACT = new Set(['application/pdf']);

export function isSubInvoiceAttachmentAllowed(file: File): boolean {
  if (file.size > MAX_SUB_INVOICE_BYTES) return false;
  if (ALLOWED_EXACT.has(file.type)) return true;
  return ALLOWED_PREFIXES.some(p => file.type.startsWith(p));
}

function sanitizeExt(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'bin';
}

function uuidish(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function apiBase(): string {
  return ((import.meta as any).env?.VITE_API_BASE_URL as string)
    || 'https://api-mtph34upva-uc.a.run.app';
}

export async function submitSubInvoice(
  args: SubmitSubInvoiceArgs,
): Promise<SubmitSubInvoiceResult> {
  const {
    subContactId, projectId, invoiceNumber, amount, percentComplete,
    description, attachment, onProgress,
  } = args;

  if (!subContactId || !projectId) throw new Error('Missing project or contact');
  if (!invoiceNumber?.trim()) throw new Error('Invoice number is required');
  if (!isFinite(amount) || amount <= 0) throw new Error('Amount must be positive');
  if (!isFinite(percentComplete) || percentComplete < 0 || percentComplete > 100) {
    throw new Error('Percent complete must be 0..100');
  }
  if (attachment && !isSubInvoiceAttachmentAllowed(attachment)) {
    throw new Error('Attachment must be PDF or image and under 10MB');
  }

  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in');
  const idToken = await user.getIdToken();

  let attachmentUrl: string | undefined;
  let storagePath: string | undefined;

  // ── Optional attachment upload ─────────────────────────────────────────
  if (attachment) {
    const ext = sanitizeExt(attachment.name);
    storagePath = `projects/${projectId}/sub-invoices/${subContactId}/${uuidish()}.${ext}`;
    const ref = storageRef(storage, storagePath);
    const task = uploadBytesResumable(ref, attachment, { contentType: attachment.type });
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        snap => onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100),
        err => reject(err),
        () => resolve(),
      );
    });
    attachmentUrl = await getDownloadURL(ref);
  }

  // ── Register in /financials via server ─────────────────────────────────
  const res = await fetch(`${apiBase()}/api/sub/invoices/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      subContactId,
      projectId,
      invoiceNumber: invoiceNumber.trim(),
      amount,
      percentComplete,
      description: description || '',
      attachmentUrl,
      storagePath,
      fileName: attachment?.name,
      mimeType: attachment?.type,
      sizeBytes: attachment?.size,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Invoice submission failed (HTTP ${res.status})`);
  }
  return (await res.json()) as SubmitSubInvoiceResult;
}
