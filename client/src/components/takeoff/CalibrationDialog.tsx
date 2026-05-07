import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Ruler } from 'lucide-react';
import type { LinearUnit, PdfPoint } from './lib/types';
import { pdfDistance, formatLinear } from './lib/geometry';

interface Props {
  open: boolean;
  pdfDistanceUnits: number; // raw PDF user-space distance between the 2 picked points
  anchorA: PdfPoint;
  anchorB: PdfPoint;
  onCancel: () => void;
  onConfirm: (realDistance: number, unit: LinearUnit) => void;
}

export function CalibrationDialog({ open, pdfDistanceUnits, anchorA, anchorB, onCancel, onConfirm }: Props) {
  const [distanceStr, setDistanceStr] = useState('');
  const [unit, setUnit] = useState<LinearUnit>('ft');

  useEffect(() => {
    if (open) {
      setDistanceStr('');
      setUnit('ft');
    }
  }, [open]);

  const realDistance = parseFloat(distanceStr);
  const valid = !Number.isNaN(realDistance) && realDistance > 0 && pdfDistanceUnits > 0;

  // Preview: what the resulting scale will be.
  const previewScale = valid
    ? `1 ${unit} = ${(pdfDistanceUnits / realDistance).toFixed(2)} PDF units`
    : '—';

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-red-500" />
            Set Page Scale
          </DialogTitle>
          <DialogDescription>
            You drew a line on the plan. Enter the real-world distance it represents — typically a known dimension (e.g. a 10' wall, a 36" door).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-gray-50 rounded p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Picked points:</span>
              <span className="font-mono text-xs">
                ({anchorA.x.toFixed(1)},{anchorA.y.toFixed(1)}) → ({anchorB.x.toFixed(1)},{anchorB.y.toFixed(1)})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">PDF distance:</span>
              <span className="font-mono">{pdfDistanceUnits.toFixed(2)} units</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cal-distance">Real distance</Label>
            <div className="flex gap-2">
              <Input
                id="cal-distance"
                type="number"
                step="0.001"
                placeholder="e.g. 10"
                value={distanceStr}
                onChange={e => setDistanceStr(e.target.value)}
                autoFocus
                className="flex-1"
              />
              <Select value={unit} onValueChange={v => setUnit(v as LinearUnit)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ft">feet</SelectItem>
                  <SelectItem value="in">inches</SelectItem>
                  <SelectItem value="yd">yards</SelectItem>
                  <SelectItem value="m">meters</SelectItem>
                  <SelectItem value="cm">centimeters</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-xs text-gray-500 italic">{previewScale}</div>

          {valid && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-900">
              <strong>Tip:</strong> Pick the longest known dimension on the page for highest accuracy. A short
              line amplifies any pixel error.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onConfirm(realDistance, unit)}>
            Set Scale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
