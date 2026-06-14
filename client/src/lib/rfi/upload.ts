// Firebase Storage upload helper for RFI attachments (field photos + videos).
//
// Files land under projects/{projectId}/rfis/... — which storage.rules already
// opens to any authenticated user (`match /projects/{projectId}/{allPaths=**}`),
// so no storage-rule change is needed. Mirrors the resumable-upload pattern used
// by the bidding module (SubBidSubmissionForm.handleAttachUpload).

import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import type { RFIAttachment } from '@/types/rfi';

/**
 * Upload one file (photo or video) for an RFI and return its attachment record.
 * `onProgress` reports 0–100 so the form can show a progress bar — important on
 * phones where a site video can be tens of megabytes on a slow connection.
 */
export async function uploadRFIAttachment(
  projectId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<RFIAttachment> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `projects/${projectId}/rfis/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
  const sref = storageRef(storage, path);
  const task = uploadBytesResumable(sref, file);
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      snap => onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100),
      reject,
      () => resolve(),
    );
  });
  const url = await getDownloadURL(sref);
  // Build conditionally — Firestore rejects nested `undefined`, so only set
  // contentType when the browser actually reported one.
  const attachment: RFIAttachment = { name: file.name, url, storagePath: path };
  if (file.type) attachment.contentType = file.type;
  return attachment;
}
