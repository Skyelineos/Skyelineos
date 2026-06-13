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
  featured?: boolean;  // true → rendered as the big hero card at the top
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
    featured: false,
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
    id: 'skyeline-story',
    order: 1,
    icon: 'Heart',
    title: 'The Skyeline Story',
    tagline: 'Why we build, and who we build for',
    intro:
      'Skyeline Homes exists for one reason: building a custom home should be one of the best experiences of your life, not one of the most stressful. We don’t just build houses — we’ve built a process that removes the stress and gives families confidence.',
    faqs: [
      { q: 'What does Skyeline actually do?', a: 'We’re a custom home builder in Mapleton, Utah. We design and build one-of-a-kind homes — and just as importantly, we’ve built a process that carries you from the first conversation to long after move-in with confidence instead of anxiety.' },
      { q: 'What makes you different from other builders?', a: 'We obsess over the experience of building, not just the building itself. Transparent pricing, in-house design, a technology platform that keeps you informed daily, and a team that treats your home like our own.' },
      { q: 'Who do you build for?', a: 'Families who want a home that’s truly theirs — and who want to actually enjoy the journey of creating it. Whether it’s your forever home or a Parade-of-Homes showpiece, we tailor the experience to you.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
    featured: true,
  },
  {
    id: 'why-skyeline',
    order: 2,
    icon: 'Award',
    title: 'Why Build With Skyeline',
    tagline: "The honest answer to 'why you instead of another builder?'",
    intro:
      'It’s the most important question you’ll ask, and you should. Here’s exactly why families choose Skyeline — and what you get that most builders simply can’t offer.',
    faqs: [
      { q: 'How is communication handled?', a: 'Through one place — this portal — plus a direct line to your team. No chasing phone calls, no lost email threads. Every question, decision, and update lives in one organized thread.' },
      { q: 'How do I know I’m being treated fairly on price?', a: 'We build on a transparent cost-plus model. You see the real cost of your home and exactly what our fee is — nothing is buried. (See the “What Does It Actually Cost?” guide for the full picture.)' },
      { q: 'What about quality?', a: 'We hold a consistent standard across every trade and every phase, and we document the work as it happens so nothing gets glossed over.' },
      { q: 'What’s the technology advantage?', a: 'SkyelineOS — the platform you’re using right now. Most builders can’t show you your schedule, budget, selections, and daily field photos in real time. We can. (See the SkyelineOS guide.)' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'client-journey',
    order: 3,
    icon: 'CalendarClock',
    title: 'The Client Journey',
    tagline: 'Exactly what happens, first call to move-in',
    intro:
      'Most people have never built a home before, and the unknown is the scariest part. Here’s the whole journey laid out so you know exactly what to expect at every step.',
    faqs: [
      { q: 'What are the stages?', a: 'Discovery → Design → Budgeting → Permits → Construction → Walkthrough → Warranty. Each stage has a clear purpose, and you’ll always know which one you’re in.' },
      { q: 'How long does it take?', a: 'Pre-construction (design, budget, permits) varies; construction is typically several months to about a year depending on size and complexity. Once your estimate is finalized, your specific timeline appears in the Schedule tab.' },
      { q: 'How much say do I have along the way?', a: 'A lot. Nothing major moves forward without your approval — selections, change orders, and budget decisions all run through you.' },
      { q: 'What happens after move-in?', a: 'We don’t disappear. A clear warranty and scheduled check-ins (commonly around the 3, 6, and 11-month marks) keep us connected after you’ve got the keys.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'welcome',
    order: 4,
    icon: 'Rocket',
    title: 'Welcome to Skyeline',
    tagline: "You're here — what happens next",
    intro:
      'Welcome. Creating your portal is the first step. Here’s what to expect now and how we’ll get your project moving.',
    faqs: [
      { q: 'What happens now that I’m in the portal?', a: 'This is your home base. Right now you can explore these guides and start an inspiration board so your designer can get a head start on your vision — even before your project officially begins.' },
      { q: 'What are the immediate next steps?', a: 'We’ll have a conversation about your goals, your lot, and your budget, then build your estimate. From there your project gets set up and the schedule, financials, and updates start flowing into this portal.' },
      { q: 'Who’s on my team?', a: 'You’ll have a dedicated Skyeline contact, a designer, and a project manager. You can reach them anytime in the Messages tab.' },
      { q: 'What do you need from me?', a: 'Your vision, your budget range, your lot (or help finding one), and the styles you love. The more you share early, the smoother everything goes.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'what-does-it-cost',
    order: 5,
    icon: 'DollarSign',
    title: 'What Does It Actually Cost?',
    tagline: 'Straight answers on custom home pricing',
    intro:
      'Every custom home buyer asks this first, and they should. Here’s an honest look at what drives the cost of a custom home and how Skyeline keeps it transparent.',
    faqs: [
      { q: 'How does Skyeline price a home?', a: 'Cost-plus: you pay the actual cost of work and materials plus an agreed contractor fee. You see where every dollar goes in the Financials tab — no hidden markups.' },
      { q: 'What about cost per square foot?', a: 'It’s a useful starting point, but it varies a lot with finishes, site conditions, and design complexity. We give you real numbers tied to your actual plans, not a vague range.' },
      { q: 'What costs do people forget about?', a: 'Land, site work (excavation, utilities, grading), permits, and finish selections that come in above their allowances. We surface these up front so they’re never a surprise.' },
      { q: 'What’s an allowance?', a: 'A budgeted amount for selections you haven’t finalized yet (tile, fixtures, appliances). When you choose, you see exactly how your picks compare to that budget.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'biggest-mistakes',
    order: 6,
    icon: 'Lightbulb',
    title: 'Biggest Mistakes to Avoid',
    tagline: 'Learn from others before you build',
    intro:
      'A few avoidable mistakes cause most of the stress and overruns in custom home building. Here’s what to watch for, so your build goes smoothly.',
    faqs: [
      { q: 'What’s the most common mistake?', a: 'Designing before setting a budget. It leads to plans you love but can’t build. We pair design and budget from the start so your home is beautiful and buildable.' },
      { q: 'Does picking the cheapest builder backfire?', a: 'Often. The lowest bid usually means corners cut, vague allowances, or surprises later. Transparent pricing beats a low number you can’t trust.' },
      { q: 'What about the lot?', a: 'Buying the wrong lot — bad slope, expensive site work, utility headaches — can blow a budget before you break ground. We help you evaluate land before you commit.' },
      { q: 'What trips people up during the build?', a: 'Not planning selections early. Long-lead items chosen late can stall your schedule. We keep you ahead of every deadline.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'custom-vs-existing',
    order: 7,
    icon: 'Home',
    title: 'Custom vs. Buying Existing',
    tagline: 'Is building right for you?',
    intro:
      'Should you build or buy something already on the market? Here’s an honest comparison to help you decide.',
    faqs: [
      { q: 'Why build instead of buy?', a: 'You get exactly what you want — your layout, your finishes, your lot — instead of compromising on someone else’s choices and then paying to renovate.' },
      { q: 'Isn’t buying existing easier?', a: 'It can be faster, but you inherit the previous owner’s decisions, deferred maintenance, and dated finishes. Building gives you a brand-new home tailored to how your family actually lives.' },
      { q: 'Is building more expensive?', a: 'Not always, once you factor in renovations, repairs, and compromises on an existing home. And with transparent cost-plus pricing, you control the investment.' },
      { q: 'What if I’ve never built before?', a: 'That’s exactly who our process is built for. We guide you through every step so the unknown becomes a clear, confident path.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'skyelineos-technology',
    order: 8,
    icon: 'LayoutDashboard',
    title: 'SkyelineOS Technology',
    tagline: "The platform most builders can't offer",
    intro:
      'You’re using it right now. SkyelineOS is our custom platform that keeps your entire build organized and transparent — a real competitive advantage you won’t find with most builders.',
    faqs: [
      { q: 'What can I do in the portal?', a: 'Track build progress and schedule, see your financials and payments, review and approve design selections, follow daily site logs and photos, access documents, and message your team — all in one place.' },
      { q: 'Why does this matter?', a: 'No more digging through emails and texts. Everything about your home lives in one source of truth you can open anytime, from your phone or computer.' },
      { q: 'Can I see my home being built?', a: 'Yes. Site logs and photos flow in from the field so you can watch your home come together week by week, even when you can’t visit.' },
      { q: 'Is my information secure and private?', a: 'Your portal is yours — secured behind your login, visible only to you and your Skyeline team.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'meet-tyler',
    order: 9,
    icon: 'User',
    title: 'Meet Tyler',
    tagline: 'The person behind Skyeline',
    intro:
      'People hire people. Here’s a bit about why I build, the standards I hold, and what you can expect when you work with Skyeline.',
    faqs: [
      { q: 'Why did you start Skyeline?', a: 'Because too many families have a miserable building experience, and it doesn’t have to be that way. I built Skyeline around the process I’d want if I were the one building.' },
      { q: 'What are your standards?', a: 'Do it right, communicate constantly, and treat every client’s home and budget like my own. If something’s not right, we fix it.' },
      { q: 'What frustrates you about the industry?', a: 'Hidden pricing, poor communication, and builders who go quiet when problems come up. We built Skyeline to be the opposite.' },
      { q: 'What can clients expect from you personally?', a: 'Straight answers, real transparency, and a team that’s genuinely invested in your home turning out exactly as you imagined.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'meet-the-team',
    order: 10,
    icon: 'Users',
    title: 'Meet the Team',
    tagline: 'The people building your home',
    intro:
      'Building a custom home takes a team. Here’s who you’ll work with and how each person supports your project.',
    faqs: [
      { q: 'Who will I work with?', a: 'Your dedicated Skyeline contact, a project manager who runs the day-to-day build, a designer who guides your selections, and our office staff keeping everything on track.' },
      { q: 'Who do I go to with questions?', a: 'Use the Messages tab — your whole team can see the thread, so you get fast, informed answers without repeating yourself.' },
      { q: 'How big is the team?', a: 'Large enough to deliver at a high standard, small enough that you’re never just a number. You’ll know the people building your home.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'trade-partners',
    order: 11,
    icon: 'Hammer',
    title: 'Meet Our Trade Partners',
    tagline: 'Quality you can see in the details',
    intro:
      'A home is only as good as the trades who build it. We partner with skilled framers, finish carpenters, electricians, painters, and more — and that shows up in the finished product.',
    faqs: [
      { q: 'Who actually builds my home?', a: 'Vetted trade partners we’ve worked with and trust — framers, finish carpenters, electricians, plumbers, painters, and specialty trades — all coordinated by your Skyeline project manager.' },
      { q: 'How do you ensure quality across trades?', a: 'Consistent standards, clear scopes, and documentation at every phase. We hold every trade to the same bar and check the work as it goes.' },
      { q: 'Why does this matter to me?', a: 'Great trades mean fewer callbacks, cleaner finishes, and a home that holds up. It’s quality you can feel, not just a claim.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'client-testimonials',
    order: 12,
    icon: 'MessageSquare',
    title: 'What Our Clients Say',
    tagline: 'In their words',
    intro:
      'The best way to know what it’s like to build with Skyeline is to hear from families who already have. Video stories are coming soon — here’s the kind of thing they tell us.',
    faqs: [
      { q: 'What do clients worry about before starting?', a: 'Almost everyone fears the same things: going over budget, poor communication, and the process becoming a nightmare. Our entire approach is designed to take those fears off the table.' },
      { q: 'How is the process different than people expect?', a: 'Clients tell us the transparency and constant communication surprised them most — they always knew what was happening and what came next.' },
      { q: 'Can I talk to past clients?', a: 'Absolutely. Ask your Skyeline contact and we’ll connect you with references who built homes like yours.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
  {
    id: 'design-inspiration',
    order: 13,
    icon: 'Palette',
    title: 'Design Inspiration',
    tagline: 'Start dreaming — and shaping your vision',
    intro:
      'Your home should feel unmistakably yours. Start gathering ideas now, and your designer can begin shaping your vision before the project even officially begins.',
    faqs: [
      { q: 'How do I start?', a: 'Head to the Selections tab and start an inspiration board — upload photos of kitchens, bathrooms, exteriors, and layouts you love. Add Pinterest boards and notes too.' },
      { q: 'What kinds of ideas help most?', a: 'Anything that shows your taste — finishes, color palettes, fixtures, room layouts, and overall styles you’re drawn to. Even examples of what you don’t like help.' },
      { q: 'What happens with my inspiration?', a: 'Your designer uses it to curate selection options tailored to your style and budget, so choosing finishes feels guided instead of overwhelming.' },
      { q: 'Do I need to decide anything now?', a: 'Not at all. This is the fun, pressure-free part — collect what you love and we’ll refine it together.' },
    ],
    videoUrl: '',
    documents: [],
    published: true,
  },
];
