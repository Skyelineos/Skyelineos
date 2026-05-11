// Takeoff tool types — coordinates are stored in PDF user space, NOT screen pixels.
// This keeps measurements accurate regardless of zoom level or device pixel ratio.

export type LinearUnit = 'ft' | 'in' | 'm' | 'cm' | 'yd';
export type AreaUnit = 'sq ft' | 'sq in' | 'sq m' | 'sq yd';
export type MeasurementType = 'linear' | 'area' | 'count';

// A single point in PDF user space (the document's native coordinate system).
export interface PdfPoint {
  x: number;
  y: number;
}

// Per-page calibration. Stored once a user picks two points and enters a real distance.
// `pdfUnitsPerLinearUnit` is the converter: PDF-space distance ÷ this = real-world distance.
export interface PageCalibration {
  pdfUnitsPerLinearUnit: number;
  unit: LinearUnit;
  // The two anchor points used for calibration (kept for re-calibration UX).
  anchorA: PdfPoint;
  anchorB: PdfPoint;
  realDistance: number;
  calibratedAt: string; // ISO timestamp
  calibratedBy: string; // uid
}

export interface BaseMeasurement {
  id: string;
  pageNumber: number; // 1-indexed
  type: MeasurementType;
  label: string;
  trade?: string; // e.g. 'flooring', 'paint' — links to estimate trade categories
  color: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface LinearMeasurement extends BaseMeasurement {
  type: 'linear';
  // Polyline points (≥2). Stored in PDF user space.
  points: PdfPoint[];
  // Cached calculated value in real-world units (ft etc.). Source of truth is `points + page calibration`.
  value: number;
  unit: LinearUnit;
}

export interface AreaMeasurement extends BaseMeasurement {
  type: 'area';
  // Polygon vertices (≥3). Stored in PDF user space. Closed implicitly (last connects to first).
  points: PdfPoint[];
  // Cached calculated value (sq ft etc.).
  value: number;
  unit: AreaUnit;
  // Optional cached perimeter for trim/baseboard takeoffs.
  perimeter?: number;
  perimeterUnit?: LinearUnit;
}

export interface CountMeasurement extends BaseMeasurement {
  type: 'count';
  // Each click is a marker.
  points: PdfPoint[];
  value: number; // = points.length
}

export type Measurement = LinearMeasurement | AreaMeasurement | CountMeasurement;

// Top-level Firestore doc.
// Path: projects/{projectId}/takeoffs/{takeoffId}
export interface Takeoff {
  id: string;
  projectId: string;
  name: string;
  fileUrl: string; // Firebase Storage download URL
  fileName: string;
  fileSize: number;
  pageCount: number;
  // Per-page calibration. Key = pageNumber as string.
  calibrations: Record<string, PageCalibration>;
  measurements: Measurement[];
  // Manual ÷2 escape hatch — when true, all page calibrations have been
  // scaled so measurements come out half their "raw" value. Used when a
  // plan set consistently reads double (verify-point error, weird export).
  halvedAllPages?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export type TakeoffTool = 'pan' | 'calibrate' | 'verify' | 'linear' | 'area' | 'count';
