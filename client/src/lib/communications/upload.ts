// Firebase Storage upload helper for Communication Center attachments
// (images / videos / docs / audio posted into a thread).
//
// Files land under communications/{threadId}/... which storage.rules opens to
// any authenticated user (`match /communications/{allPaths=**}`). Per-thread
// visibility is enforced by the Firestore /communications rules. Mirrors the
// resumable-upload pattern used by the RFI + bidding modules.

import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import type { CommAttachment } from './firestore';

/**
 * Upload one file for a thread and return its attachment record. `onProgress`
 * reports 0–100 so the composer can show a progress bar — site videos can be
 * tens of megabytes on a slow phone connection.
 */
export async function uploadCommAttachment(
  threadId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<CommAttachment> {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `communications/${threadId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
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
  // Build conditionally — Firestore rejects nested `undefined`.
  const attachment: CommAttachment = { name: file.name, url, storagePath: path };
  if (file.type) attachment.contentType = file.type;
  if (file.size) attachment.size = file.size;
  return attachment;
}
