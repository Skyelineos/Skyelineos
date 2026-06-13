// Sales-pitch / "Explore Skyeline" content layer.
//
// Shown in the client portal BEFORE a homeowner has an active project — a soft,
// interactive sales pitch made of one-pager "sections". Each section answers the
// questions a prospective client has about working with Skyeline Homes, with a
// slot for a video (added later) and any number of downloadable documents.
//
// Content lives in the root-level `salesPitchSections` Firestore collection so it
// is the same for every prospective client and is editable by staff from the
// portal itself (pencil / add / delete icons). When the collection is empty the
// UI falls back to DEFAULT_SECTIONS below, so clients always see polished content
// even before anyone has curated it — and staff can publish those defaults into
// Firestore with one click to start editing.

import {
  collection, doc, onSnapshot, orderBy, query, setDoc, deleteDoc,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject,
} from 'firebase/storage';
import { db, storage } from '@/lib/firebase';

export const SALES_PITCH_COLLECTION = 'salesPitchSections';

export interface SalesPitchFAQ {
  q: string;
  a: string;
}

export interface SalesPitchDoc {
  name: string;
  url: string;
  path: string;        // storage path, so we can delete the object later
  size?: number;
  uploadedAt?: string;
}

export interface SalesPitchSection {
  id: string;
  order: number;
  icon: string;        // lucide-react icon name — see ICON_MAP in the component
  title: string;
  tagline: string;     // one-line subtitle on the card
  intro: string;       // opening paragraph of the one-pager
  faqs: SalesPitchFAQ[];
  videoUrl?: string;   // empty/undefined → "video coming soon" placeholder
  documents: SalesPitchDoc[];
  published: boolean;  // false → hidden from clients, still visible to staff
  updatedAt?: any;
  updatedBy?: string;
}

// A fresh, blank section for the "add section" flow.
export function blankSection(order: number): SalesPitchSection {
  return {
    id: '',
    order,
    icon: 'Sparkles',
    title: '',
    tagline: '',
    intro: '',
    faqs: [{ q: '', a: '' }],
    videoUrl: '',
    documents: [],
    published: true,
  };
}

// ── Firestore I/O ───────────────────────────────────────────────────────────

export function subscribeSalesPitch(
  cb: (sections: SalesPitchSection[]) => void,
  onErr?: (e: any) => void,
) {
  const q = query(collection(db, SALES_PITCH_COLLECTION), orderBy('order', 'asc'));
  return onSnapshot(
    q,
    snap => cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }) as SalesPitchSection)),
    onErr,
  );
}

export async function saveSection(section: SalesPitchSection, uid?: string): Promise<string> {
  const id = section.id || doc(collection(db, SALES_PITCH_COLLECTION)).id;
  const { id: _omit, updatedAt: _omitAt, ...rest } = section;
  await setDoc(
    doc(db, SALES_PITCH_COLLECTION, id),
    { ...rest, updatedAt: serverTimestamp(), updatedBy: uid || null },
    { merge: true },
  );
  return id;
}

export async function deleteSection(section: SalesPitchSection): Promise<void> {
  // Best-effort cleanup of any uploaded files before removing the doc.
  await Promise.all(
    (section.documents || []).map(d =>
      d.path ? deleteObject(storageRef(storage, d.path)).catch(() => {}) : Promise.resolve(),
    ),
  );
  await deleteDoc(doc(db, SALES_PITCH_COLLECTION, section.id));
}

// Publish the built-in starter content into Firestore so staff can edit it.
export async function seedDefaultSections(uid?: string): Promise<void> {
  const batch = writeBatch(db);
  DEFAULT_SECTIONS.forEach(s => {
    const id = doc(collection(db, SALES_PITCH_COLLECTION)).id;
    const { id: _omit, ...rest } = s;
    batch.set(doc(db, SALES_PITCH_COLLECTION, id), {
      ...rest, updatedAt: serverTimestamp(), updatedBy: uid || null,
    });
  });
  await batch.commit();
}

// ── File uploads ────────────────────────────────────────────────────────────

export function uploadSalesPitchFile(
  sectionId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<SalesPitchDoc> {
  // Stable-ish path: collection/sectionId/timestamp-filename
  const safeName = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `salesPitch/${sectionId || 'unsaved'}/${Date.now()}-${safeName}`;
  const sref = storageRef(storage, path);
  const task = uploadBytesResumable(sref, file);
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      snap => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        const url = await getDownloadURL(sref);
        resolve({ name: file.name, url, path, size: file.size, uploadedAt: new Date().toISOString() });
      },
    );
  });
}

export async function deleteSalesPitchFile(path: string): Promise<void> {
  if (!path) return;
  await deleteObject(storageRef(storage, path)).catch(() => {});
}

// ── Default / starter content ───────────────────────────────────────────────
// These are editable drafts. Staff can publish them into Firestore (see
// seedDefaultSections) and then tweak every word from the portal. Until then
// they render directly so the client experience is never empty.

export const DEFAULT_SECTIONS: SalesPitchSection[] = [
  {
    id: 'how-we-build',
    order: 1,
    icon: 'HardHat',
    title: 'How We Build',
    tagline: 'The Skyeline process, start to finish',
    intro:
      'Building a custom home should feel exciting, not overwhelming. Here is exactly how we take you from "we are thinking about building" to handing you the keys — and what happens at every step in between.',
    faqs: [
      { q: 'What are the major steps?', a: 'It moves in clear phases: we get to know your vision, build a detailed estimate, lock in your design selections, sign the contract, break ground, and then build — with a final walkthrough and warranty period to wrap things up. Each phase shows up right here in your portal.' },
      { q: 'How involved will I be?', a: 'As involved as you want to be. Many clients love watching every detail come together; others prefer to set the vision and let us run. Either way, nothing major happens without your sign-off, and your portal keeps you in the loop daily.' },
      { q: 'Who is my main point of contact?', a: 'You will have a dedicated point of contact on the Skyeline team plus your designer. You can reach them anytime through the Messages tab — no chasing phone calls or lost email threads.' },
      { q: 'What do you need from me to get started?', a: 'A conversation about your goals, your lot (or help finding one), your budget range, and the style you are drawn to. From there we build your estimate and the rest of the plan follows.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'pricing-transparency',
    order: 2,
    icon: 'DollarSign',
    title: 'Pricing & Transparency',
    tagline: 'Cost-plus, explained plainly',
    intro:
      'There are no hidden markups at Skyeline. We build on a transparent cost-plus model, which means you see the real cost of your home and exactly what our fee is. Here is how it works.',
    faqs: [
      { q: 'What does "cost-plus" actually mean?', a: 'You pay the actual cost of the work and materials, plus an agreed contractor fee. Nothing is buried. You can see where every dollar goes in the Financials tab of your portal.' },
      { q: 'What are allowances?', a: 'For selections you have not finalized yet (tile, fixtures, appliances, etc.), we set a reasonable budget called an allowance. When you make your final picks, you see exactly how they compare to that allowance — no surprises.' },
      { q: 'What happens if costs change?', a: 'Any change to scope or cost becomes a change order that you review and approve before the work happens. You are always in control of your budget.' },
      { q: 'How and when do I pay?', a: 'Payments follow clear milestones (often draws aligned with your lender). Every invoice and payment is tracked in your portal so you always know where you stand.' },
      { q: 'Will I really see the real numbers?', a: 'Yes. Transparency is the whole point of cost-plus. Your contract value, budget, allowances, change orders, and payment history all live in one place you can open anytime.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'design-selections',
    order: 3,
    icon: 'Palette',
    title: 'Design & Selections',
    tagline: 'In-house design that makes choosing easy',
    intro:
      'Choosing finishes is where a house becomes your home — and where many builds get stressful. Skyeline pairs you with an in-house designer so every selection feels guided, cohesive, and unmistakably you.',
    faqs: [
      { q: 'Do I have to pick everything myself?', a: 'No. Your designer curates options that fit your style and budget, so you are choosing from a thoughtful shortlist instead of a paralyzing wall of samples. You can lean on us, mix, or drive it yourself.' },
      { q: 'How do selections work in the portal?', a: 'Every finish and material shows up in the Selections tab for you to review and approve. You can see what is decided, what is pending, and what is coming up next — all in one organized place.' },
      { q: 'Can I bring my own inspiration?', a: 'Absolutely. Share Pinterest boards, photos you love, and notes on the direction you are going. Your designer uses them to shape your options from day one — even before your project officially kicks off.' },
      { q: 'What if I change my mind?', a: 'Until a selection is locked for ordering, you can keep refining. Once something needs to be ordered to keep your schedule, we will let you know it is time to finalize.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'your-portal',
    order: 4,
    icon: 'LayoutDashboard',
    title: 'Your Portal & Communication',
    tagline: 'One home base for your entire build',
    intro:
      'This portal is your single source of truth for the whole project. No more digging through emails or texts — your schedule, money, decisions, documents, and daily field updates all live here.',
    faqs: [
      { q: 'What can I see in the portal?', a: 'Your build progress and schedule, financials and payments, design selections, change orders, daily site logs, project documents, photos of your home going up, and a direct message thread with your team.' },
      { q: 'How do I reach my team?', a: 'Use the Messages tab. Everything stays in one thread, so questions and answers are never lost and anyone on the Skyeline team can pick up the context instantly.' },
      { q: 'Will I get updates as the build progresses?', a: 'Yes. Site logs and photos flow in from the field, and key milestones update automatically. You can check in anytime, from your phone or computer.' },
      { q: 'Is my information private?', a: 'Your portal is yours. It is secured behind your login, and only you and your Skyeline team can see your project.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'timeline',
    order: 5,
    icon: 'CalendarClock',
    title: 'Timeline & What to Expect',
    tagline: 'A realistic look at the journey',
    intro:
      'A custom home is a journey with a rhythm. Knowing roughly what happens when — and how long each part takes — makes the whole experience calmer and more enjoyable.',
    faqs: [
      { q: 'How long does a custom home take?', a: 'Every home is different, but most custom builds run several months to about a year from groundbreaking, depending on size, complexity, weather, and selections. Once your estimate is finalized, your specific timeline appears in the Schedule tab.' },
      { q: 'What happens before we break ground?', a: 'Plans, estimate, selections, permits, and financing all come together first. This pre-construction phase sets up a smooth build — the more decisions made up front, the fewer surprises later.' },
      { q: 'What are the big milestones?', a: 'Typically: foundation, framing, dry-in, mechanicals, insulation and drywall, interior finishes, exterior finishes, final touches, and your walkthrough. You will be able to follow each one in real time.' },
      { q: 'What can affect the schedule?', a: 'Weather, change orders, long-lead selection items, and inspections can all shift dates. We keep your schedule updated so you always have the most current picture.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'warranty',
    order: 6,
    icon: 'ShieldCheck',
    title: 'Warranty & After-Care',
    tagline: 'We are here after move-in, too',
    intro:
      'Handing you the keys is not the end of our relationship. Skyeline stands behind the homes we build with a clear warranty and a simple way to get help when you need it.',
    faqs: [
      { q: 'What does the warranty cover?', a: 'Your warranty covers workmanship and the systems we install, per the terms in your contract. We will walk you through exactly what is covered and for how long.' },
      { q: 'How do I request service?', a: 'Reach out through your portal and we will coordinate the fix. Keeping it in one place means nothing falls through the cracks.' },
      { q: 'Do you check in after move-in?', a: 'Yes. We schedule warranty check-ins (commonly around the 3, 6, and 11-month marks) so small issues get handled before they become big ones.' },
      { q: 'What if something comes up years later?', a: 'We are a local Mapleton builder and we are not going anywhere. Even outside the formal warranty window, we want to hear from you and help you take care of your home.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'why-skyeline',
    order: 7,
    icon: 'Award',
    title: 'Why Skyeline',
    tagline: 'Extraordinary homes, extraordinary experience',
    intro:
      'There are a lot of builders. What sets Skyeline apart is the experience — the transparency, the in-house design, the technology, and the genuine care that goes into every home we build.',
    faqs: [
      { q: 'What makes Skyeline different?', a: 'We pair true cost-plus transparency with in-house design and a modern portal that keeps you informed every day. The result is a build that feels collaborative and clear instead of stressful and opaque.' },
      { q: 'What kind of homes do you build?', a: 'Custom homes across a range of finish levels — from beautifully appointed family homes to Parade-of-Homes-caliber showpieces. Your designer helps you land on the right tier for your goals and budget.' },
      { q: 'Where do you build?', a: 'We are based in Mapleton, Utah and build custom homes throughout the area. Being local means we know the trades, the inspectors, and the land.' },
      { q: 'Can I see your work?', a: 'Yes — ask your Skyeline contact for a portfolio and references, and we will share examples that match the style and scale you have in mind.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'getting-started',
    order: 8,
    icon: 'Rocket',
    title: 'Getting Started',
    tagline: 'Your next steps with Skyeline',
    intro:
      'Ready to move from dreaming to building? Here is how to take the next step — and what happens once you do.',
    faqs: [
      { q: 'What is the very first step?', a: 'A conversation. Tell us about your vision, your lot or your search for one, your budget range, and your timeline. From there we build an estimate tailored to you.' },
      { q: 'Do I need a lot already?', a: 'Not necessarily. If you already own land, great. If not, we can talk through what you are looking for and help you evaluate options.' },
      { q: 'What can I do right now in this portal?', a: 'Explore these guides, and start your inspiration board in the Selections tab — upload photos and styles you love so your designer can get a head start on your vision before the project officially begins.' },
      { q: 'How do I reach you?', a: 'Use the Messages tab anytime, or reply to your Skyeline contact directly. We would love to hear what you are imagining.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
];
