// Skyeline's standard "discover your style" quiz — the guided, image-based
// preference questions a homeowner clicks through before/while picking finishes.
// Ships as a starter; the GC adds representative photos per option in the
// Templates → Style Quiz editor. Each option's imageUrl is filled in there.

export interface StyleOption {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string;   // representative photo (GC uploads/sets in the editor)
}

export interface StyleQuestion {
  id: string;
  area: string;        // e.g. "Bathrooms", "Walls", "Kitchen"
  prompt: string;
  helpText?: string;
  options: StyleOption[];
}

const q = (id: string, area: string, prompt: string, opts: [string, string, string?][], helpText?: string): StyleQuestion => ({
  id, area, prompt, helpText,
  options: opts.map(([oid, label, description]) => ({ id: oid, label, description })),
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
