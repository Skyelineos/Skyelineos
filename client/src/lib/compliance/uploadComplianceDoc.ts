// Client-side helper for sub compliance doc upload.
//
// Two-step flow:
//   1. Upload the file directly to Firebase Storage at
//      projects/{projectId}/compliance/{subContactId}/{type}-{ts}.{ext}.
//      Stream 1's isOnProject(projectId) Storage rule already covers this
//      path — no rule edit needed.
//   2. Call POST /api/compliance/upload with the metadata so the server
//      can write Firestore (contacts/{subContactId}.compliance.{type} +
//      the legacy users/{uid} mirror that awardBidRoute.ts reads).
//
// Both steps are required — step 1 alone leaves an orphan file; step 2
// alone has no file to point at.

import { getAuth } from 'firebase/auth';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export type ComplianceType = 'w9' | 'coi' | 'agreement' | 'contractorLicense';

export interface UploadComplianceDocArgs {
  file: File;
  type: ComplianceType;
  subContactId: string;
  projectId: string;
  expiresAt?: string;                  // ISO date, required for type='coi'
  contractorLicenseNumber?: string;    // required for type='contractorLicense'
  onProgress?: (pct: number) => void;
}

export interface UploadComplianceDocResult {
  ok: boolean;
  type: ComplianceType;
  fileUrl: string;
  storagePath: string;
  mirroredUserFlags?: string[];
}

export const MAX_COMPLIANCE_BYTES = 10 * 1024 * 1024; // 10MB — keep in lockstep with server

const ALLOWED_PREFIXES = ['image/'];
const ALLOWED_EXACT = new Set(['application/pdf']);

export function isComplianceFileAllowed(file: File): boolean {
  if (file.size > MAX_COMPLIANCE_BYTES) return false;
  if (ALLOWED_EXACT.has(file.type)) return true;
  return ALLOWED_PREFIXES.some(p => file.type.startsWith(p));
}

function sanitizeExt(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'bin';
}

function apiBase(): string {
  return ((import.meta as any).env?.VITE_API_BASE_URL as string)
    || 'https://api-mtph34upva-uc.a.run.app';
}

export async function uploadComplianceDoc(
  args: UploadComplianceDocArgs,
): Promise<UploadComplianceDocResult> {
  const { file, type, subContactId, projectId, expiresAt, contractorLicenseNumber, onProgress } = args;

  if (!isComplianceFileAllowed(file)) {
    throw new Error('File must be PDF or image and under 10MB');
  }
  if (type === 'coi' && !expiresAt) {
    throw new Error('Certificate of Insurance requires an expiry date');
  }
  if (type === 'contractorLicense' && !String(contractorLicenseNumber || '').trim()) {
    throw new Error('Contractor license requires a license number');
  }

  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in');
  const idToken = await user.getIdToken();

  // ── Step 1: direct Storage upload ──────────────────────────────────────
  const ts = Date.now();
  const ext = sanitizeExt(file.name);
  const storagePath = `projects/${projectId}/compliance/${subContactId}/${type}-${ts}.${ext}`;
  const ref = storageRef(storage, storagePath);
  const task = uploadBytesResumable(ref, file, { contentType: file.type });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      snap => onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100),
      err => reject(err),
      () => resolve(),
    );
  });
  const fileUrl = await getDownloadURL(ref);

  // ── Step 2: register Firestore side ────────────────────────────────────
  const res = await fetch(`${apiBase()}/api/compliance/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      subContactId,
      projectId,
      type,
      storagePath,
      fileName: file.name,
      fileUrl,
      sizeBytes: file.size,
      mimeType: file.type,
      expiresAt,
      contractorLicenseNumber,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Upload registration failed (HTTP ${res.status})`);
  }
  const body = await res.json();
  return {
    ok: true,
    type,
    fileUrl,
    storagePath,
    mirroredUserFlags: body.mirroredUserFlags,
  };
}
