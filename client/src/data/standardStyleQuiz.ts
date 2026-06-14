// Skyeline's standard "discover your style" quiz — the guided, image-based
// preference questions a homeowner clicks through before/while picking finishes.
//
// Each option supports a STRUCTURED GALLERY of renderings (hero + context +
// detail + comparison), not just one photo. The GC adds the rendered images per
// slot in Templates → Style Quiz; until then the slots are empty placeholders.
//
// TODO(renderings): upload the generated images into each option's slots
// (Templates → Style Quiz → option → photo manager). See render prompts shared
// with the team. Image generation happens externally — the app only stores/links.

export type StyleImageType = 'hero' | 'context1' | 'context2' | 'detail' | 'comparison';

// Reusable schema for a style-quiz image asset (kept generic so future
// AI-generated renderings attach the same way).
export interface StyleOptionImage {
  imageId: string;
  optionId: string;
  questionId: string;
  imageType: StyleImageType | string;
  title: string;
  description?: string;
  altText?: string;
  sortOrder: number;
  storagePath?: string;     // Firebase Storage path (when uploaded)
  imageUrl?: string;        // download URL — EMPTY until a rendering is uploaded
  isHero?: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface StyleOption {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;              // legacy single image — kept for backward compat
  images?: StyleOptionImage[];    // structured gallery (preferred)
}

export interface StyleQuestion {
  id: string;
  area: string;
  prompt: string;
  helpText?: string;
  options: StyleOption[];
}

// The five standard placeholder slots created for every option.
export const STYLE_IMAGE_SLOTS: { type: StyleImageType; title: string }[] = [
  { type: 'hero', title: 'Hero' },
  { type: 'context1', title: 'Context View 1' },
  { type: 'context2', title: 'Context View 2' },
  { type: 'detail', title: 'Detail View' },
  { type: 'comparison', title: 'Comparison View' },
];

// Build the empty placeholder slots for one option.
export function makeImageSlots(questionId: string, optionId: string): StyleOptionImage[] {
  return STYLE_IMAGE_SLOTS.map((s, i) => ({
    imageId: `${optionId}-${s.type}`,
    optionId,
    questionId,
    imageType: s.type,
    title: s.title,
    altText: '',
    sortOrder: i,
    imageUrl: '', // TODO(renderings): upload the generated image here
    isHero: s.type === 'hero',
  }));
}

// ── Backward-compatible accessors (never hardcode image lookups in UI) ───────

// The thumbnail shown on an option card. Prefers the gallery's hero, then any
// gallery image with a URL, then the legacy single imageUrl.
export function heroImageUrl(option: Pick<StyleOption, 'images' | 'imageUrl'>): string | undefined {
  const imgs = (option.images || []).filter(i => i.imageUrl);
  const hero = imgs.find(i => i.isHero) || imgs.find(i => i.imageType === 'hero') || imgs[0];
  return hero?.imageUrl || option.imageUrl || undefined;
}

// All displayable gallery images for an option (only ones with a URL), ordered.
// Falls back to the legacy single image so old data still shows.
export function galleryImages(option: Pick<StyleOption, 'images' | 'imageUrl' | 'id'>): StyleOptionImage[] {
  const imgs = (option.images || [])
    .filter(i => i.imageUrl)
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  if (imgs.length) return imgs;
  if (option.imageUrl) {
    return [{ imageId: `${option.id || 'legacy'}-legacy`, optionId: option.id || '', questionId: '', imageType: 'hero', title: '', sortOrder: 0, imageUrl: option.imageUrl, isHero: true }];
  }
  return [];
}

const q = (id: string, area: string, prompt: string, opts: [string, string, string?][], helpText?: string): StyleQuestion => ({
  id, area, prompt, helpText,
  options: opts.map(([oid, label, description]) => ({
    id: oid, label, description,
    images: makeImageSlots(id, oid),
  })),
});

export const STANDARD_STYLE_QUIZ: StyleQuestion[] = [
  q('overall-style', 'Overall', 'Which overall look feels most like you?', [
    ['modern-farmhouse', 'Modern Farmhouse', 'Warm woods, black accents, shiplap'],
    ['transitional', 'Transitional', 'A blend of classic and contemporary'],
    ['contemporary', 'Contemporary', 'Clean lines, minimal, sleek'],
    ['traditional', 'Traditional', 'Timeless, detailed millwork, classic'],
  ], 'Sets the tone — we tailor the rest of your selections around this.'),

  q('main-flooring', 'Flooring', 'Main-level flooring?', [
    ['engineered-hardwood', 'Engineered Hardwood', 'Real wood feel, warm'],
    ['lvp', 'Luxury Vinyl Plank', 'Durable, waterproof, kid/pet friendly'],
  ]),

  q('bath-flooring', 'Bathrooms', 'Bathroom flooring?', [
    ['tile', 'Tile', 'Classic, fully waterproof, lots of styles'],
    ['lvp', 'Luxury Vinyl Plank', 'Warmer underfoot, seamless with main floor'],
  ], 'Example: tile vs LVP in the bathrooms.'),

  q('wall-treatment', 'Walls', 'Wall color approach?', [
    ['light-neutral', 'Light & Neutral', 'Bright, airy, timeless'],
    ['accent-walls', 'Accent Walls', 'Bold feature walls in key rooms'],
    ['mixed', 'A Mix', 'Mostly neutral with a few accents'],
  ], 'Light/neutral walls vs accent walls.'),

  q('cabinetry-style', 'Cabinetry', 'Cabinetry & trim style?', [
    ['craftsman', 'Craftsman', 'Shaker doors, substantial trim, detailed'],
    ['transitional', 'Transitional', 'Soft blend, simple shaker, versatile'],
    ['modern', 'Modern', 'Flat-panel, handleless, minimal'],
  ], 'Craftsman vs transitional vs modern.'),

  q('kitchen-counters', 'Kitchen', 'Kitchen countertops?', [
    ['quartz', 'Quartz', 'Durable, low-maintenance, consistent'],
    ['granite', 'Granite', 'Natural stone, unique veining'],
    ['marble-look', 'Marble-Look', 'Dramatic veining, bright'],
  ]),

  q('cabinet-color', 'Kitchen', 'Kitchen cabinet color direction?', [
    ['white-light', 'White / Light', 'Bright and clean'],
    ['wood-tone', 'Natural Wood', 'Warm, organic'],
    ['two-tone', 'Two-Tone', 'Light uppers, darker island/base'],
    ['dark-moody', 'Dark / Moody', 'Deep greens, navy, charcoal'],
  ]),

  q('lighting-feel', 'Lighting', 'Lighting feel?', [
    ['warm-cozy', 'Warm & Cozy', 'Softer, ambient, layered'],
    ['bright-airy', 'Bright & Airy', 'Crisp, lots of light'],
  ]),

  q('exterior', 'Exterior', 'Exterior finish direction?', [
    ['stucco', 'Stucco', 'Smooth, clean'],
    ['stone-accent', 'Stone Accents', 'Natural stone features'],
    ['board-batten', 'Board & Batten', 'Vertical siding, farmhouse'],
    ['mixed', 'A Mix', 'Stone + siding combo'],
  ]),
];
