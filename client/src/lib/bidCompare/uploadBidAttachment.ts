// Firebase Storage upload helper for the Bid Leveling tool. Mirrors
// uploadEstimateAttachment.ts. Files land under
//   projects/{projectId}/bid-compare/{uuid}.{ext}
// which storage.rules gate via isOnProject(projectId) — the {projectId}/ prefix
// is LOAD-BEARING. A file outside that prefix is rejected at write time, which
// is why the tool requires a project selection before uploading.

import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface UploadedBidAttachment {
  url: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getExtension(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : '';
  if (fromName) return fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'text/plain') return 'txt';
  return 'bin';
}

/**
 * Upload one bid or plan file for the bid-compare tool and return its metadata.
 * `kind` only changes the subfolder so bids and plans stay tidy in Storage.
 * onProgress reports 0–100 for slow-connection UX.
 */
export async function uploadBidAttachment(
  projectId: string,
  file: File,
  kind: 'bid' | 'plan' = 'bid',
  onProgress?: (pct: number) => void,
): Promise<UploadedBidAttachment> {
  if (!projectId) {
    throw new Error('uploadBidAttachment: projectId is required (storage rules need it)');
  }

  const ext = getExtension(file);
  const path = `projects/${projectId}/bid-compare/${kind}-${genId()}.${ext}`;
  const sref = storageRef(storage, path);
  const task = uploadBytesResumable(sref, file, file.type ? { contentType: file.type } : undefined);

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100),
      reject,
      () => resolve(),
    );
  });

  const url = await getDownloadURL(sref);
  return {
    url,
    storagePath: path,
    sizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
  };
}
