// Lumber takeoff calculation engine.
// Pure function: LumberTakeoff (input doc) → LumberTakeoffResult (lumber list).

import type {
  LumberTakeoff,
  LumberTakeoffResult,
  LumberLine,
  WallRun,
  HeaderRun,
  SubfloorArea,
  LengthSource,
  AreaSource,
  PageCalibration,
} from './types';
import {
  realLinearDistance,
  realPolygonArea,
} from '@/components/takeoff/lib/geometry';
import {
  calloutForStud,
  studsPerLF,
  plateLfMultiplier,
  applyWaste,
  ceilSheets,
  sheathingDisplay,
  subfloorDisplay,
  studDescription,
  plateDescription,
  formatBeamLine,
} from './assemblies';

// Resolve a length source to feet. PDF-drawn polylines convert via the page's
// calibration; numeric entries pass through. Returns 0 when a PDF source has no
// calibration yet — that's a signal to the UI to prompt the user to set scale.
export function resolveLengthFt(
  source: LengthSource,
  calibrations: Record<string, PageCalibration> | undefined,
): number {
  if (source.type === 'numeric') return source.lengthFt;
  const cal = (calibrations ?? {})[String(source.pageNumber)];
  if (!cal) return 0;
  return realLinearDistance(source.points, cal, 'ft');
}

export function resolveAreaSqft(
  source: AreaSource,
  calibrations: Record<string, PageCalibration> | undefined,
): number {
  if (source.type === 'numeric') return source.areaSqft;
  const cal = (calibrations ?? {})[String(source.pageNumber)];
  if (!cal) return 0;
  return realPolygonArea(source.points, cal, 'sq ft');
}

export function calculate(t: LumberTakeoff): LumberTakeoffResult {
  const warnings: string[] = [];
  const lines: LumberLine[] = [];
  const d = t.defaults;

  // ─── Studs ─────────────────────────────────────────────────────────────────
  // Bucket by (studSize, heightFt) so e.g. all "2x6 × 9' wall" studs combine.
  const studBuckets = new Map<string, { studSize: WallRun['studSize']; heightFt: number; lf: number; byFloor: Record<string, number> }>();
  for (const w of t.walls) {
    const key = `${w.studSize}|${w.heightFt}`;
    const cur = studBuckets.get(key) ?? { studSize: w.studSize, heightFt: w.heightFt, lf: 0, byFloor: {} };
    cur.lf += resolveLengthFt(w.source, t.calibrations);
    cur.byFloor[w.floorId] = (cur.byFloor[w.floorId] ?? 0) + resolveLengthFt(w.source, t.calibrations);
    studBuckets.set(key, cur);
  }
  for (const b of studBuckets.values()) {
    const callout = calloutForStud(b.studSize, b.heightFt);
    const rawQty = b.lf * studsPerLF(d.studSpacing);
    const withWaste = applyWaste(rawQty, d.wasteStuds);
    const qty = Math.ceil(withWaste);
    lines.push({
      category: 'studs',
      description: studDescription(b.studSize, callout, d.studGrade),
      qty,
      uom: 'ea',
      size: b.studSize,
      notes: `${b.lf.toFixed(1)} LF of wall × 1 stud/ft + ${d.wasteStuds}% waste${callout.isPrecut ? '' : ' (cut on site)'}`,
      byFloor: roundFloorMap(b.byFloor, lf => Math.ceil(applyWaste(lf * studsPerLF(d.studSpacing), d.wasteStuds))),
    });
  }

  // ─── Plates ────────────────────────────────────────────────────────────────
  // Bottom plate (often treated for slab contact) + double top plate = 3× LF.
  // Treated and untreated come from different stock, so we separate.
  // Studs of different sizes also need different plate stock.
  const plateBuckets = new Map<string, { studSize: WallRun['studSize']; lf: number; byFloor: Record<string, number>; kind: 'bottom' | 'top' }>();
  for (const w of t.walls) {
    // Bottom: 1×
    const kBot = `${w.studSize}|bottom`;
    const curBot = plateBuckets.get(kBot) ?? { studSize: w.studSize, lf: 0, byFloor: {}, kind: 'bottom' as const };
    curBot.lf += resolveLengthFt(w.source, t.calibrations);
    curBot.byFloor[w.floorId] = (curBot.byFloor[w.floorId] ?? 0) + resolveLengthFt(w.source, t.calibrations);
    plateBuckets.set(kBot, curBot);
    // Top: 2× (double top plate)
    const kTop = `${w.studSize}|top`;
    const curTop = plateBuckets.get(kTop) ?? { studSize: w.studSize, lf: 0, byFloor: {}, kind: 'top' as const };
    curTop.lf += resolveLengthFt(w.source, t.calibrations) * 2;
    curTop.byFloor[w.floorId] = (curTop.byFloor[w.floorId] ?? 0) + resolveLengthFt(w.source, t.calibrations) * 2;
    plateBuckets.set(kTop, curTop);
  }
  for (const b of plateBuckets.values()) {
    const treated = b.kind === 'bottom' && d.bottomPlateTreated;
    const lfWithWaste = Math.ceil(applyWaste(b.lf, 10)); // 10% splice waste
    lines.push({
      category: 'plates',
      description: plateDescription(b.studSize, d.plateGrade, treated)
        + (b.kind === 'top' ? ' [double top plate]' : ' [bottom plate]'),
      qty: lfWithWaste,
      uom: 'lf',
      size: b.studSize,
      notes: `${b.lf.toFixed(1)} LF + 10% splice waste${treated ? ' — order treated stock' : ''}`,
      byFloor: roundFloorMap(b.byFloor, lf => Math.ceil(applyWaste(lf, 10))),
    });
    void plateLfMultiplier; // kept exported for tests; loop already uses 1× + 2× form
  }

  // ─── Sheathing ─────────────────────────────────────────────────────────────
  // Only exterior walls get sheathing in v1; interior walls have sheathing='none' by default.
  const sheathingBuckets = new Map<string, { sheathing: WallRun['sheathing']; areaSf: number; byFloor: Record<string, number> }>();
  for (const w of t.walls) {
    if (w.sheathing === 'none') continue;
    const cur = sheathingBuckets.get(w.sheathing) ?? { sheathing: w.sheathing, areaSf: 0, byFloor: {} };
    const area = resolveLengthFt(w.source, t.calibrations) * w.heightFt;
    cur.areaSf += area;
    cur.byFloor[w.floorId] = (cur.byFloor[w.floorId] ?? 0) + area;
    sheathingBuckets.set(w.sheathing, cur);
  }
  for (const b of sheathingBuckets.values()) {
    const sheets = ceilSheets(b.areaSf, d.wasteOSB);
    lines.push({
      category: 'sheathing',
      description: sheathingDisplay(b.sheathing),
      qty: sheets,
      uom: 'sheet',
      notes: `${b.areaSf.toFixed(0)} sf wall area ÷ 32 sf/sheet + ${d.wasteOSB}% waste`,
      byFloor: roundFloorMap(b.byFloor, sf => ceilSheets(sf, d.wasteOSB)),
    });
  }

  // ─── Headers / Beams ───────────────────────────────────────────────────────
  // Group by beam designation. Each occurrence may have its own length, so we
  // sum total LF and emit one line per designation with the per-occurrence
  // lengths in the notes (so the yard can fill the order accurately).
  const headerBuckets = new Map<string, { designation: string; spec: string; qty: number; pieces: number; totalLF: number; lengths: number[]; byFloor: Record<string, number> }>();
  for (const h of t.headers) {
    const beam = t.legend.beams[h.beamDesignation];
    if (!beam) {
      warnings.push(`Header references ${h.beamDesignation} but it's not in the Beam Schedule legend.`);
      continue;
    }
    const cur = headerBuckets.get(h.beamDesignation) ?? {
      designation: h.beamDesignation,
      spec: beam.rawSpec || `(${beam.qty}) ${beam.size} ${beam.material}`,
      qty: beam.qty,
      pieces: 0,
      totalLF: 0,
      lengths: [],
      byFloor: {},
    };
    cur.pieces += beam.qty;
    cur.totalLF += resolveLengthFt(h.source, t.calibrations) * beam.qty;
    cur.lengths.push(resolveLengthFt(h.source, t.calibrations));
    cur.byFloor[h.floorId] = (cur.byFloor[h.floorId] ?? 0) + beam.qty;
    headerBuckets.set(h.beamDesignation, cur);
  }
  for (const b of headerBuckets.values()) {
    const lengthsList = b.lengths
      .map(l => formatBeamLine(b.qty, '', l).replace(/^\([0-9]+\) +@ /, ''))
      .join(', ');
    lines.push({
      category: 'headers',
      description: `${b.designation} — ${b.spec}`,
      qty: b.pieces,
      uom: 'pc',
      notes: `${b.lengths.length} header location(s); piece lengths: ${lengthsList}; total ${b.totalLF.toFixed(1)} LF`,
      byFloor: b.byFloor,
    });
  }

  // ─── Subfloor ──────────────────────────────────────────────────────────────
  const subfloorBuckets = new Map<string, { product: SubfloorArea['product']; areaSf: number; byFloor: Record<string, number> }>();
  for (const s of t.subfloors) {
    const cur = subfloorBuckets.get(s.product) ?? { product: s.product, areaSf: 0, byFloor: {} };
    cur.areaSf += resolveAreaSqft(s.source, t.calibrations);
    cur.byFloor[s.floorId] = (cur.byFloor[s.floorId] ?? 0) + resolveAreaSqft(s.source, t.calibrations);
    subfloorBuckets.set(s.product, cur);
  }
  for (const b of subfloorBuckets.values()) {
    const sheets = ceilSheets(b.areaSf, d.wasteSubfloor);
    lines.push({
      category: 'subfloor',
      description: subfloorDisplay(b.product),
      qty: sheets,
      uom: 'sheet',
      notes: `${b.areaSf.toFixed(0)} sf ÷ 32 sf/sheet + ${d.wasteSubfloor}% waste`,
      byFloor: roundFloorMap(b.byFloor, sf => ceilSheets(sf, d.wasteSubfloor)),
    });
  }

  // ─── Warnings for empty sections ───────────────────────────────────────────
  if (t.floors.length === 0) {
    warnings.push('No floors defined. Add at least one floor in Setup.');
  }
  if (t.walls.length === 0) {
    warnings.push('No walls entered — wall stud and plate counts will be zero.');
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const totalStuds = lines.filter(l => l.category === 'studs').reduce((s, l) => s + l.qty, 0);
  const totalSheets = lines.filter(l => l.category === 'sheathing' || l.category === 'subfloor').reduce((s, l) => s + l.qty, 0);
  const totalLinearFeet = lines.filter(l => l.uom === 'lf').reduce((s, l) => s + l.qty, 0);

  return {
    generatedAt: new Date().toISOString(),
    lines,
    summary: {
      totalLines: lines.length,
      totalStuds,
      totalSheets,
      totalLinearFeet,
    },
    warnings,
  };
}

// Helper: round each floor-bucket value through a transform fn (used for
// per-floor breakdowns so they sum correctly after waste/ceiling rules).
function roundFloorMap(
  raw: Record<string, number>,
  fn: (n: number) => number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = fn(v);
  return out;
}
