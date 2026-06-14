import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Seed templates Tyler can use as a starting point. Tasks are intentionally
// high-level — phases, not every nail-down. They're easy to expand from the
// Templates editor once seeded. `daysOffset` is from the project start date.
// `category` aligns with the trade groups elsewhere in the app.

interface SeedTask {
  name: string;
  category: string;
  daysOffset: number;
  description?: string;
  assigneeRole?: 'gc' | 'sub' | 'client' | 'designer' | '';
}

interface SeedTemplate {
  name: string;
  description: string;
  type: 'job';
  tasks: SeedTask[];
}

const CUSTOM_HOME: SeedTemplate = {
  name: 'Custom Home Build',
  description: 'Full new-home build from contract to closeout (~8–12 months).',
  type: 'job',
  tasks: [
    // Pre-Construction
    { name: 'Sign construction contract', category: 'Pre-Build', daysOffset: 0, assigneeRole: 'gc' },
    { name: 'Submit building permit', category: 'Pre-Build', daysOffset: 7, assigneeRole: 'gc' },
    { name: 'Permit approval received', category: 'Pre-Build', daysOffset: 30, assigneeRole: 'gc' },
    { name: 'Order materials (long-lead)', category: 'Pre-Build', daysOffset: 14, assigneeRole: 'gc' },
    // Site Work
    { name: 'Site survey + staking', category: 'Site Work', daysOffset: 25, assigneeRole: 'sub' },
    { name: 'Excavation', category: 'Site Work', daysOffset: 32, assigneeRole: 'sub' },
    { name: 'Underground utilities rough-in', category: 'Site Work', daysOffset: 40, assigneeRole: 'sub' },
    // Foundation
    { name: 'Footings', category: 'Foundation', daysOffset: 45, assigneeRole: 'sub' },
    { name: 'Foundation walls', category: 'Foundation', daysOffset: 55, assigneeRole: 'sub' },
    { name: 'Foundation inspection', category: 'Foundation', daysOffset: 65, assigneeRole: 'gc' },
    { name: 'Foundation waterproofing + backfill', category: 'Foundation', daysOffset: 70, assigneeRole: 'sub' },
    // Framing
    { name: 'First-floor framing', category: 'Framing', daysOffset: 78, assigneeRole: 'sub' },
    { name: 'Second-floor framing', category: 'Framing', daysOffset: 90, assigneeRole: 'sub' },
    { name: 'Roof framing + sheathing', category: 'Framing', daysOffset: 105, assigneeRole: 'sub' },
    { name: 'Framing inspection', category: 'Framing', daysOffset: 115, assigneeRole: 'gc' },
    // Exterior shell
    { name: 'Roofing', category: 'Exterior', daysOffset: 115, assigneeRole: 'sub' },
    { name: 'Windows + exterior doors', category: 'Exterior', daysOffset: 120, assigneeRole: 'sub' },
    { name: 'House wrap + siding', category: 'Exterior', daysOffset: 130, assigneeRole: 'sub' },
    // MEP rough-in
    { name: 'Plumbing rough-in', category: 'MEP', daysOffset: 120, assigneeRole: 'sub' },
    { name: 'Electrical rough-in', category: 'MEP', daysOffset: 125, assigneeRole: 'sub' },
    { name: 'HVAC rough-in', category: 'MEP', daysOffset: 130, assigneeRole: 'sub' },
    { name: 'Low-voltage / smart home rough-in', category: 'MEP', daysOffset: 135, assigneeRole: 'sub' },
    { name: 'MEP rough-in inspection', category: 'MEP', daysOffset: 145, assigneeRole: 'gc' },
    // Insulation + Drywall
    { name: 'Insulation', category: 'Insulation', daysOffset: 150, assigneeRole: 'sub' },
    { name: 'Insulation inspection', category: 'Insulation', daysOffset: 155, assigneeRole: 'gc' },
    { name: 'Drywall hang + finish', category: 'Drywall', daysOffset: 165, assigneeRole: 'sub' },
    // Selection-driven finishes
    { name: 'Confirm all client selections final', category: 'Pre-Build', daysOffset: 90, assigneeRole: 'designer' },
    { name: 'Prime + first coat paint', category: 'Paint', daysOffset: 180, assigneeRole: 'sub' },
    { name: 'Cabinets install', category: 'Cabinets', daysOffset: 195, assigneeRole: 'sub' },
    { name: 'Countertop template + install', category: 'Countertops', daysOffset: 205, assigneeRole: 'sub' },
    { name: 'Tile work', category: 'Tile', daysOffset: 200, assigneeRole: 'sub' },
    { name: 'Interior doors + trim', category: 'Trim', daysOffset: 210, assigneeRole: 'sub' },
    { name: 'Flooring install', category: 'Flooring', daysOffset: 220, assigneeRole: 'sub' },
    { name: 'Final paint', category: 'Paint', daysOffset: 230, assigneeRole: 'sub' },
    // MEP finish
    { name: 'Plumbing fixtures + trim', category: 'MEP', daysOffset: 225, assigneeRole: 'sub' },
    { name: 'Electrical trim + fixtures', category: 'MEP', daysOffset: 230, assigneeRole: 'sub' },
    { name: 'HVAC commissioning', category: 'MEP', daysOffset: 235, assigneeRole: 'sub' },
    // Final
    { name: 'Final cleaning', category: 'Closeout', daysOffset: 245, assigneeRole: 'sub' },
    { name: 'Punch list walk', category: 'Closeout', daysOffset: 250, assigneeRole: 'gc' },
    { name: 'Punch list complete', category: 'Closeout', daysOffset: 260, assigneeRole: 'gc' },
    { name: 'Final inspection / certificate of occupancy', category: 'Closeout', daysOffset: 265, assigneeRole: 'gc' },
    { name: 'Final client walkthrough', category: 'Closeout', daysOffset: 270, assigneeRole: 'client' },
    { name: 'Project closeout package delivered', category: 'Closeout', daysOffset: 275, assigneeRole: 'gc' },
  ],
};

const BASEMENT_FINISH: SeedTemplate = {
  name: 'Basement Finish',
  description: 'Unfinished basement → finished living space (~10–14 weeks).',
  type: 'job',
  tasks: [
    { name: 'Sign contract + collect deposit', category: 'Pre-Build', daysOffset: 0, assigneeRole: 'gc' },
    { name: 'Submit basement-finish permit', category: 'Pre-Build', daysOffset: 3, assigneeRole: 'gc' },
    { name: 'Confirm client finish selections', category: 'Pre-Build', daysOffset: 10, assigneeRole: 'designer' },
    { name: 'Demo + dust containment', category: 'Site Work', daysOffset: 14, assigneeRole: 'sub' },
    { name: 'Framing walls + soffits', category: 'Framing', daysOffset: 18, assigneeRole: 'sub' },
    { name: 'Electrical rough-in', category: 'MEP', daysOffset: 25, assigneeRole: 'sub' },
    { name: 'Plumbing rough-in (if wet bar / bath)', category: 'MEP', daysOffset: 27, assigneeRole: 'sub' },
    { name: 'HVAC adjustments', category: 'MEP', daysOffset: 30, assigneeRole: 'sub' },
    { name: 'MEP inspection', category: 'MEP', daysOffset: 35, assigneeRole: 'gc' },
    { name: 'Insulation', category: 'Insulation', daysOffset: 40, assigneeRole: 'sub' },
    { name: 'Drywall hang + finish', category: 'Drywall', daysOffset: 50, assigneeRole: 'sub' },
    { name: 'Prime + paint', category: 'Paint', daysOffset: 60, assigneeRole: 'sub' },
    { name: 'Flooring install', category: 'Flooring', daysOffset: 65, assigneeRole: 'sub' },
    { name: 'Tile + bath finish (if applicable)', category: 'Tile', daysOffset: 65, assigneeRole: 'sub' },
    { name: 'Trim + doors', category: 'Trim', daysOffset: 70, assigneeRole: 'sub' },
    { name: 'Electrical trim + fixtures', category: 'MEP', daysOffset: 75, assigneeRole: 'sub' },
    { name: 'Plumbing fixtures', category: 'MEP', daysOffset: 75, assigneeRole: 'sub' },
    { name: 'Final cleaning + punch list', category: 'Closeout', daysOffset: 80, assigneeRole: 'sub' },
    { name: 'Final inspection + walkthrough', category: 'Closeout', daysOffset: 85, assigneeRole: 'gc' },
  ],
};

const POOL_BUILD: SeedTemplate = {
  name: 'Pool Build',
  description: 'In-ground pool build from permit to fill (~8–12 weeks).',
  type: 'job',
  tasks: [
    { name: 'Sign contract + deposit', category: 'Pre-Build', daysOffset: 0, assigneeRole: 'gc' },
    { name: 'Permit submission', category: 'Pre-Build', daysOffset: 5, assigneeRole: 'gc' },
    { name: 'Permit approval', category: 'Pre-Build', daysOffset: 21, assigneeRole: 'gc' },
    { name: 'Layout + dig staking', category: 'Site Work', daysOffset: 25, assigneeRole: 'sub' },
    { name: 'Excavation', category: 'Site Work', daysOffset: 28, assigneeRole: 'sub' },
    { name: 'Steel + bond beam', category: 'Pool', daysOffset: 33, assigneeRole: 'sub' },
    { name: 'Plumbing rough-in', category: 'Pool', daysOffset: 35, assigneeRole: 'sub' },
    { name: 'Electrical bonding + rough-in', category: 'Pool', daysOffset: 37, assigneeRole: 'sub' },
    { name: 'Gunite / shell shoot', category: 'Pool', daysOffset: 40, assigneeRole: 'sub' },
    { name: 'Tile + coping', category: 'Pool', daysOffset: 50, assigneeRole: 'sub' },
    { name: 'Deck pour', category: 'Pool', daysOffset: 55, assigneeRole: 'sub' },
    { name: 'Equipment set + start-up plumbing', category: 'Pool', daysOffset: 60, assigneeRole: 'sub' },
    { name: 'Plaster / interior finish', category: 'Pool', daysOffset: 65, assigneeRole: 'sub' },
    { name: 'Fill + chemical balance', category: 'Pool', daysOffset: 67, assigneeRole: 'sub' },
    { name: 'Final inspection', category: 'Closeout', daysOffset: 75, assigneeRole: 'gc' },
    { name: 'Client orientation + handoff', category: 'Closeout', daysOffset: 78, assigneeRole: 'gc' },
  ],
};

const KITCHEN_REMODEL: SeedTemplate = {
  name: 'Kitchen Remodel',
  description: 'Cabinet-to-finish kitchen renovation (~6–8 weeks).',
  type: 'job',
  tasks: [
    { name: 'Sign contract + deposit', category: 'Pre-Build', daysOffset: 0, assigneeRole: 'gc' },
    { name: 'Confirm cabinet + countertop selections', category: 'Pre-Build', daysOffset: 3, assigneeRole: 'designer' },
    { name: 'Order cabinets (long-lead)', category: 'Pre-Build', daysOffset: 5, assigneeRole: 'gc' },
    { name: 'Demo old kitchen', category: 'Site Work', daysOffset: 14, assigneeRole: 'sub' },
    { name: 'Plumbing rough-in changes', category: 'MEP', daysOffset: 17, assigneeRole: 'sub' },
    { name: 'Electrical rough-in changes', category: 'MEP', daysOffset: 19, assigneeRole: 'sub' },
    { name: 'Drywall patch + repair', category: 'Drywall', daysOffset: 24, assigneeRole: 'sub' },
    { name: 'Paint walls + ceiling', category: 'Paint', daysOffset: 28, assigneeRole: 'sub' },
    { name: 'Cabinets install', category: 'Cabinets', daysOffset: 32, assigneeRole: 'sub' },
    { name: 'Countertop template', category: 'Countertops', daysOffset: 34, assigneeRole: 'sub' },
    { name: 'Countertop install', category: 'Countertops', daysOffset: 44, assigneeRole: 'sub' },
    { name: 'Backsplash tile', category: 'Tile', daysOffset: 47, assigneeRole: 'sub' },
    { name: 'Plumbing fixtures + appliances', category: 'MEP', daysOffset: 50, assigneeRole: 'sub' },
    { name: 'Electrical fixtures + outlets', category: 'MEP', daysOffset: 52, assigneeRole: 'sub' },
    { name: 'Punch list + final clean', category: 'Closeout', daysOffset: 55, assigneeRole: 'sub' },
    { name: 'Final walkthrough', category: 'Closeout', daysOffset: 56, assigneeRole: 'client' },
  ],
};

const BATHROOM_REMODEL: SeedTemplate = {
  name: 'Bathroom Remodel',
  description: 'Full bath gut-and-finish remodel (~4–5 weeks).',
  type: 'job',
  tasks: [
    { name: 'Sign contract + deposit', category: 'Pre-Build', daysOffset: 0, assigneeRole: 'gc' },
    { name: 'Confirm tile + plumbing fixture selections', category: 'Pre-Build', daysOffset: 3, assigneeRole: 'designer' },
    { name: 'Demo', category: 'Site Work', daysOffset: 7, assigneeRole: 'sub' },
    { name: 'Plumbing rough-in', category: 'MEP', daysOffset: 10, assigneeRole: 'sub' },
    { name: 'Electrical rough-in', category: 'MEP', daysOffset: 12, assigneeRole: 'sub' },
    { name: 'Shower pan + waterproofing', category: 'Tile', daysOffset: 14, assigneeRole: 'sub' },
    { name: 'Drywall + cement board', category: 'Drywall', daysOffset: 16, assigneeRole: 'sub' },
    { name: 'Tile install', category: 'Tile', daysOffset: 20, assigneeRole: 'sub' },
    { name: 'Grout + sealing', category: 'Tile', daysOffset: 23, assigneeRole: 'sub' },
    { name: 'Paint', category: 'Paint', daysOffset: 25, assigneeRole: 'sub' },
    { name: 'Vanity + countertop install', category: 'Cabinets', daysOffset: 27, assigneeRole: 'sub' },
    { name: 'Plumbing fixtures (toilet, faucets, shower trim)', category: 'MEP', daysOffset: 28, assigneeRole: 'sub' },
    { name: 'Electrical fixtures', category: 'MEP', daysOffset: 29, assigneeRole: 'sub' },
    { name: 'Glass shower enclosure', category: 'Glass', daysOffset: 31, assigneeRole: 'sub' },
    { name: 'Punch list + clean', category: 'Closeout', daysOffset: 33, assigneeRole: 'sub' },
  ],
};

const STARTER_TEMPLATES = [
  CUSTOM_HOME,
  BASEMENT_FINISH,
  POOL_BUILD,
  KITCHEN_REMODEL,
  BATHROOM_REMODEL,
];

// Seed any starter templates not already present (matched by name). Returns
// counts so the caller can toast a meaningful summary.
export async function seedStarterJobTemplates(): Promise<{
  created: number;
  skipped: number;
  totalTasks: number;
}> {
  const existingSnap = await getDocs(query(collection(db, 'templates'), where('type', '==', 'job')));
  const existingNames = new Set(existingSnap.docs.map(d => String((d.data() as any).name || '').toLowerCase()));

  let created = 0;
  let skipped = 0;
  let totalTasks = 0;

  for (const tmpl of STARTER_TEMPLATES) {
    if (existingNames.has(tmpl.name.toLowerCase())) {
      skipped += 1;
      continue;
    }
    const tmplRef = await addDoc(collection(db, 'templates'), {
      name: tmpl.name,
      description: tmpl.description,
      type: tmpl.type,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isStarter: true,
    });
    // Batch the task subcollection write to keep this snappy.
    const batch = writeBatch(db);
    tmpl.tasks.forEach((t, i) => {
      const taskRef = doc(collection(db, 'templates', tmplRef.id, 'jobTasks'));
      batch.set(taskRef, {
        name: t.name,
        description: t.description || '',
        category: t.category,
        assigneeRole: t.assigneeRole || '',
        daysOffset: t.daysOffset,
        dateType: 'fixed',
        order: i,
        notifyOnAssign: true,
        notifyOnDue: true,
        notifyOnComplete: false,
      });
    });
    await batch.commit();
    created += 1;
    totalTasks += tmpl.tasks.length;
  }
  return { created, skipped, totalTasks };
}
