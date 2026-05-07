// Pure geometry math — no DOM, no PDF.js, fully unit-testable.
// All inputs are in PDF user space; calibration converts to real-world units.

import type { PdfPoint, PageCalibration, LinearUnit, AreaUnit } from './types';

export function pdfDistance(a: PdfPoint, b: PdfPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Polyline length in PDF units.
export function pdfPolylineLength(points: PdfPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += pdfDistance(points[i - 1], points[i]);
  }
  return total;
}

// Polygon perimeter in PDF units (closes back to first point).
export function pdfPolygonPerimeter(points: PdfPoint[]): number {
  if (points.length < 3) return 0;
  let total = pdfPolylineLength(points);
  total += pdfDistance(points[points.length - 1], points[0]);
  return total;
}

// Shoelace formula for signed polygon area in PDF units². Returns absolute value.
export function pdfPolygonArea(points: PdfPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// ─── Real-world conversion ────────────────────────────────────────────────────

const LINEAR_TO_FEET: Record<LinearUnit, number> = {
  ft: 1,
  in: 1 / 12,
  yd: 3,
  m: 3.280839895,
  cm: 0.03280839895,
};

const SQ_FEET_TO_AREA_UNIT: Record<AreaUnit, number> = {
  'sq ft': 1,
  'sq in': 144,
  'sq yd': 1 / 9,
  'sq m': 0.09290304,
};

export function convertLinear(value: number, from: LinearUnit, to: LinearUnit): number {
  if (from === to) return value;
  const inFeet = value * LINEAR_TO_FEET[from];
  return inFeet / LINEAR_TO_FEET[to];
}

export function convertArea(value: number, from: AreaUnit, to: AreaUnit): number {
  if (from === to) return value;
  const inSqFt = value / SQ_FEET_TO_AREA_UNIT[from];
  return inSqFt * SQ_FEET_TO_AREA_UNIT[to];
}

// Real-world linear distance for a polyline, given page calibration.
export function realLinearDistance(
  points: PdfPoint[],
  calibration: PageCalibration,
  outputUnit: LinearUnit = 'ft',
): number {
  const pdfLen = pdfPolylineLength(points);
  const inCalUnit = pdfLen / calibration.pdfUnitsPerLinearUnit;
  return convertLinear(inCalUnit, calibration.unit, outputUnit);
}

// Real-world polygon area, given page calibration.
// PDF area is in pdfUnits²; (pdfUnitsPerLinearUnit)² converts to real linear-unit².
export function realPolygonArea(
  points: PdfPoint[],
  calibration: PageCalibration,
  outputUnit: AreaUnit = 'sq ft',
): number {
  const pdfArea = pdfPolygonArea(points);
  const calUnitsPerPdfUnit = 1 / calibration.pdfUnitsPerLinearUnit;
  const inCalUnitSq = pdfArea * calUnitsPerPdfUnit * calUnitsPerPdfUnit;
  // calibration.unit is linear (ft, m, etc.) — convert squared value to outputUnit
  const sqUnit = `sq ${calibration.unit}` as AreaUnit;
  // sq in/sq cm/sq yd are valid; sq ft/sq m mappings already exist. Handle cm/in/yd by routing through sq ft.
  if (sqUnit in SQ_FEET_TO_AREA_UNIT) {
    return convertArea(inCalUnitSq, sqUnit, outputUnit);
  }
  // Fallback: convert calibration unit to ft first, then square, then convert area.
  const linearInFeet = LINEAR_TO_FEET[calibration.unit];
  const inSqFt = inCalUnitSq * linearInFeet * linearInFeet;
  return convertArea(inSqFt, 'sq ft', outputUnit);
}

// Real-world perimeter helper.
export function realPolygonPerimeter(
  points: PdfPoint[],
  calibration: PageCalibration,
  outputUnit: LinearUnit = 'ft',
): number {
  const pdfPerim = pdfPolygonPerimeter(points);
  const inCalUnit = pdfPerim / calibration.pdfUnitsPerLinearUnit;
  return convertLinear(inCalUnit, calibration.unit, outputUnit);
}

// ─── Display formatting ───────────────────────────────────────────────────────

export function formatLinear(value: number, unit: LinearUnit, precision = 2): string {
  if (unit === 'ft') {
    const feet = Math.floor(value);
    const inches = Math.round((value - feet) * 12);
    if (inches === 12) return `${feet + 1}' 0"`;
    return `${feet}' ${inches}"`;
  }
  return `${value.toFixed(precision)} ${unit}`;
}

export function formatArea(value: number, unit: AreaUnit, precision = 1): string {
  return `${value.toFixed(precision)} ${unit}`;
}

// Reasonable default colors per measurement type — picked for plan-readability on dark/light backgrounds.
export const DEFAULT_COLORS = {
  linear: '#3b82f6', // blue
  area: '#10b981',   // green
  count: '#f59e0b',  // amber
  calibration: '#ef4444', // red
} as const;
