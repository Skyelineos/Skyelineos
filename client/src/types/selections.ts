// ── Selections Data Model ─────────────────────────────────────────────────────
// Mirrors how Skyeline tracks finish selections in the field

export type FloorLevel = 'Main Floor' | 'Upstairs' | 'Basement' | 'Exterior' | 'All Floors';

export const FLOOR_LEVELS: FloorLevel[] = ['Main Floor', 'Upstairs', 'Basement', 'Exterior'];

export const ROOMS_BY_FLOOR: Record<FloorLevel, string[]> = {
  'Main Floor': ['Entry / Foyer', 'Kitchen', 'Pantry', 'Mudroom', 'Living Room', 'Dining Room', 'Office / Study', 'Primary Bedroom', 'Primary Bathroom', 'Powder Bath / Half Bath', 'Laundry Room', 'Garage'],
  'Upstairs':   ['Bedroom', 'Guest Suite', 'Guest Bath', 'Hall Bath', 'Laundry Closet', 'Bonus Room', 'Loft'],
  'Basement':   ['Bedroom', 'Bathroom', 'Half Bath', 'Gym', 'Game Room / Theater', 'Wet Bar', 'Cold Plunge / Sauna', 'Storage', 'Mechanical'],
  'Exterior':   ['Front Entry', 'Back Patio', 'Garage Exterior', 'Landscaping', 'Driveway'],
  'All Floors': [],
};

export const SELECTION_CATEGORIES = [
  'Tile',
  'Hardwood / LVP',
  'Carpet',
  'Cabinets & Millwork',
  'Countertops',
  'Plumbing Fixtures',
  'Appliances',
  'Lighting',
  'Paint & Wall Treatments',
  'Hardware',
  'Windows & Doors',
  'Fireplace & Hearth',
  'Garage Doors',
  'Exterior / Siding',
  'Landscaping',
  'Other',
] as const;

export type SelectionCategory = typeof SELECTION_CATEGORIES[number];

export const AREAS_BY_CATEGORY: Record<string, string[]> = {
  'Tile': ['Flooring', 'Backsplash', 'Shower Surround', 'Shower Floor', 'Shower Ceiling', 'Tub Surround', 'Niche / Shelves', 'Bench', 'Accent / Feature Wall', 'Exterior', 'Trim Tile'],
  'Hardwood / LVP': ['Main Living', 'Bedrooms', 'Hallways', 'Stairs', 'Office'],
  'Carpet': ['Bedrooms', 'Basement', 'Bonus Room', 'Stairs'],
  'Cabinets & Millwork': ['Kitchen', 'Pantry', 'Primary Bath Vanity', 'Secondary Bath Vanity', 'Mudroom', 'Laundry', 'Office Built-ins', 'Entertainment Center', 'Closet'],
  'Countertops': ['Kitchen Island', 'Kitchen Perimeter', 'Primary Bath', 'Secondary Bath', 'Laundry', 'Wet Bar'],
  'Plumbing Fixtures': ['Kitchen Sink & Faucet', 'Primary Shower', 'Primary Tub', 'Primary Faucets', 'Secondary Shower', 'Secondary Faucets', 'Powder Bath', 'Laundry Sink', 'Outdoor'],
  'Appliances': ['Refrigerator', 'Range / Cooktop', 'Oven', 'Dishwasher', 'Microwave / Hood', 'Washer / Dryer', 'Wine Fridge', 'Outdoor Grill'],
  'Lighting': ['Kitchen', 'Dining', 'Living Room', 'Primary Bedroom', 'Bathrooms', 'Exterior', 'Stairway', 'Office', 'Landscape'],
  'Paint & Wall Treatments': ['Interior Paint', 'Exterior Paint', 'Wallpaper', 'Accent Wall', 'Trim & Doors'],
  'Hardware': ['Cabinet Pulls', 'Cabinet Knobs', 'Door Handles', 'Door Hinges', 'Shower Hooks / Bars'],
  'Windows & Doors': ['Exterior Doors', 'Interior Doors', 'Windows', 'Garage Doors'],
  'Fireplace & Hearth': ['Fireplace Surround', 'Mantel', 'Hearth Tile'],
  'Other': ['Custom'],
};

export const TILE_LAYOUTS = [
  'Straight Stack', 'Brick Lay / 1/2 Offset', 'Checkerboard - Straight', 'Checkerboard - Diamond/On Point',
  'Herringbone', 'Vertical Stack', 'Plaid / Grid', 'Per Tile (Patterned)', 'Per Tile (Mosaic on mesh)',
  'Diamond/On Point', 'Versailles Pattern', 'Custom',
];

export const CLIENT_APPROVAL_STATUSES = [
  'Pending Options',
  'Checking w/ Client',
  'Checking w/ Builder',
  'Approved',
] as const;

export const ORDER_STATUSES = [
  'Not Ordered',
  'In Progress',
  'Ordered',
  'Delivered',
  'Installed',
] as const;

export type ClientApprovalStatus = typeof CLIENT_APPROVAL_STATUSES[number];
export type OrderStatus = typeof ORDER_STATUSES[number];

export interface SelectionItem {
  id: string;
  productName: string;         // Full name incl vendor: "Edward Martin - Leona 24x24 Matte Porcelain"
  vendor: string;
  size: string;                // "24x24", "3x8", etc.
  tileLayout?: string;         // Pattern/layout method
  trim?: string;               // Schluter/trim notes
  grout?: string;              // Grout color/type
  heightNote?: string;         // "To ceiling", "18 inch return"
  costPerUnit: number;
  unit: string;                // "sqft", "lft", "per piece", "per tile", "each"
  sqftOrQty?: number;
  totalCost?: number;          // costPerUnit * sqftOrQty
  productUrl?: string;
  imageUrls: string[];
  layoutImageUrls: string[];   // Installation pattern photos
  specialNotes?: string;
  status: 'proposed' | 'approved' | 'replaced' | 'removed';
  proposedBy?: string;         // designerId
  proposedAt?: any;
  fromCatalogId?: string;      // if pulled from Previously Used catalog
}

export interface DesignerFile {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'board';
  url: string;
  uploadedBy: string;
  uploadedAt: any;
  description?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string; // 'gc' | 'admin' | 'designer' | 'client'
  text: string;
  createdAt: any;
  isQuestion: boolean; // true = question needing response, false = comment
  resolved: boolean;
}

export interface Room {
  id: string;
  projectId: string;
  name: string;           // "Primary Bath", "Kitchen"
  floor: FloorLevel;
  roomType: string;       // key into ROOM_SELECTION_TEMPLATES
  sqft?: number;
  notes?: string;
  order: number;
  createdAt: any;
  updatedAt: any;
}

import type { SelectionTemplateFields } from './selections-template-extensions';

export interface Selection extends SelectionTemplateFields {
  id: string;
  projectId: string;
  floor: FloorLevel;
  room: string;
  category: SelectionCategory;
  area: string;
  allowanceAmount: number;
  allowanceUnit: string;       // "per sqft", "lump sum", "per unit"
  sqftOrQuantity?: number;
  clientApprovalStatus: ClientApprovalStatus;
  orderStatus: OrderStatus;
  clientInitials?: string;
  notes?: string;
  items: SelectionItem[];
  designerFiles: DesignerFile[];
  changeOrderId?: string;
  locked?: boolean;
  lockedAt?: any;
  lockedBy?: string;
  createdAt?: any;
  updatedAt?: any;
  // Room-linked fields
  roomId?: string;
  dueDate?: any;
  comments?: Comment[];
  etaWeeks?: number;
  heatedFloor?: boolean;
  samplePulled?: boolean;
  sku?: string;
  size?: string;          // "24x24", "3x8"
  wastePercent?: number;  // default 10
  orderQuantity?: number; // calculated: sqftOrQuantity * (1 + wastePercent/100)
  required?: boolean;
  note?: string;
  allowMultiple?: boolean;
  roomName?: string;
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export interface CatalogItem {
  id: string;
  category: SelectionCategory;
  room: string;
  area: string;
  productName: string;
  vendor: string;
  size?: string;
  tileLayout?: string;
  trim?: string;
  grout?: string;
  costPerUnit: number;
  unit: string;
  productUrl?: string;
  imageUrls: string[];
  tags: string[];              // style tags: Modern, Farmhouse, Traditional, etc.
  usedCount: number;
  projectNames: string[];      // which projects used this
  savedBy: string;
  savedAt: any;
  notes?: string;
}

export const ROOM_TYPES: { key: string; label: string; floor: string }[] = [
  { key: 'entry',              label: 'Entry / Foyer',           floor: 'Main Floor' },
  { key: 'kitchen',            label: 'Kitchen',                  floor: 'Main Floor' },
  { key: 'pantry',             label: 'Pantry',                   floor: 'Main Floor' },
  { key: 'mudroom',            label: 'Mudroom',                  floor: 'Main Floor' },
  { key: 'living_room',        label: 'Living / Great Room',      floor: 'Main Floor' },
  { key: 'dining_room',        label: 'Dining Room',              floor: 'Main Floor' },
  { key: 'office',             label: 'Office / Study',           floor: 'Main Floor' },
  { key: 'half_bath',          label: 'Half Bath / Powder',       floor: 'Main Floor' },
  { key: 'laundry',            label: 'Laundry Room',             floor: 'Main Floor' },
  { key: 'primary_bath',       label: 'Primary Bath',             floor: 'Main Floor' },
  { key: 'primary_bedroom',    label: 'Primary Bedroom',          floor: 'Main Floor' },
  { key: 'full_bath_shower',   label: 'Full Bath (Shower Only)',  floor: 'Upstairs' },
  { key: 'full_bath_tub',      label: 'Full Bath (Tub + Shower)', floor: 'Upstairs' },
  { key: 'bedroom',            label: 'Bedroom',                  floor: 'Upstairs' },
  { key: 'guest_suite',        label: 'Guest Suite',              floor: 'Upstairs' },
  { key: 'laundry_closet',     label: 'Laundry Closet',           floor: 'Upstairs' },
  { key: 'bonus_room',         label: 'Bonus / Loft',             floor: 'Upstairs' },
  { key: 'basement_bath',      label: 'Basement Bath',            floor: 'Basement' },
  { key: 'basement_half_bath', label: 'Basement Half Bath',       floor: 'Basement' },
  { key: 'basement_bedroom',   label: 'Basement Bedroom',         floor: 'Basement' },
  { key: 'gym',                label: 'Gym',                      floor: 'Basement' },
  { key: 'theater',            label: 'Theater / Game Room',      floor: 'Basement' },
  { key: 'wet_bar',            label: 'Wet Bar',                  floor: 'Basement' },
  { key: 'cold_plunge',        label: 'Cold Plunge / Sauna',      floor: 'Basement' },
  { key: 'specialty',          label: 'Specialty Room',           floor: 'Basement' },
  { key: 'exterior',           label: 'Exterior',                 floor: 'Exterior' },
  { key: 'garage',             label: 'Garage',                   floor: 'Main Floor' },
];

export interface RoomSelectionTemplate {
  category: string;
  area: string;
  required: boolean;
  note?: string;
  allowMultiple?: boolean;
}

export const ROOM_SELECTION_TEMPLATES: Record<string, RoomSelectionTemplate[]> = {
  entry: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Lighting', area: 'Kitchen', required: false },
  ],
  kitchen: [
    { category: 'Tile', area: 'Backsplash', required: true, note: 'or countertop slab / wallpaper' },
    { category: 'Tile', area: 'Backsplash', required: false, note: 'Pantry backsplash' },
    { category: 'Countertops', area: 'Kitchen Perimeter', required: true },
    { category: 'Countertops', area: 'Kitchen Island', required: false },
    { category: 'Cabinets & Millwork', area: 'Kitchen', required: true },
    { category: 'Hardware', area: 'Cabinet Pulls', required: true },
    { category: 'Plumbing Fixtures', area: 'Kitchen Sink & Faucet', required: true },
    { category: 'Appliances', area: 'Range / Cooktop', required: true },
    { category: 'Appliances', area: 'Refrigerator', required: true },
    { category: 'Appliances', area: 'Dishwasher', required: true },
    { category: 'Appliances', area: 'Microwave / Hood', required: true },
    { category: 'Lighting', area: 'Kitchen', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: false },
  ],
  pantry: [
    { category: 'Tile', area: 'Flooring', required: false },
    { category: 'Cabinets & Millwork', area: 'Pantry', required: false },
  ],
  mudroom: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Cabinets & Millwork', area: 'Mudroom', required: false },
    { category: 'Lighting', area: 'Kitchen', required: false },
  ],
  living_room: [
    { category: 'Hardwood / LVP', area: 'Main Living', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Fireplace & Hearth', area: 'Fireplace Surround', required: false },
    { category: 'Tile', area: 'Accent / Feature Wall', required: false },
    { category: 'Lighting', area: 'Living Room', required: true },
  ],
  dining_room: [
    { category: 'Hardwood / LVP', area: 'Main Living', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Lighting', area: 'Dining', required: true },
  ],
  office: [
    { category: 'Hardwood / LVP', area: 'Office', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Cabinets & Millwork', area: 'Office Built-ins', required: false },
    { category: 'Lighting', area: 'Office', required: true },
  ],
  half_bath: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Countertops', area: 'Primary Bath', required: true },
    { category: 'Cabinets & Millwork', area: 'Primary Bath Vanity', required: true },
    { category: 'Plumbing Fixtures', area: 'Powder Bath', required: true },
    { category: 'Lighting', area: 'Bathrooms', required: true },
    { category: 'Hardware', area: 'Cabinet Pulls', required: false },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: false },
  ],
  laundry: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Backsplash', required: false },
    { category: 'Countertops', area: 'Laundry', required: false },
    { category: 'Cabinets & Millwork', area: 'Laundry', required: false },
    { category: 'Plumbing Fixtures', area: 'Laundry Sink', required: false },
    { category: 'Appliances', area: 'Washer / Dryer', required: true },
  ],
  laundry_closet: [
    { category: 'Tile', area: 'Flooring', required: false },
    { category: 'Appliances', area: 'Washer / Dryer', required: true },
  ],
  primary_bedroom: [
    { category: 'Hardwood / LVP', area: 'Bedrooms', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Cabinets & Millwork', area: 'Closet', required: false },
    { category: 'Lighting', area: 'Primary Bedroom', required: true },
    { category: 'Windows & Doors', area: 'Interior Doors', required: false },
  ],
  primary_bath: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Shower Surround', required: true, allowMultiple: true },
    { category: 'Tile', area: 'Shower Floor', required: true },
    { category: 'Tile', area: 'Shower Ceiling', required: false },
    { category: 'Tile', area: 'Niche / Shelves', required: true },
    { category: 'Tile', area: 'Bench', required: false },
    { category: 'Tile', area: 'Tub Surround', required: false },
    { category: 'Tile', area: 'Trim Tile', required: true },
    { category: 'Countertops', area: 'Primary Bath', required: true },
    { category: 'Cabinets & Millwork', area: 'Primary Bath Vanity', required: true },
    { category: 'Plumbing Fixtures', area: 'Primary Shower', required: true },
    { category: 'Plumbing Fixtures', area: 'Primary Tub', required: true },
    { category: 'Plumbing Fixtures', area: 'Primary Faucets', required: true },
    { category: 'Hardware', area: 'Cabinet Pulls', required: false },
    { category: 'Lighting', area: 'Bathrooms', required: true },
  ],
  full_bath_shower: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Shower Surround', required: true, allowMultiple: true },
    { category: 'Tile', area: 'Shower Floor', required: true },
    { category: 'Tile', area: 'Shower Ceiling', required: false },
    { category: 'Tile', area: 'Niche / Shelves', required: true },
    { category: 'Tile', area: 'Trim Tile', required: true },
    { category: 'Countertops', area: 'Primary Bath', required: true },
    { category: 'Cabinets & Millwork', area: 'Secondary Bath Vanity', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Shower', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Faucets', required: true },
    { category: 'Hardware', area: 'Cabinet Pulls', required: false },
    { category: 'Lighting', area: 'Bathrooms', required: true },
  ],
  full_bath_tub: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Tub Surround', required: true },
    { category: 'Tile', area: 'Shower Surround', required: true, allowMultiple: true },
    { category: 'Tile', area: 'Shower Floor', required: true },
    { category: 'Tile', area: 'Niche / Shelves', required: true },
    { category: 'Tile', area: 'Bench', required: false },
    { category: 'Tile', area: 'Trim Tile', required: true },
    { category: 'Countertops', area: 'Primary Bath', required: true },
    { category: 'Cabinets & Millwork', area: 'Secondary Bath Vanity', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Shower', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Faucets', required: true },
    { category: 'Hardware', area: 'Cabinet Pulls', required: false },
    { category: 'Lighting', area: 'Bathrooms', required: true },
  ],
  bedroom: [
    { category: 'Hardwood / LVP', area: 'Bedrooms', required: true },
    { category: 'Carpet', area: 'Bedrooms', required: false },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Lighting', area: 'Primary Bedroom', required: true },
    { category: 'Cabinets & Millwork', area: 'Closet', required: false },
  ],
  guest_suite: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Shower Surround', required: true, allowMultiple: true },
    { category: 'Tile', area: 'Shower Floor', required: true },
    { category: 'Tile', area: 'Niche / Shelves', required: true },
    { category: 'Tile', area: 'Trim Tile', required: true },
    { category: 'Countertops', area: 'Primary Bath', required: true },
    { category: 'Cabinets & Millwork', area: 'Secondary Bath Vanity', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Shower', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Faucets', required: true },
    { category: 'Lighting', area: 'Bathrooms', required: true },
  ],
  bonus_room: [
    { category: 'Carpet', area: 'Bonus Room', required: false },
    { category: 'Hardwood / LVP', area: 'Main Living', required: false },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Lighting', area: 'Living Room', required: true },
  ],
  basement_bath: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Shower Surround', required: true, allowMultiple: true },
    { category: 'Tile', area: 'Shower Floor', required: true },
    { category: 'Tile', area: 'Niche / Shelves', required: true },
    { category: 'Tile', area: 'Trim Tile', required: true },
    { category: 'Countertops', area: 'Primary Bath', required: true },
    { category: 'Cabinets & Millwork', area: 'Secondary Bath Vanity', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Shower', required: true },
    { category: 'Plumbing Fixtures', area: 'Secondary Faucets', required: true },
    { category: 'Lighting', area: 'Bathrooms', required: true },
  ],
  basement_half_bath: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Countertops', area: 'Primary Bath', required: true },
    { category: 'Plumbing Fixtures', area: 'Powder Bath', required: true },
    { category: 'Cabinets & Millwork', area: 'Primary Bath Vanity', required: true },
    { category: 'Lighting', area: 'Bathrooms', required: true },
  ],
  basement_bedroom: [
    { category: 'Carpet', area: 'Basement', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Lighting', area: 'Primary Bedroom', required: true },
  ],
  gym: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Lighting', area: 'Living Room', required: true },
  ],
  theater: [
    { category: 'Carpet', area: 'Basement', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: true },
    { category: 'Lighting', area: 'Living Room', required: true },
  ],
  wet_bar: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Backsplash', required: true },
    { category: 'Countertops', area: 'Laundry', required: true },
    { category: 'Cabinets & Millwork', area: 'Kitchen', required: true },
    { category: 'Plumbing Fixtures', area: 'Kitchen Sink & Faucet', required: true },
    { category: 'Lighting', area: 'Kitchen', required: true },
  ],
  cold_plunge: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Shower Surround', required: true },
    { category: 'Lighting', area: 'Bathrooms', required: false },
  ],
  specialty: [
    { category: 'Tile', area: 'Flooring', required: true },
    { category: 'Tile', area: 'Shower Surround', required: false },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: false },
    { category: 'Lighting', area: 'Bathrooms', required: false },
  ],
  exterior: [
    { category: 'Exterior / Siding', area: 'Exterior', required: true },
    { category: 'Windows & Doors', area: 'Exterior Doors', required: true },
    { category: 'Windows & Doors', area: 'Windows', required: true },
    { category: 'Windows & Doors', area: 'Garage Doors', required: false },
    { category: 'Paint & Wall Treatments', area: 'Exterior Paint', required: true },
    { category: 'Lighting', area: 'Exterior', required: false },
  ],
  garage: [
    { category: 'Windows & Doors', area: 'Garage Doors', required: true },
    { category: 'Paint & Wall Treatments', area: 'Interior Paint', required: false },
  ],
};
