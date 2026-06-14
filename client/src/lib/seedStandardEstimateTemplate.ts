// One-click "Add Standard Estimate" for Templates → Estimate. Creates a
// structured estimate template (templates doc, category 'estimate') from
// Skyeline's master estimate line items. Editable in the existing estimate
// template editor; ★ to set as the default seeded into new projects.

import { collection, doc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STANDARD_ESTIMATE_LINES } from '@/data/standardEstimateTemplate';

const STANDARD_NAME = 'Standard Estimate';

export async function seedStandardEstimateTemplate(createdByEmail: string): Promise<{ created: boolean; count: number; total: number }> {
  const existing = await getDocs(query(
    collection(db, 'templates'),
    where('category', '==', 'estimate'),
    where('name', '==', STANDARD_NAME),
  ));
  if (!existing.empty) return { created: false, count: 0, total: 0 };

  const anyDefault = (await getDocs(query(collection(db, 'templates'), where('category', '==', 'estimate'))))
    .docs.some(d => (d.data() as any).isDefault === true);

  const total = STANDARD_ESTIMATE_LINES.reduce((s, l) => s + (l.total || 0), 0);
  const ref = doc(collection(db, 'templates'));
  await setDoc(ref, {
    name: STANDARD_NAME,
    category: 'estimate',
    description: `Skyeline's standard build estimate — ${STANDARD_ESTIMATE_LINES.length} line items.`,
    lineItems: STANDARD_ESTIMATE_LINES,
    isStarter: true,
    isDefault: !anyDefault,
    createdBy: createdByEmail || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { created: true, count: STANDARD_ESTIMATE_LINES.length, total };
}
