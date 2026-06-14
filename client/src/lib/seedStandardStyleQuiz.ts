// One-click "Add Standard Style Quiz" for Templates → Style Quiz. Creates a
// styleQuiz template from Skyeline's standard questions; the GC then adds
// representative photos per option and ★ sets it as the default quiz clients
// click through in the portal.

import { collection, doc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STANDARD_STYLE_QUIZ } from '@/data/standardStyleQuiz';

const STANDARD_NAME = 'Standard Style Quiz';

export async function seedStandardStyleQuiz(createdByEmail: string): Promise<{ created: boolean; count: number }> {
  const existing = await getDocs(query(
    collection(db, 'templates'),
    where('category', '==', 'styleQuiz'),
    where('name', '==', STANDARD_NAME),
  ));
  if (!existing.empty) return { created: false, count: 0 };

  const anyDefault = (await getDocs(query(collection(db, 'templates'), where('category', '==', 'styleQuiz'))))
    .docs.some(d => (d.data() as any).isDefault === true);

  const ref = doc(collection(db, 'templates'));
  await setDoc(ref, {
    name: STANDARD_NAME,
    category: 'styleQuiz',
    description: `Skyeline's guided style quiz — ${STANDARD_STYLE_QUIZ.length} questions. Add photos to each option.`,
    questions: STANDARD_STYLE_QUIZ,
    isStarter: true,
    isDefault: !anyDefault,
    createdBy: createdByEmail || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { created: true, count: STANDARD_STYLE_QUIZ.length };
}
