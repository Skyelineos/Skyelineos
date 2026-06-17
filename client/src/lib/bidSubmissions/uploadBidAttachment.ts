// Firebase Storage upload helper for manually-recorded bid attachments.
//
// Files land under projects/{projectId}/bid-submissions/{bidId}.{ext} — which
// the just-merged storage rules fix (`fix/storage-rules-gc-access`) gates so
// staff (GC / PM / admin) can read+write any path under projects/{projectId}/.
// Anything outside that prefix will be rejected by rules at write time, so the
// {projectId}/ prefix is load-bearing.
//
// Modeled on client/src/lib/estimateImports/uploadEstimateAttachment.ts — same
// resumable-upload pattern, same metadata-bag return shape, sized to drop
// straight into the bid doc's `attachment` field.

import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface UploadedBidAttachment {
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

function getExtension(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : '';
  if (fromName) return fromName.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Fallback to mime type → extension
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/heic') return 'heic';
  if (file.type === 'image/webp') return 'webp';
  return 'bin';
}

/**
 * Upload a quote PDF or photo'd image to Storage and return metadata that can
 * be stamped onto the bid doc's `attachment` field.
 *
 * Files land at: projects/{projectId}/bid-submissions/{bidId}.{ext}
 * - {bidId} comes from the just-created bid doc so we get a stable, sortable
 *   filename per bid (one attachment per manual record, by design).
 * - The {projectId}/ prefix is what makes the storage rule allow the write —
 *   isStaff() check is keyed on the projectId at the path root.
 */
export async function uploadBidAttachment(
  projectId: string,
  bidId: string,
  file: File,
): Promise<UploadedBidAttachment> {
  if (!projectId) {
    throw new Error('uploadBidAttachment: projectId is required (storage rules need it)');
  }
  if (!bidId) {
    throw new Error('uploadBidAttachment: bidId is required (filename pivot)');
  }

  const ext = getExtension(file);
  const storagePath = `projects/${projectId}/bid-submissions/${bidId}.${ext}`;
  const sref = storageRef(storage, storagePath);
  const task = uploadBytesResumable(
    sref,
    file,
    file.type ? { contentType: file.type } : undefined,
  );

  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', undefined, reject, () => resolve());
  });

  const downloadUrl = await getDownloadURL(sref);
  return {
    storagePath,
    downloadUrl,
    fileName: file.name,
    sizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
  };
}
