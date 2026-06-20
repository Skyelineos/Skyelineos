// SSOT item read/promote helpers — the curated view over existing collections.
// Items are promoted into the Single Source of Truth via an `inSsot` flag rather
// than copied, so there's one Storage object per file (design §3).
//
// IMPORTANT (rules): subcontractor reads are gated on inSsot == true (+ Approved
// for mood boards), so the queries below MUST include those filters or Firestore
// denies the whole read. See firestore.rules + docs/single-source-of-truth-design.md §8.

import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SsotItem, SsotCategory } from './types';

const DOC_CATEGORY_TO_SSOT: Record<string, SsotCategory> = {
  drawing: 'Plans',
  plans: 'Plans',
  permit: 'Permits',
  contract: 'Scopes',
};

function docCategoryToSsot(category?: string): SsotCategory {
  return DOC_CATEGORY_TO_SSOT[(category || '').toLowerCase()] ?? 'Plans';
}

/** Promote / demote a top-level document into the SSOT (GC action). */
export async function setDocumentInSsot(docId: string, inSsot: boolean): Promise<void> {
  await updateDoc(doc(db, 'documents', docId), { inSsot, ssotUpdatedAt: serverTimestamp() });
}

/** Promote a project selection into the SSOT (GC/designer action). */
export async function setSelectionInSsot(projectId: string, selectionId: string, inSsot: boolean): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId, 'selections', selectionId), {
    inSsot, ssotUpdatedAt: serverTimestamp(),
  });
}

/**
 * Promote an APPROVED mood board into the SSOT (only approved designs enter, §2).
 * Callers should confirm status === 'Approved' before promoting.
 */
export async function setMoodBoardInSsot(projectId: string, boardId: string, inSsot: boolean): Promise<void> {
  await updateDoc(doc(db, 'projects', projectId, 'moodBoards', boardId), {
    inSsot, ssotUpdatedAt: serverTimestamp(),
  });
}

/** The read-only SSOT view for a project: promoted documents + approved boards + selections. */
export async function listSsotItems(projectId: string): Promise<SsotItem[]> {
  const items: SsotItem[] = [];

  // Promoted top-level documents (plans, permits, contracts, renderings).
  const docsSnap = await getDocs(query(
    collection(db, 'documents'),
    where('projectId', '==', projectId),
    where('inSsot', '==', true),
  ));
  docsSnap.docs.forEach(d => {
    const data = d.data() as any;
    items.push({
      id: d.id,
      source: 'document',
      category: data.category === 'photo' ? 'Design' : docCategoryToSsot(data.category),
      title: data.name || data.fileName || 'Document',
      fileUrl: data.fileUrl,
      fileType: data.fileType,
      updatedAt: data.ssotUpdatedAt || data.createdAt,
    });
  });

  // Approved + promoted mood boards.
  const boardsSnap = await getDocs(query(
    collection(db, 'projects', projectId, 'moodBoards'),
    where('inSsot', '==', true),
    where('status', '==', 'Approved'),
  ));
  boardsSnap.docs.forEach(d => {
    const data = d.data() as any;
    items.push({
      id: d.id,
      source: 'moodBoard',
      category: 'Design',
      title: data.title || 'Design board',
      updatedAt: data.ssotUpdatedAt || data.approvedAt,
    });
  });

  // Promoted selections.
  const selSnap = await getDocs(query(
    collection(db, 'projects', projectId, 'selections'),
    where('inSsot', '==', true),
  ));
  selSnap.docs.forEach(d => {
    const data = d.data() as any;
    items.push({
      id: d.id,
      source: 'selection',
      category: 'Selections',
      title: data.title || data.category || 'Selection',
      fileUrl: data.imageUrl,
      updatedAt: data.ssotUpdatedAt,
    });
  });

  return items;
}
