// Utah standard build assemblies + estimating constants.
//
// All math is "pure" — no Firestore or DOM. The wizard collects inputs (lengths,
// heights, sheathing type) and feeds them through these helpers to produce a
// LumberTakeoffResult. Helpers can be unit-tested in isolation.

import type { LumberDefaults, StudSize, Sheathing, SubfloorProduct } from './types';

// ─── Defaults Tyler confirmed for typical Utah custom builds ──────────────────
// "All exterior bearing walls 2x6 DF-L @ 16" o.c., OSB-1/2 sheathing, 9' walls.
// Bottom plate treated when on slab. Standard double top plate."

export const UTAH_DEFAULTS: LumberDefaults = {
  wallHeightFt: 9,
  extStudSize: '2x6',
  extSheathing: 'OSB-1/2',
  intBearingStudSize: '2x6',
  intNonBearingStudSize: '2x4',
  studSpacing: 16,
  studGrade: 'DF-L #2',
  plateGrade: 'DF-L #2',
  bottomPlateTreated: true,
  wasteOSB: 10,
  wasteSubfloor: 10,
  wasteStuds: 5,
};

// ─── Stud length lookup ───────────────────────────────────────────────────────
// Precut studs come at 92-5/8" (8' wall), 104-5/8" (9' wall), 116-5/8" (10' wall)
// because of plate thicknesses (3 × 1-1/2" = 4-1/2" subtracted from wall height).

export interface StudCallout {
  studSizeNominal: StudSize;
  studLengthLabel: string;     // human-readable: '104-5/8" precut (9\' wall)'
  studLengthFt: number;        // numeric for any per-piece math
  isPrecut: boolean;
}

export function calloutForStud(studSize: StudSize, wallHeightFt: number): StudCallout {
  const precuts: Record<number, { label: string; ft: number }> = {
    8:  { label: '92-5/8" precut (8\' wall)',  ft: 92.625 / 12 },
    9:  { label: '104-5/8" precut (9\' wall)', ft: 104.625 / 12 },
    10: { label: '116-5/8" precut (10\' wall)', ft: 116.625 / 12 },
  };
  if (precuts[wallHeightFt]) {
    return {
      studSizeNominal: studSize,
      studLengthLabel: precuts[wallHeightFt].label,
      studLengthFt: precuts[wallHeightFt].ft,
      isPrecut: true,
    };
  }
  // Custom height — order the next dimensional length up; framer cuts on site.
  const targetLen = wallHeightFt - 0.27; // 3 × 1.5" plates removed
  const dimensional = [10, 12, 14, 16, 20].find(n => n >= targetLen) ?? 20;
  return {
    studSizeNominal: studSize,
    studLengthLabel: `${dimensional}\' (cut on site for ${wallHeightFt}\' wall)`,
    studLengthFt: dimensional,
    isPrecut: false,
  };
}

// ─── Sheathing facts ──────────────────────────────────────────────────────────
// All sheathing options come in 4×8 sheets = 32 sf. Spelled out so it's easy
// to swap in 4×9 or 4×10 sheets later if needed.

export const SHEET_AREA_SF = 32;

export function sheathingDisplay(s: Sheathing): string {
  switch (s) {
    case 'OSB-7/16': return 'OSB 7/16" (4×8 sheet)';
    case 'OSB-1/2':  return 'OSB 1/2" (4×8 sheet)';
    case 'OSB-5/8':  return 'OSB 5/8" (4×8 sheet)';
    case 'Zip-7/16': return 'Zip System 7/16" (4×8 sheet)';
    case 'Zip-1/2':  return 'Zip System 1/2" (4×8 sheet)';
    case 'none':     return 'No sheathing';
  }
}

export function subfloorDisplay(p: SubfloorProduct): string {
  return `${p} (4×8 sheet)`;
}

// ─── Per-LF estimating rules ──────────────────────────────────────────────────
// "1 stud per linear foot" — industry rule of thumb that already absorbs
// corner studs, T-intersections, and a light buffer. Tighter math is possible
// (v1.5) but this is the standard quick-takeoff approach.

export function studsPerLF(_spacing: 16 | 24): number {
  return 1;
}

// Bottom plate = 1× wall length; top plate = 2× (double top plate). Total = 3×.
export function plateLfMultiplier(): number {
  return 3;
}

// ─── Waste application ────────────────────────────────────────────────────────

export function applyWaste(rawQty: number, wastePercent: number): number {
  return rawQty * (1 + wastePercent / 100);
}

export function ceilSheets(areaSf: number, wastePercent: number): number {
  return Math.ceil(applyWaste(areaSf, wastePercent) / SHEET_AREA_SF);
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function studDescription(studSize: StudSize, callout: StudCallout, grade: string): string {
  return `${studSize} ${callout.studLengthLabel} — ${grade} Stud`;
}

export function plateDescription(studSize: StudSize, grade: string, treated: boolean): string {
  return `${studSize} ${grade}${treated ? ' (Treated, for bottom plate on slab)' : ''} — Plate stock`;
}

// Format a beam line e.g. "(3) 11-7/8" LVL @ 6'-2\"".
export function formatBeamLine(qty: number, size: string, lengthFt: number): string {
  const feet = Math.floor(lengthFt);
  const inches = Math.round((lengthFt - feet) * 12);
  const lenStr = inches === 12
    ? `${feet + 1}'-0"`
    : inches === 0
      ? `${feet}'-0"`
      : `${feet}'-${inches}"`;
  return `(${qty}) ${size} @ ${lenStr}`;
}
