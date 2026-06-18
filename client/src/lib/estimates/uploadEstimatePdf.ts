// Firebase Storage upload helper for the "Send to client" PDF.
//
// Files land at: projects/{projectId}/estimates/{estimateId}.pdf
// Covered by today's storage rules fix (`isStaff()` short-circuit on
// projects/{projectId}/**), so any GC/PM/admin can write here.
//
// Modeled on client/src/lib/bidSubmissions/uploadBidAttachment.ts.

import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export interface UploadedEstimatePdf {
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

export async function uploadEstimatePdf(
  projectId: string,
  estimateId: string,
  blob: Blob,
): Promise<UploadedEstimatePdf> {
  if (!projectId) {
    throw new Error('uploadEstimatePdf: projectId is required (storage rules need it)');
  }
  if (!estimateId) {
    throw new Error('uploadEstimatePdf: estimateId is required (filename pivot)');
  }

  const storagePath = `projects/${projectId}/estimates/${estimateId}.pdf`;
  const sref = storageRef(storage, storagePath);
  const task = uploadBytesResumable(sref, blob, { contentType: 'application/pdf' });

  await new Promise<void>((resolve, reject) => {
    task.on('state_changed', undefined, reject, () => resolve());
  });

  const downloadUrl = await getDownloadURL(sref);
  return {
    storagePath,
    downloadUrl,
    fileName: `${estimateId}.pdf`,
    sizeBytes: blob.size,
    mimeType: 'application/pdf',
  };
}
