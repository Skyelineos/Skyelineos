// One-click "Add Standard Selections" for Templates → Selections. Builds a
// Selections template (templates doc, category 'selections') from the bundled
// SELECTIONS_TEMPLATE — the client-owned decisions, with room→floor mapped so
// they slot into the portal's floor/room board. The GC can edit it and ★ it.

import { collection, doc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SELECTIONS_TEMPLATE } from '@/data/selectionsTemplate';
import { ROOMS_BY_FLOOR, type FloorLevel } from '@/types/selections';

const STANDARD_NAME = 'Standard Selections';

export interface SelectionTemplateRow {
  floor: FloorLevel;
  room: string;
  category: string;
  area: string;
  phase: string;
}

export function roomToFloor(room: string): FloorLevel {
  for (const floor of Object.keys(ROOMS_BY_FLOOR) as FloorLevel[]) {
    if (ROOMS_BY_FLOOR[floor].some(r => r.toLowerCase() === room.toLowerCase())) return floor;
  }
  if (/lot|exterior|site|driveway|landscap|patio/i.test(room)) return 'Exterior';
  return 'Main Floor';
}

export function standardSelectionRows(): SelectionTemplateRow[] {
  return SELECTIONS_TEMPLATE
    .filter(i => i.owner === 'Client')
    .map(i => ({ floor: roomToFloor(i.room), room: i.room, category: i.category, area: i.item, phase: i.phase }));
}

export async function seedStandardSelectionsTemplate(createdByEmail: string): Promise<{ created: boolean; count: number }> {
  const existing = await getDocs(query(
    collection(db, 'templates'),
    where('category', '==', 'selections'),
    where('name', '==', STANDARD_NAME),
  ));
  if (!existing.empty) return { created: false, count: 0 };

  const rows = standardSelectionRows();
  const anyDefault = (await getDocs(query(collection(db, 'templates'), where('category', '==', 'selections'))))
    .docs.some(d => (d.data() as any).isDefault === true);

  const ref = doc(collection(db, 'templates'));
  await setDoc(ref, {
    name: STANDARD_NAME,
    category: 'selections',
    description: `Skyeline's standard client selections list (${rows.length} decisions).`,
    items: rows,
    isStarter: true,
    isDefault: !anyDefault,
    createdBy: createdByEmail || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { created: true, count: rows.length };
}
