import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WbsTask, Link } from '@/modules/gantt/types';

// Skyeline Homes' master schedule for a custom home build — 70 tasks with
// real dependencies, distilled from Tyler's office Master_Schedule PDF.
// Dates are computed relative to a project start of 2026-01-01 in the
// template itself; the Gantt editor lets the GC shift them per project.

interface SeedTask {
  num: number;
  name: string;
  durationDays: number;
  /** Predecessor numbers (FS dependency, finish-to-start). */
  fs?: number[];
  /** Same-start dependencies (SS) — used for tasks like "with 17" or "same time as 2-7". */
  ss?: number[];
  /** Midway-through (SS with lag of half the predecessor's duration). */
  midOf?: number;
  /** "Before X" — this task finishes by predecessor's start (FF reversed: X waits on this). */
  before?: number;
  /** Client decision required (selection-driven). */
  clientDecision?: boolean;
}

const MASTER: SeedTask[] = [
  { num: 1,  name: 'Plans & Specs',                                  durationDays: 7, ss: [2] },
  { num: 2,  name: 'Engineering',                                    durationDays: 7, ss: [1] },
  { num: 3,  name: 'SWPPP (Water Prevention)',                       durationDays: 1, ss: [1] },
  { num: 4,  name: 'Building Permit',                                durationDays: 7, ss: [1] },
  { num: 5,  name: 'Lot Staking / Surveying',                        durationDays: 3, ss: [1] },
  { num: 6,  name: 'Temp Water & Power',                             durationDays: 1, ss: [1] },
  { num: 7,  name: 'Prep / Security',                                durationDays: 270, ss: [1] }, // runs length of project
  { num: 8,  name: 'Excavation',                                     durationDays: 14, fs: [4, 5] },
  { num: 9,  name: 'Lateral Utility Hookups',                        durationDays: 1, fs: [10] },
  { num: 10, name: 'Concrete: Footings / Foundation',                durationDays: 7, fs: [8] },
  { num: 11, name: 'FOOTINGS INSPECTION',                            durationDays: 1, midOf: 10 },
  { num: 12, name: 'FOUNDATION INSPECTION',                          durationDays: 1, fs: [10] },
  { num: 13, name: 'Concrete: Flatwork (Basement + Garage)',         durationDays: 7, fs: [12] },
  { num: 14, name: 'PLUMBING + TEMPORARY POWER INSPECTION',          durationDays: 1, fs: [13] },
  { num: 15, name: 'Foundation Waterproofing',                       durationDays: 2, fs: [14] },
  { num: 16, name: 'Window Wells',                                   durationDays: 2, fs: [14] },
  { num: 17, name: 'Framing',                                        durationDays: 60, fs: [14] },
  { num: 18, name: 'PORCH CAP INSPECTION',                           durationDays: 1, fs: [17] },
  { num: 19, name: 'Structural Beams',                               durationDays: 60, ss: [17] },
  { num: 20, name: 'Suspended Slab',                                 durationDays: 14, ss: [17] },
  { num: 21, name: 'Roofing',                                        durationDays: 21, fs: [17], clientDecision: true },
  { num: 22, name: 'Windows',                                        durationDays: 7,  fs: [17], clientDecision: true },
  { num: 23, name: 'Exterior Doors',                                 durationDays: 7,  fs: [32], clientDecision: true },
  { num: 24, name: 'Front Door',                                     durationDays: 1,  fs: [32], clientDecision: true },
  { num: 25, name: 'Concrete: Self-Leveling',                        durationDays: 7,  fs: [32] },
  { num: 26, name: 'Garage Doors',                                   durationDays: 3,  fs: [32], clientDecision: true },
  { num: 27, name: 'Plumbing (Rough-In)',                            durationDays: 14, fs: [17] },
  { num: 28, name: 'HVAC (Rough-In)',                                durationDays: 14, fs: [17] },
  { num: 29, name: 'Electrical (Rough-In)',                          durationDays: 14, fs: [17] },
  { num: 30, name: 'Gas Lines',                                      durationDays: 2,  fs: [17] },
  { num: 31, name: 'GAS LINE INSPECTION',                            durationDays: 1,  fs: [30] },
  { num: 32, name: '4-WAY INSPECTION',                               durationDays: 1,  fs: [29] },
  { num: 33, name: 'PERMANENT POWER INSPECTION',                     durationDays: 1,  fs: [29] },
  { num: 34, name: 'SHEAR WALL INSPECTION',                          durationDays: 1,  fs: [17] },
  { num: 35, name: 'WEATHER BARRIER INSPECTION',                     durationDays: 1,  fs: [17] },
  { num: 36, name: 'Insulation',                                     durationDays: 7,  fs: [32] },
  { num: 37, name: 'INSULATION INSPECTION',                          durationDays: 1,  fs: [36] },
  { num: 38, name: 'Fireplace Install',                              durationDays: 2,  fs: [17], clientDecision: true },
  { num: 39, name: 'FLASHING INSPECTION',                            durationDays: 1,  before: 40 },
  { num: 40, name: 'Brick',                                          durationDays: 30, fs: [34, 35], clientDecision: true },
  { num: 41, name: 'Stone',                                          durationDays: 30, fs: [34, 36], clientDecision: true },
  { num: 42, name: 'Stucco / Board & Batten',                        durationDays: 30, fs: [34, 37], clientDecision: true },
  { num: 43, name: 'Gutter / Soffit',                                durationDays: 30, fs: [34, 38], clientDecision: true },
  { num: 44, name: 'Sheetrock',                                      durationDays: 14, fs: [37] },
  { num: 45, name: 'Tile (Upgraded)',                                durationDays: 30, fs: [25], clientDecision: true },
  { num: 46, name: 'Engineered Hardwood',                            durationDays: 30, fs: [25], clientDecision: true },
  { num: 47, name: 'Carpet (High Grade)',                            durationDays: 30, fs: [25], clientDecision: true },
  { num: 48, name: 'SHOWER PAN INSPECTION',                          durationDays: 1,  fs: [25] },
  { num: 49, name: 'Interior Doors',                                 durationDays: 7,  fs: [45, 46, 47], clientDecision: true },
  { num: 50, name: 'Finish Trim',                                    durationDays: 30, fs: [45, 46, 47], clientDecision: true },
  { num: 51, name: 'Stairway',                                       durationDays: 7,  fs: [45, 46, 47], clientDecision: true },
  { num: 52, name: 'Door Handles, Bath Rods, Mirrors, Glass',        durationDays: 5,  fs: [45, 46, 47], clientDecision: true },
  { num: 53, name: 'Cabinets (Upgraded)',                            durationDays: 14, fs: [45, 46, 47], clientDecision: true },
  { num: 54, name: 'Countertops (Granite)',                          durationDays: 3,  fs: [53], clientDecision: true },
  { num: 55, name: 'Paint',                                          durationDays: 14, fs: [44], clientDecision: true },
  { num: 56, name: 'Appliances',                                     durationDays: 2,  fs: [54], clientDecision: true },
  { num: 57, name: 'Decks',                                          durationDays: 7,  fs: [40, 41, 42, 43], clientDecision: true },
  { num: 58, name: 'Exterior Railing',                               durationDays: 3,  fs: [57, 63], clientDecision: true },
  { num: 59, name: 'Landscaping',                                    durationDays: 30, fs: [63], clientDecision: true },
  { num: 60, name: 'Master Closet Organizers',                       durationDays: 5,  fs: [45, 46, 47], clientDecision: true },
  { num: 61, name: 'Furniture',                                      durationDays: 1,  fs: [70], clientDecision: true },
  { num: 62, name: 'Decorative Beams',                               durationDays: 30, fs: [45, 46, 47], clientDecision: true },
  { num: 63, name: 'Driveways / Walkways / Patios',                  durationDays: 14, fs: [40, 41, 42, 43], clientDecision: true },
  { num: 64, name: 'Final Cleaning',                                 durationDays: 2,  fs: [69] },
  { num: 65, name: 'Mail Box Installation',                          durationDays: 1,  fs: [63], clientDecision: true },
  { num: 66, name: 'Finish Plumbing',                                durationDays: 14, fs: [50], clientDecision: true },
  { num: 67, name: 'Finish Electrical',                              durationDays: 14, fs: [50], clientDecision: true },
  { num: 68, name: 'Finish HVAC',                                    durationDays: 2,  fs: [50], clientDecision: true },
  { num: 69, name: 'FINAL INSPECTION',                               durationDays: 1,  fs: [50] },
  { num: 70, name: 'Final Walkthrough',                              durationDays: 1,  fs: [64], clientDecision: true },
];

const PROJECT_START = '2026-01-01';

function isoAddDays(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function buildSchedule(): { tasks: WbsTask[]; links: Link[] } {
  // Map num → computed task for date resolution.
  const byNum = new Map<number, { start: string; end: string }>();
  const tasks: WbsTask[] = [];
  const links: Link[] = [];

  // Iterate in order (1..70). All predecessors come before successors in the
  // table, so a single pass is enough.
  for (const t of MASTER) {
    const id = `t${t.num}`;

    // Earliest start based on predecessor relationships.
    const candidates: string[] = [PROJECT_START];

    // FS — start after max(predecessor.end) + 1 day.
    for (const pNum of t.fs || []) {
      const p = byNum.get(pNum);
      if (p) candidates.push(isoAddDays(p.end, 1));
    }
    // SS — start same as predecessor.
    for (const pNum of t.ss || []) {
      const p = byNum.get(pNum);
      if (p) candidates.push(p.start);
    }
    // Mid-through — start at midpoint of predecessor.
    if (t.midOf) {
      const p = byNum.get(t.midOf);
      if (p) {
        const halfway = Math.floor(diffDays(p.start, p.end) / 2);
        candidates.push(isoAddDays(p.start, halfway));
      }
    }
    // "Before X" — finish at-or-before X start. Position immediately before.
    if (t.before) {
      const p = byNum.get(t.before);
      if (p) candidates.push(isoAddDays(p.start, -t.durationDays));
    }

    // Pick the latest of the candidates as our start.
    candidates.sort();
    const start = candidates[candidates.length - 1];
    const end = isoAddDays(start, Math.max(0, t.durationDays - 1));
    byNum.set(t.num, { start, end });

    tasks.push({
      id,
      name: t.name,
      startDate: start,
      endDate: end,
      durationDays: t.durationDays,
      progress: 0,
      // Tagging client-decision tasks so a future "selections gate" view can pick them up.
      // Stored in `status` for now ('pending_approval' is the closest existing value);
      // we can add a dedicated `clientDecision` field on WbsTask later.
      ...(t.clientDecision ? { status: 'pending_approval' as const } : {}),
    });

    // Build predecessor links.
    (t.fs || []).forEach(pNum => {
      if (byNum.has(pNum)) links.push({ sourceId: `t${pNum}`, targetId: id, type: 'FS' });
    });
    (t.ss || []).forEach(pNum => {
      if (byNum.has(pNum)) links.push({ sourceId: `t${pNum}`, targetId: id, type: 'SS' });
    });
    if (t.midOf && byNum.has(t.midOf)) {
      links.push({ sourceId: `t${t.midOf}`, targetId: id, type: 'SS' });
    }
    if (t.before && byNum.has(t.before)) {
      links.push({ sourceId: id, targetId: `t${t.before}`, type: 'FS' });
    }
  }

  return { tasks, links };
}

const TEMPLATE_NAME = 'Skyeline Custom Home Build — Master Schedule';

export async function seedMasterCustomHomeScheduleTemplate(createdBy?: string): Promise<{
  created: boolean;
  taskCount: number;
}> {
  // Idempotent — skip if a template with this name already exists.
  const existing = await getDocs(query(
    collection(db, 'scheduleTemplates'),
    where('name', '==', TEMPLATE_NAME),
  ));
  if (!existing.empty) {
    return { created: false, taskCount: 0 };
  }
  const { tasks, links } = buildSchedule();
  await addDoc(collection(db, 'scheduleTemplates'), {
    name: TEMPLATE_NAME,
    description: '70-task custom home build schedule from Skyeline Homes office. Dependencies, durations, and client-decision flags pre-populated. Edit dates per project after applying.',
    tasks,
    links,
    createdBy: createdBy ?? null,
    isStarter: true,
    createdAt: serverTimestamp(),
  });
  return { created: true, taskCount: tasks.length };
}
