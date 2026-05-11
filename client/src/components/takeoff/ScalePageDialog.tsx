import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select';
import { Ruler, MousePointer2, ListChecks } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { LinearUnit, PageCalibration } from './lib/types';

// PDF user space defaults to 72 units per inch (per the PDF spec). Plans
// exported to-scale by architects/engineers respect this, so picking a named
// scale lets us compute the calibration ratio without two-point measuring.
const PDF_UNITS_PER_INCH = 72;

interface StandardScale {
  key: string;
  label: string;
  unit: LinearUnit;
  pdfUnitsPerLinearUnit: number;
  group: 'arch' | 'eng' | 'metric';
}

// pdfUnitsPerFoot = 72 * (paperInches per realFoot)
const arch = (paperFractionInches: number, label: string): StandardScale => ({
  key: `arch_${label}`,
  label,
  unit: 'ft',
  pdfUnitsPerLinearUnit: PDF_UNITS_PER_INCH * paperFractionInches,
  group: 'arch',
});

// Engineering: 1" on paper = N feet in real world → pdfUnitsPerFoot = 72 / N
const eng = (realFeetPerInch: number, label: string): StandardScale => ({
  key: `eng_${label}`,
  label,
  unit: 'ft',
  pdfUnitsPerLinearUnit: PDF_UNITS_PER_INCH / realFeetPerInch,
  group: 'eng',
});

// Metric 1:N — pdfUnitsPerMeter = (72/0.0254) / N ≈ 2834.6457/N
const metric = (n: number): StandardScale => ({
  key: `metric_1_${n}`,
  label: `1 : ${n.toLocaleString()}`,
  unit: 'm',
  pdfUnitsPerLinearUnit: (PDF_UNITS_PER_INCH / 0.0254) / n,
  group: 'metric',
});

const SCALES: StandardScale[] = [
  // Architectural — common imperial residential / commercial scales
  arch(1 / 16,  '1/16" = 1\'-0"'),
  arch(3 / 32,  '3/32" = 1\'-0"'),
  arch(1 / 8,   '1/8" = 1\'-0"'),
  arch(3 / 16,  '3/16" = 1\'-0"'),
  arch(1 / 4,   '1/4" = 1\'-0"'),
  arch(3 / 8,   '3/8" = 1\'-0"'),
  arch(1 / 2,   '1/2" = 1\'-0"'),
  arch(3 / 4,   '3/4" = 1\'-0"'),
  arch(1,       '1" = 1\'-0"'),
  arch(1.5,     '1 1/2" = 1\'-0"'),
  arch(3,       '3" = 1\'-0"'),
  // Engineering — common civil / site plan scales
  eng(10,  '1" = 10\''),
  eng(20,  '1" = 20\''),
  eng(30,  '1" = 30\''),
  eng(40,  '1" = 40\''),
  eng(50,  '1" = 50\''),
  eng(60,  '1" = 60\''),
  eng(100, '1" = 100\''),
  eng(200, '1" = 200\''),
  // Metric
  metric(20), metric(50), metric(100), metric(200), metric(500), metric(1000),
];

// Find the closest standard scale that matches a calibration's pdfUnitsPerLinearUnit.
function findScaleKey(cal: PageCalibration | undefined): string | null {
  if (!cal) return null;
  const candidates = SCALES.filter(s => s.unit === cal.unit);
  let best: { key: string; diff: number } | null = null;
  for (const s of candidates) {
    const diff = Math.abs(s.pdfUnitsPerLinearUnit - cal.pdfUnitsPerLinearUnit);
    if (best === null || diff < best.diff) best = { key: s.key, diff };
  }
  // Only match if within 1% to avoid claiming a manual calibration is "1/4" = 1'-0""
  if (best && best.diff / cal.pdfUnitsPerLinearUnit < 0.01) return best.key;
  return null;
}

interface PerPagePick {
  scaleKey: string; // SCALES key, or '' for "leave as-is"
}

export interface PerPageScaleEntry {
  pageNumber: number;
  pdfUnitsPerLinearUnit: number;
  unit: LinearUnit;
  label: string;
}

interface Props {
  open: boolean;
  pageCount: number;
  currentPage: number;
  existingCalibrations?: Record<string, PageCalibration>;
  onClose: () => void;
  onApplyStandard: (pdfUnitsPerLinearUnit: number, unit: LinearUnit, label: string, applyAllPages?: boolean) => void;
  onApplyPerPage?: (entries: PerPageScaleEntry[]) => void;
  onSwitchToManual: () => void;
}

export function ScalePageDialog({
  open, pageCount, currentPage, existingCalibrations,
  onClose, onApplyStandard, onApplyPerPage, onSwitchToManual,
}: Props) {
  const isMultiPage = pageCount > 1;
  // 'one'   = single scale picker (apply to current page or all)
  // 'perPage' = list of pages with individual scale dropdowns
  const [mode, setMode] = useState<'one' | 'perPage'>('one');

  // ── 'one' mode state ──
  const [selectedKey, setSelectedKey] = useState<string>('arch_1/4" = 1\'-0"');
  const [applyAllPages, setApplyAllPages] = useState<boolean>(true);
  const selected = SCALES.find(s => s.key === selectedKey) || SCALES[4];

  // ── 'perPage' mode state ── one row per page; preselect from existing calibrations.
  const [perPagePicks, setPerPagePicks] = useState<Record<number, PerPagePick>>({});
  useEffect(() => {
    if (!open) return;
    const next: Record<number, PerPagePick> = {};
    for (let p = 1; p <= pageCount; p++) {
      const key = findScaleKey(existingCalibrations?.[String(p)]) || '';
      next[p] = { scaleKey: key };
    }
    setPerPagePicks(next);
  }, [open, pageCount, existingCalibrations]);

  const setPerPageScale = (page: number, scaleKey: string) =>
    setPerPagePicks(prev => ({ ...prev, [page]: { scaleKey } }));

  const setAllPerPageScale = (scaleKey: string) => {
    setPerPagePicks(prev => {
      const next: Record<number, PerPagePick> = {};
      for (let p = 1; p <= pageCount; p++) next[p] = { scaleKey };
      return next;
    });
  };

  const perPagePickCount = useMemo(
    () => Object.values(perPagePicks).filter(v => v.scaleKey).length,
    [perPagePicks],
  );

  const applyOne = () => {
    onApplyStandard(selected.pdfUnitsPerLinearUnit, selected.unit, selected.label, applyAllPages);
  };

  const applyPerPage = () => {
    if (!onApplyPerPage) return;
    const entries: PerPageScaleEntry[] = [];
    for (let p = 1; p <= pageCount; p++) {
      const key = perPagePicks[p]?.scaleKey;
      if (!key) continue;
      const s = SCALES.find(x => x.key === key);
      if (!s) continue;
      entries.push({
        pageNumber: p,
        pdfUnitsPerLinearUnit: s.pdfUnitsPerLinearUnit,
        unit: s.unit,
        label: s.label,
      });
    }
    onApplyPerPage(entries);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-[#C9A96E]" />
            Scale Page
          </DialogTitle>
          <DialogDescription>
            Pick the scale the architect or engineer used. Measurements convert automatically once set.
          </DialogDescription>
        </DialogHeader>

        {/* Mode switcher (only useful when there's more than one page) */}
        {isMultiPage && (
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg text-sm">
            <button
              type="button"
              onClick={() => setMode('one')}
              className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-colors ${
                mode === 'one' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              One scale
            </button>
            <button
              type="button"
              onClick={() => setMode('perPage')}
              className={`flex-1 px-3 py-1.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5 ${
                mode === 'perPage' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Different per page
            </button>
          </div>
        )}

        {mode === 'one' && (
          <div className="space-y-3 py-1">
            <div>
              <Label htmlFor="scale-select">Standard Scale</Label>
              <Select value={selectedKey} onValueChange={setSelectedKey}>
                <SelectTrigger id="scale-select" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-96">
                  <SelectGroup>
                    <SelectLabel>Architectural (imperial)</SelectLabel>
                    {SCALES.filter(s => s.group === 'arch').map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Engineering (civil / site)</SelectLabel>
                    {SCALES.filter(s => s.group === 'eng').map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Metric</SelectLabel>
                    {SCALES.filter(s => s.group === 'metric').map(s => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-[#C9A96E]/30 bg-[#FFF8E7]/40 p-3 text-xs text-gray-700 space-y-1">
              <p>Selected: <span className="font-semibold text-gray-900">{selected.label}</span></p>
              <p className="font-mono text-[11px] text-gray-500">
                1 {selected.unit} = {selected.pdfUnitsPerLinearUnit.toFixed(2)} PDF units
              </p>
            </div>

            {isMultiPage && (
              <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <Checkbox
                  checked={applyAllPages}
                  onCheckedChange={(c) => setApplyAllPages(!!c)}
                  className="mt-0.5"
                />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-gray-900">Apply to all {pageCount} pages</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {applyAllPages
                      ? `Every page will use ${selected.label}.`
                      : `Only page ${currentPage} gets this scale.`}
                  </p>
                </div>
              </label>
            )}
          </div>
        )}

        {mode === 'perPage' && (
          <div className="space-y-3 py-1">
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{perPagePickCount} of {pageCount} pages assigned</span>
              <button
                type="button"
                onClick={() => setAllPerPageScale('')}
                className="text-gray-400 hover:text-gray-700 underline underline-offset-2"
              >
                Clear all
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg max-h-[50vh] overflow-y-auto divide-y divide-gray-100">
              {Array.from({ length: pageCount }).map((_, i) => {
                const page = i + 1;
                const pick = perPagePicks[page]?.scaleKey || '';
                return (
                  <div key={page} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-xs font-mono tabular-nums text-gray-500 w-14">
                      Page {page}
                    </span>
                    <Select value={pick || 'none'} onValueChange={v => setPerPageScale(page, v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="— pick scale —" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectItem value="none">— leave as-is —</SelectItem>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Architectural</SelectLabel>
                          {SCALES.filter(s => s.group === 'arch').map(s => (
                            <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Engineering</SelectLabel>
                          {SCALES.filter(s => s.group === 'eng').map(s => (
                            <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Metric</SelectLabel>
                          {SCALES.filter(s => s.group === 'metric').map(s => (
                            <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onSwitchToManual}
          className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 inline-flex items-center gap-1 self-start"
        >
          <MousePointer2 className="w-3 h-3" />
          Or pick two points on a known dimension instead
        </button>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {mode === 'one' ? (
            <Button
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={applyOne}
            >
              Apply Scale
            </Button>
          ) : (
            <Button
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={applyPerPage}
              disabled={perPagePickCount === 0}
            >
              Apply {perPagePickCount} Page{perPagePickCount === 1 ? '' : 's'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
