// Lumber Takeoff data model.
// Sits alongside the generic Takeoff tool (projects/{id}/takeoffs/{id}) — this is a
// side-car at projects/{id}/lumberTakeoffs/{id} that adds the semantic layer
// (which measurement is which wall/beam) plus pure-numeric inputs for users who
// haven't marked up the plan yet.

import type { PdfPoint, PageCalibration } from '@/components/takeoff/lib/types';
export type { PdfPoint, PageCalibration };

export type WallKind = 'exterior-bearing' | 'interior-bearing' | 'interior-non-bearing';
export type StudSize = '2x4' | '2x6';
export type StudSpacing = 16 | 24;
export type Sheathing = 'OSB-7/16' | 'OSB-1/2' | 'OSB-5/8' | 'Zip-7/16' | 'Zip-1/2' | 'none';
export type BeamMaterial = 'DF-L' | 'LVL' | 'Parallam' | 'Glulam' | 'Other';
export type SubfloorProduct = 'AdvanTech 3/4 T&G' | 'OSB 3/4 T&G' | 'Plywood 3/4 T&G';

// A single row from the plan's Beam Schedule (e.g., MB13 = (3) 11⅞" LVL).
export interface BeamSpec {
  designation: string; // 'MB1', 'MB13', etc.
  qty: number;         // (3) = 3
  size: string;        // '2x10', '11-7/8 LVL', '6.5x18 Glulam'
  material: BeamMaterial;
  rawSpec: string;     // original legend text, kept for display fidelity
}

// A single row from the plan's Post Schedule. P1-P4 are typically trimmer/king
// stud counts at openings; P5-P10 are discrete post members (4x4, 6x6, etc.).
export interface PostSpec {
  designation: string;        // 'P1', 'P5'
  kind: 'trimmer-count' | 'post';
  trimmerCount?: number;      // populated when kind = trimmer-count
  postSize?: string;          // populated when kind = post (e.g., '4x4')
  material?: string;          // 'DF-L #2', 'Parallam'
  rawSpec: string;            // original legend text
}

export interface FloorDef {
  id: string;          // 'main', 'upper', 'basement'
  label: string;       // human-readable
  archPageNumber?: number;     // page on PDF showing the floor plan (walls)
  framingPageNumber?: number;  // page showing the framing plan (beams)
}

// Inputs can be a polyline drawn on the plan PDF (resolved live against the
// page's calibration), or a typed numeric value. Same calculation engine reads
// both — `lengthFtCached` / `areaSqftCached` is the resolved value either way.
export type LengthSource =
  | { type: 'pdf-linear'; pageNumber: number; points: PdfPoint[] }
  | { type: 'numeric'; lengthFt: number };

export type AreaSource =
  | { type: 'pdf-polygon'; pageNumber: number; points: PdfPoint[] }
  | { type: 'numeric'; areaSqft: number };

export interface WallRun {
  id: string;
  floorId: string;
  kind: WallKind;
  studSize: StudSize;
  heightFt: number;
  sheathing: Sheathing;
  spacingInches: StudSpacing;
  source: LengthSource;
  lengthFtCached: number; // resolved length so calc doesn't need to traverse measurements
  note?: string;
}

export interface HeaderRun {
  id: string;
  floorId: string;
  beamDesignation: string;   // ref to legend.beams[designation]
  postDesignation?: string;  // ref to legend.posts[designation]
  source: LengthSource;
  lengthFtCached: number;
  note?: string;
}

export interface SubfloorArea {
  id: string;
  floorId: string;
  product: SubfloorProduct;
  source: AreaSource;
  areaSqftCached: number;
  note?: string;
}

// Default values applied when creating new wall runs etc. User can override
// per-row. These are the "Utah standard build" assumptions Tyler confirmed.
export interface LumberDefaults {
  wallHeightFt: number;          // 9 is typical custom
  extStudSize: StudSize;          // 2x6
  extSheathing: Sheathing;        // OSB-1/2
  intBearingStudSize: StudSize;   // 2x6
  intNonBearingStudSize: StudSize; // 2x4
  studSpacing: StudSpacing;       // 16 o.c.
  studGrade: string;              // 'DF-L #2'
  plateGrade: string;             // 'DF-L #2'
  bottomPlateTreated: boolean;    // true (slab contact)
  wasteOSB: number;               // 10 = 10%
  wasteSubfloor: number;          // 10 = 10%
  wasteStuds: number;             // 5 = 5%
}

// Plan PDF attached to the takeoff (optional — wizard supports numeric-only mode).
export interface LumberPdf {
  url: string;          // Firebase Storage download URL
  storagePath: string;  // 'projects/{projectId}/lumberTakeoffs/{takeoffId}.pdf'
  name: string;         // original filename
  pageCount: number;
  uploadedAt: string;
}

export interface LumberTakeoff {
  id: string;
  projectId: string;
  name: string;

  // Optional plan PDF + per-page calibrations. When present, walls/headers/etc.
  // can be drawn on the plan; otherwise the user can still type numeric values.
  pdf?: LumberPdf;
  calibrations: Record<string, PageCalibration>; // key = pageNumber (1-indexed) as string

  floors: FloorDef[];
  legend: {
    beams: Record<string, BeamSpec>;   // keyed by designation (MB1, MB2, ...)
    posts: Record<string, PostSpec>;   // keyed by designation
  };
  walls: WallRun[];
  headers: HeaderRun[];
  subfloors: SubfloorArea[];
  defaults: LumberDefaults;

  result?: LumberTakeoffResult;
  status: 'draft' | 'final';

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// ─── Calculated output ────────────────────────────────────────────────────────

export type LineCategory = 'studs' | 'plates' | 'sheathing' | 'headers' | 'subfloor' | 'posts' | 'other';
export type Uom = 'ea' | 'pc' | 'lf' | 'sf' | 'sheet';

export interface LumberLine {
  category: LineCategory;
  description: string;   // human-readable: '2x6x9\' DF-L #2 Stud'
  qty: number;
  uom: Uom;
  size?: string;
  notes?: string;
  byFloor?: Record<string, number>; // per-floor breakdown
}

export interface LumberTakeoffResult {
  generatedAt: string;
  lines: LumberLine[];
  summary: {
    totalLines: number;
    totalStuds: number;
    totalSheets: number;
    totalLinearFeet: number;
  };
  warnings: string[]; // e.g., 'No exterior walls entered for Main Floor'
}

// ─── Wizard step state ────────────────────────────────────────────────────────

export type WizardStep =
  | 'setup'
  | 'scale'
  | 'legend'
  | 'walls'
  | 'headers'
  | 'subfloor'
  | 'results';

export const WIZARD_STEPS: { id: WizardStep; label: string; help: string }[] = [
  { id: 'setup',    label: 'Setup',       help: 'Upload your plan PDF, name the takeoff, and add the floors of the home.' },
  { id: 'scale',    label: 'Scale',       help: 'For each plan page, tap two points on a dimension line and type what it says so we know the scale.' },
  { id: 'legend',   label: 'Legend',      help: 'Type the beam + post schedule from your plan so we know what each MB# and P# means.' },
  { id: 'walls',    label: 'Walls',       help: 'Draw each wall on the plan, tagged by type (Exterior bearing / Interior bearing / Interior non-bearing).' },
  { id: 'headers',  label: 'Headers',     help: 'For each header on the plan, pick the MB# and draw its length.' },
  { id: 'subfloor', label: 'Subfloor',    help: 'Outline the floor area for each level to get AdvanTech sheet counts.' },
  { id: 'results',  label: 'Results',     help: 'Review the lumber list. Export to CSV when ready.' },
];
