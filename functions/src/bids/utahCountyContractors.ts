// utahCountyContractors.ts
// -----------------------------------------------------------------------------
// Curated seed list of Utah County subcontractors organized by trade. Used by
// bidSolicitation.ts when GOOGLE_PLACES_API_KEY isn't set (or as the default
// pool that gets *merged* with live search results). Tyler will update real
// emails/phones before actual dispatch — placeholders here are formatted so
// they're obvious in the UI ("info@[companyslug].com").
//
// Data quality note: these are realistic Utah County builder-network names
// (Alpine, Timpanogos, Wasatch, Provo, Lehi, American Fork, Orem, etc.) with
// placeholder contact info. Real-world sourcing is expected to happen either
// via Google Places or by Tyler pasting his address book into the seed.
//
// Contract:
//   TRADES               → the canonical list of trades for a Skyeline build
//   getSeedContractors() → returns SeedContractor[] filtered by trade slug

export type TradeSlug =
  | 'concrete'
  | 'site-prep'
  | 'framing'
  | 'roofing'
  | 'plumbing'
  | 'electrical'
  | 'hvac'
  | 'insulation'
  | 'drywall'
  | 'painting'
  | 'flooring'
  | 'cabinets'
  | 'windows-doors'
  | 'masonry'
  | 'landscaping'
  | 'garage-doors'
  | 'tile'
  | 'trim-carpentry'
  | 'waterproofing'
  | 'fireplace';

export interface TradeMeta {
  slug: TradeSlug;
  label: string;
  // Short scope-of-work blurb the email body uses so subs know what they're
  // bidding on before they even click through.
  scope: string;
}

export const TRADES: TradeMeta[] = [
  { slug: 'concrete',       label: 'Concrete',              scope: 'Footings, foundation walls, flatwork (garage, driveway approach, patios).' },
  { slug: 'site-prep',      label: 'Site Prep / Excavation', scope: 'Site clearing, excavation, backfill, rough grade, utility trenching.' },
  { slug: 'framing',        label: 'Framing',               scope: 'Rough framing labor + hardware. Includes wall, floor, and roof framing.' },
  { slug: 'roofing',        label: 'Roofing',               scope: 'Underlayment, shingles/metal, flashing, ridge vents, warranty.' },
  { slug: 'plumbing',       label: 'Plumbing',              scope: 'Rough-in through trim. Water, waste, gas, fixtures per plans.' },
  { slug: 'electrical',     label: 'Electrical',            scope: 'Service, rough-in, low-voltage prewire, trim, panel labeling.' },
  { slug: 'hvac',           label: 'HVAC',                  scope: 'Load calc, equipment, ductwork, gas-fired furnace + AC, ventilation.' },
  { slug: 'insulation',     label: 'Insulation',            scope: 'Batts, blown-in attic, spray foam where called out on plans.' },
  { slug: 'drywall',        label: 'Drywall',               scope: 'Hang, tape, texture (level 4 walls / level 5 where noted). Ready for paint.' },
  { slug: 'painting',       label: 'Painting',              scope: 'Prime + finish, interior + exterior, trim work, cabinet finishes if applicable.' },
  { slug: 'flooring',       label: 'Flooring',              scope: 'Hardwood, LVP, carpet install per selection sheet.' },
  { slug: 'cabinets',       label: 'Cabinets / Millwork',   scope: 'Kitchen, bath, laundry cabinetry + built-ins. Includes install.' },
  { slug: 'windows-doors',  label: 'Windows & Doors',       scope: 'Supply + install of exterior/interior windows and doors per schedule.' },
  { slug: 'masonry',        label: 'Masonry / Stucco',      scope: 'Stone/brick veneer, stucco, chimney, exterior architectural detail.' },
  { slug: 'landscaping',    label: 'Landscaping',           scope: 'Final grade, sod, irrigation, planter beds, hardscape as noted.' },
  { slug: 'garage-doors',   label: 'Garage Doors',          scope: 'Supply + install of overhead garage doors, openers, keypads.' },
  { slug: 'tile',           label: 'Tile',                  scope: 'Kitchen backsplash, bath surrounds, floor tile, waterproofing at wet areas.' },
  { slug: 'trim-carpentry', label: 'Trim Carpentry',        scope: 'Baseboard, casing, crown, wainscot, closet systems, stair skirts.' },
  { slug: 'waterproofing',  label: 'Waterproofing',         scope: 'Foundation waterproofing + drainage board, weeps, sump prep.' },
  { slug: 'fireplace',      label: 'Fireplace',             scope: 'Gas fireplace supply + install, surround framing, venting.' },
];

export interface SeedContractor {
  name: string;
  trade: TradeSlug;
  email: string;
  phone?: string;
  city?: string;
  notes?: string;
}

// Placeholder-email format is intentional: Tyler will replace with real
// contacts before dispatch. Marking them clearly makes accidental sends easy
// to spot.
const P = (slug: string): string => `info@${slug}.com`;

// Utah County contractor seeds — 3–5 per trade. Names reflect the mountain
// west / Utah County builder market (Alpine, Timpanogos, Wasatch, Provo, Orem,
// Lehi, American Fork). All emails are placeholders.
export const UTAH_COUNTY_CONTRACTORS: SeedContractor[] = [
  // Concrete
  { name: 'Alpine Concrete Inc',       trade: 'concrete', email: P('alpineconcrete'),     city: 'Alpine, UT' },
  { name: 'Timpanogos Foundations',    trade: 'concrete', email: P('timpanogosfoundations'), city: 'Pleasant Grove, UT' },
  { name: 'Wasatch Flatwork LLC',      trade: 'concrete', email: P('wasatchflatwork'),    city: 'Orem, UT' },
  { name: 'American Fork Concrete',    trade: 'concrete', email: P('americanforkconcrete'), city: 'American Fork, UT' },

  // Site prep / excavation
  { name: 'Highland Excavation',       trade: 'site-prep', email: P('highlandexcavation'), city: 'Highland, UT' },
  { name: 'Lehi Site Works',           trade: 'site-prep', email: P('lehisiteworks'),     city: 'Lehi, UT' },
  { name: 'Wasatch Earthmoving',       trade: 'site-prep', email: P('wasatchearthmoving'), city: 'Provo, UT' },
  { name: 'Cedar Hills Grading',       trade: 'site-prep', email: P('cedarhillsgrading'), city: 'Cedar Hills, UT' },

  // Framing
  { name: 'Timpanogos Framing LLC',    trade: 'framing', email: P('timpanogosframing'),   city: 'Pleasant Grove, UT' },
  { name: 'Alpine Framing Co',         trade: 'framing', email: P('alpineframing'),       city: 'Alpine, UT' },
  { name: 'Provo Custom Framing',      trade: 'framing', email: P('provocustomframing'),  city: 'Provo, UT' },
  { name: 'Wasatch Frame Works',       trade: 'framing', email: P('wasatchframeworks'),   city: 'Lehi, UT' },

  // Roofing
  { name: 'Utah Valley Roofing',       trade: 'roofing', email: P('utahvalleyroofing'),   city: 'Orem, UT' },
  { name: 'Alpine Roofing Co',         trade: 'roofing', email: P('alpineroofingco'),     city: 'American Fork, UT' },
  { name: 'Peak Roofing Utah',         trade: 'roofing', email: P('peakroofingutah'),     city: 'Lehi, UT' },
  { name: 'Wasatch Roof Systems',      trade: 'roofing', email: P('wasatchroofsystems'),  city: 'Provo, UT' },

  // Plumbing
  { name: 'Timpanogos Plumbing',       trade: 'plumbing', email: P('timpanogosplumbing'), city: 'Pleasant Grove, UT' },
  { name: 'Alpine Plumbing Services',  trade: 'plumbing', email: P('alpineplumbingservices'), city: 'Alpine, UT' },
  { name: 'Provo Pro Plumbers',        trade: 'plumbing', email: P('provoproplumbers'),   city: 'Provo, UT' },
  { name: 'Wasatch Water Works',       trade: 'plumbing', email: P('wasatchwaterworks'),  city: 'Orem, UT' },

  // Electrical
  { name: 'Alpine Electric Inc',       trade: 'electrical', email: P('alpineelectric'),   city: 'American Fork, UT' },
  { name: 'Timpanogos Electric',       trade: 'electrical', email: P('timpanogoselectric'), city: 'Pleasant Grove, UT' },
  { name: 'Wasatch Wiring LLC',        trade: 'electrical', email: P('wasatchwiring'),    city: 'Lehi, UT' },
  { name: 'Utah Valley Electric',      trade: 'electrical', email: P('utahvalleyelectric'), city: 'Orem, UT' },

  // HVAC
  { name: 'Alpine Heating & Air',      trade: 'hvac', email: P('alpineheatingair'),       city: 'Alpine, UT' },
  { name: 'Timpanogos HVAC',           trade: 'hvac', email: P('timpanogoshvac'),         city: 'Pleasant Grove, UT' },
  { name: 'Wasatch Climate Control',   trade: 'hvac', email: P('wasatchclimatecontrol'), city: 'Orem, UT' },
  { name: 'Utah Valley Heating',       trade: 'hvac', email: P('utahvalleyheating'),      city: 'Provo, UT' },

  // Insulation
  { name: 'Wasatch Insulation',        trade: 'insulation', email: P('wasatchinsulation'), city: 'Lehi, UT' },
  { name: 'Alpine Foam & Batt',        trade: 'insulation', email: P('alpinefoamandbatt'), city: 'American Fork, UT' },
  { name: 'Timpanogos Insulators',     trade: 'insulation', email: P('timpanogosinsulators'), city: 'Pleasant Grove, UT' },

  // Drywall
  { name: 'Alpine Drywall Co',         trade: 'drywall', email: P('alpinedrywall'),       city: 'American Fork, UT' },
  { name: 'Wasatch Wall Systems',      trade: 'drywall', email: P('wasatchwallsystems'),  city: 'Orem, UT' },
  { name: 'Timpanogos Drywall',        trade: 'drywall', email: P('timpanogosdrywall'),   city: 'Pleasant Grove, UT' },
  { name: 'Provo Finish Drywall',      trade: 'drywall', email: P('provofinishdrywall'),  city: 'Provo, UT' },

  // Painting
  { name: 'Alpine Painting Inc',       trade: 'painting', email: P('alpinepainting'),     city: 'Alpine, UT' },
  { name: 'Wasatch Painters',          trade: 'painting', email: P('wasatchpainters'),    city: 'Provo, UT' },
  { name: 'Timpanogos Painting Co',    trade: 'painting', email: P('timpanogospainting'), city: 'Pleasant Grove, UT' },
  { name: 'Utah Valley Finishes',      trade: 'painting', email: P('utahvalleyfinishes'), city: 'Orem, UT' },

  // Flooring
  { name: 'Alpine Flooring Gallery',   trade: 'flooring', email: P('alpineflooringgallery'), city: 'American Fork, UT' },
  { name: 'Wasatch Hardwood Floors',   trade: 'flooring', email: P('wasatchhardwoodfloors'), city: 'Lehi, UT' },
  { name: 'Timpanogos Flooring',       trade: 'flooring', email: P('timpanogosflooring'), city: 'Pleasant Grove, UT' },
  { name: 'Provo Custom Floors',       trade: 'flooring', email: P('provocustomfloors'),  city: 'Provo, UT' },

  // Cabinets / millwork
  { name: 'Alpine Custom Cabinets',    trade: 'cabinets', email: P('alpinecustomcabinets'), city: 'American Fork, UT' },
  { name: 'Timpanogos Millwork',       trade: 'cabinets', email: P('timpanogosmillwork'), city: 'Pleasant Grove, UT' },
  { name: 'Wasatch Cabinet Co',        trade: 'cabinets', email: P('wasatchcabinetco'),   city: 'Lehi, UT' },
  { name: 'Utah Valley Cabinetry',     trade: 'cabinets', email: P('utahvalleycabinetry'), city: 'Orem, UT' },

  // Windows & doors
  { name: 'Utah Window & Door',        trade: 'windows-doors', email: P('utahwindowanddoor'), city: 'Orem, UT' },
  { name: 'Alpine Millwork W&D',       trade: 'windows-doors', email: P('alpinemillworkwd'), city: 'American Fork, UT' },
  { name: 'Wasatch Glass & Door',      trade: 'windows-doors', email: P('wasatchglassanddoor'), city: 'Lehi, UT' },

  // Masonry / stucco
  { name: 'Alpine Stone & Stucco',     trade: 'masonry', email: P('alpinestoneandstucco'), city: 'Alpine, UT' },
  { name: 'Wasatch Masonry LLC',       trade: 'masonry', email: P('wasatchmasonry'),      city: 'Orem, UT' },
  { name: 'Timpanogos Stone Works',    trade: 'masonry', email: P('timpanogosstoneworks'), city: 'Pleasant Grove, UT' },

  // Landscaping
  { name: 'Alpine Landscape Design',   trade: 'landscaping', email: P('alpinelandscapedesign'), city: 'Alpine, UT' },
  { name: 'Wasatch Landscape Co',      trade: 'landscaping', email: P('wasatchlandscapeco'), city: 'Provo, UT' },
  { name: 'Timpanogos Lawn & Land',    trade: 'landscaping', email: P('timpanogoslawnandland'), city: 'Pleasant Grove, UT' },
  { name: 'Utah Valley Outdoor',       trade: 'landscaping', email: P('utahvalleyoutdoor'), city: 'Orem, UT' },

  // Garage doors
  { name: 'Alpine Garage Doors',       trade: 'garage-doors', email: P('alpinegaragedoors'), city: 'American Fork, UT' },
  { name: 'Utah Valley Overhead',      trade: 'garage-doors', email: P('utahvalleyoverhead'), city: 'Orem, UT' },
  { name: 'Wasatch Door Systems',      trade: 'garage-doors', email: P('wasatchdoorsystems'), city: 'Lehi, UT' },

  // Tile
  { name: 'Alpine Tile Works',         trade: 'tile', email: P('alpinetileworks'),        city: 'American Fork, UT' },
  { name: 'Timpanogos Tile Co',        trade: 'tile', email: P('timpanogostileco'),       city: 'Pleasant Grove, UT' },
  { name: 'Wasatch Custom Tile',       trade: 'tile', email: P('wasatchcustomtile'),      city: 'Orem, UT' },
  { name: 'Provo Stone & Tile',        trade: 'tile', email: P('provostoneandtile'),      city: 'Provo, UT' },

  // Trim carpentry
  { name: 'Alpine Finish Carpentry',   trade: 'trim-carpentry', email: P('alpinefinishcarpentry'), city: 'Alpine, UT' },
  { name: 'Timpanogos Trim Co',        trade: 'trim-carpentry', email: P('timpanogostrimco'), city: 'Pleasant Grove, UT' },
  { name: 'Wasatch Fine Trim',         trade: 'trim-carpentry', email: P('wasatchfinetrim'), city: 'Lehi, UT' },

  // Waterproofing
  { name: 'Alpine Waterproofing',      trade: 'waterproofing', email: P('alpinewaterproofing'), city: 'American Fork, UT' },
  { name: 'Wasatch Waterproofing',     trade: 'waterproofing', email: P('wasatchwaterproofing'), city: 'Orem, UT' },
  { name: 'Utah Valley Foundation Seal', trade: 'waterproofing', email: P('utahvalleyfoundationseal'), city: 'Provo, UT' },

  // Fireplace
  { name: 'Alpine Fireplace & Stove',  trade: 'fireplace', email: P('alpinefireplaceandstove'), city: 'American Fork, UT' },
  { name: 'Wasatch Hearth Co',         trade: 'fireplace', email: P('wasatchhearthco'),   city: 'Lehi, UT' },
  { name: 'Utah Valley Fireplace',     trade: 'fireplace', email: P('utahvalleyfireplace'), city: 'Orem, UT' },
];

/**
 * Return the seed contractors for a specific trade. Handy for the
 * solicitation engine when GOOGLE_PLACES_API_KEY isn't set (or as the initial
 * pool to merge with live search).
 */
export function getSeedContractors(trade: TradeSlug): SeedContractor[] {
  return UTAH_COUNTY_CONTRACTORS.filter((c) => c.trade === trade);
}

/**
 * Small helper for the label/scope lookup in emails + UI without importing
 * the whole array every time.
 */
export function getTradeMeta(trade: TradeSlug): TradeMeta | undefined {
  return TRADES.find((t) => t.slug === trade);
}
