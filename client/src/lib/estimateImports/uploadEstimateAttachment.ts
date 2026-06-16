// Firebase Storage upload helper for estimate-import attachments.
//
// Files land under projects/{projectId}/estimate-imports/{uuid}.{ext} — which
// Stream 1's tightened Storage rules (`match /projects/{projectId}/{allPaths=**}`)
// gate with isOnProject(projectId). Anything outside that prefix will be
// rejected by rules at write time, so the {projectId}/ prefix is load-bearing.
//
// Returns enough metadata for the modal to attach the file to the estimate doc
// (storagePath for rules/auditability, url for client viewing) and optionally
// kick off Claude vision extraction.

import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface UploadedEstimateAttachment {
  url: string;
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
  fileName: string;
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getExtension(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : '';
  if (fromName) return fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Fallback to mime type → extension
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'text/plain') return 'txt';
  return 'bin';
}

/**
 * Upload one file (PDF, image, or .txt pasted email body) for an estimate
 * import and return its metadata.
 *
 * onProgress reports 0–100 so the modal can show progress on slow connections.
 */
export async function uploadEstimateAttachment(
  projectId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadedEstimateAttachment> {
  if (!projectId) {
    throw new Error('uploadEstimateAttachment: projectId is required (storage rules need it)');
  }

  const ext = getExtension(file);
  const path = `projects/${projectId}/estimate-imports/${genId()}.${ext}`;
  const sref = storageRef(storage, path);
  const task = uploadBytesResumable(sref, file, file.type ? { contentType: file.type } : undefined);

  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      snap => onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100),
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
