// Helpers for the "Recommended For You" layer (see types/selectionRecommendations).
//   - generateFromQuiz: turn the homeowner's Style Discovery answers into a set of
//     recommendation cards (idempotent — preserves any responses already given).
//   - love / remove / undo / attachPhoto: client-side status mutations.
//   - uploadRedirectPhoto: store the "here's what I'd like instead" image.
// The recommendationTaskBridge Cloud Function reacts to status changes (creates the
// client upload task, completes it on photo, notifies the designer).

import {
  collection, doc, getDocs, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { heroImageUrl, type StyleQuestion } from '@/data/standardStyleQuiz';

const COL = (projectId: string) => collection(db, 'projects', projectId, 'selectionRecommendations');
const REC = (projectId: string, recId: string) => doc(db, 'projects', projectId, 'selectionRecommendations', recId);

// The overall-style question sets the profile, not a per-selection recommendation.
const SKIP_QUESTION_IDS = new Set(['overall-style']);
const autoId = (questionId: string) => `auto__${questionId}`;

export interface GenerateResult {
  created: number;
  updated: number;
  total: number;
}

/**
 * Build/refresh recommendations from the client's quiz answers. One card per
 * answered selection question (flooring, counters, exterior, …). Idempotent:
 *   - missing → created as `pending`
 *   - existing → refresh content (title/image/description) but KEEP the client's
 *     status + any photo they already uploaded.
 */
export async function generateFromQuiz(
  projectId: string,
  answers: Record<string, string>,
  questions: StyleQuestion[],
  source: 'auto' | 'designer' = 'auto',
): Promise<GenerateResult> {
  const existing = new Map<string, any>();
  const snap = await getDocs(COL(projectId));
  snap.docs.forEach(d => existing.set(d.id, d.data()));

  let created = 0;
  let updated = 0;
  let order = 0;

  for (const q of questions) {
    if (SKIP_QUESTION_IDS.has(q.id)) continue;
    const optionId = answers[q.id];
    if (!optionId) continue;
    const option = q.options.find(o => o.id === optionId);
    if (!option || option.kind === 'upload') continue;

    const id = autoId(q.id);
    const image = heroImageUrl(option) || null;
    const content = {
      category: q.area || q.prompt,
      title: option.label,
      description: option.description ?? null,
      styleQuestionId: q.id,
      styleOptionId: option.id,
      imageUrl: image,
      sortOrder: order++,
      updatedAt: serverTimestamp(),
    };

    if (existing.has(id)) {
      // Refresh the recommended content only — never touch the client's response.
      await updateDoc(REC(projectId, id), content);
      updated++;
    } else {
      await setDoc(REC(projectId, id), {
        projectId,
        source,
        room: null,
        linkedSelectionId: null,
        status: 'pending',
        clientPhotoUrl: null,
        clientPhotoPath: null,
        clientNote: null,
        clientRespondedAt: null,
        taskId: null,
        createdAt: serverTimestamp(),
        ...content,
      });
      created++;
    }
  }

  return { created, updated, total: created + updated };
}

/** Designer adds a one-off recommendation (override / extra). */
export async function addDesignerRecommendation(
  projectId: string,
  data: { category: string; title: string; description?: string; imageUrl?: string | null; room?: string | null; linkedSelectionId?: string | null },
): Promise<string> {
  const ref = doc(COL(projectId));
  await setDoc(ref, {
    projectId,
    source: 'designer',
    category: data.category,
    title: data.title,
    description: data.description ?? null,
    room: data.room ?? null,
    imageUrl: data.imageUrl ?? null,
    styleQuestionId: null,
    styleOptionId: null,
    linkedSelectionId: data.linkedSelectionId ?? null,
    status: 'pending',
    clientPhotoUrl: null,
    clientPhotoPath: null,
    clientNote: null,
    clientRespondedAt: null,
    taskId: null,
    sortOrder: 999,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Designer edits an existing recommendation's content. */
export async function updateRecommendationContent(
  projectId: string,
  recId: string,
  patch: { category?: string; title?: string; description?: string | null; imageUrl?: string | null; room?: string | null },
): Promise<void> {
  await updateDoc(REC(projectId, recId), { ...patch, updatedAt: serverTimestamp() });
}

export async function loveRecommendation(projectId: string, recId: string): Promise<void> {
  await updateDoc(REC(projectId, recId), {
    status: 'loved',
    clientRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** "Not for me" — the Cloud Function then creates the upload task + notifies. */
export async function removeRecommendation(projectId: string, recId: string): Promise<void> {
  await updateDoc(REC(projectId, recId), {
    status: 'removed',
    clientRespondedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Client changed their mind before uploading — back to pending. */
export async function undoRecommendationResponse(projectId: string, recId: string): Promise<void> {
  await updateDoc(REC(projectId, recId), {
    status: 'pending',
    clientPhotoUrl: null,
    clientPhotoPath: null,
    clientNote: null,
    clientRespondedAt: null,
    updatedAt: serverTimestamp(),
  });
}

/** Upload the "here's what I'd like instead" photo to Storage. */
export async function uploadRedirectPhoto(
  projectId: string,
  recId: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const safe = file.name.replace(/[^\w.\-]/g, '_');
  const path = `projects/${projectId}/recommendationPhotos/${recId}-${Date.now()}-${safe}`;
  const sref = storageRef(storage, path);
  await uploadBytesResumable(sref, file);
  const url = await getDownloadURL(sref);
  return { url, path };
}

/** Attach the uploaded redirect photo — Cloud Function flips status + completes task. */
export async function attachRecommendationPhoto(
  projectId: string,
  recId: string,
  photo: { url: string; path: string },
  note?: string,
): Promise<void> {
  await updateDoc(REC(projectId, recId), {
    clientPhotoUrl: photo.url,
    clientPhotoPath: photo.path,
    clientNote: note?.trim() || null,
    status: 'photo_added',
    updatedAt: serverTimestamp(),
  });
}
