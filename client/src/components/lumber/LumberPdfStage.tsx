import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  MousePointer2, Ruler, Square, Move,
} from 'lucide-react';
import { PdfCanvas, type PdfCanvasHandle } from '@/components/takeoff/PdfCanvas';
import { MeasurementOverlay } from '@/components/takeoff/MeasurementOverlay';
import { CalibrationDialog } from '@/components/takeoff/CalibrationDialog';
import { pdfDistance, realLinearDistance, realPolygonArea, formatLinear, formatArea } from '@/components/takeoff/lib/geometry';
import type { Measurement, PdfPoint, PageCalibration, LinearUnit } from '@/components/takeoff/lib/types';

export type StageTool = 'select' | 'linear' | 'polygon' | 'calibrate' | 'pan';

export interface StageShape {
  id: string;
  type: 'linear' | 'polygon';
  points: PdfPoint[];
  label: string;
  color: string;
}

interface Props {
  pdfUrl: string;
  pageNumber: number;
  pageCount?: number;
  onPageChange?: (n: number) => void;

  calibration: PageCalibration | null;
  /** Fires after the user picks 2 calibration points + confirms the dialog. */
  onCalibrate?: (cal: PageCalibration) => void;

  tool: StageTool;
  /** Color for newly-drawn shapes (and the in-progress rubber band). */
  toolColor?: string;

  shapes: StageShape[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;

  onShapeComplete?: (shape: { type: 'linear' | 'polygon'; points: PdfPoint[] }) => void;

  /** Height in pixels. Defaults to 560. */
  height?: number;
}

const GOLD = '#C9A96E';

export function LumberPdfStage({
  pdfUrl, pageNumber, pageCount, onPageChange,
  calibration, onCalibrate,
  tool, toolColor = GOLD,
  shapes, selectedId, onSelect,
  onShapeComplete,
  height = 560,
}: Props) {
  const canvasRef = useRef<PdfCanvasHandle | null>(null);
  const [zoom, setZoom] = useState(1);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [containerSize, setContainerSize] = useState({ w: 800, h });

  // In-progress draw state
  const [inProgressPoints, setInProgressPoints] = useState<PdfPoint[]>([]);
  const [cursor, setCursor] = useState<PdfPoint | null>(null);

  // Calibration dialog state
  const [calDialog, setCalDialog] = useState<null | { anchorA: PdfPoint; anchorB: PdfPoint }>(null);

  // Reset in-progress when tool changes
  useEffect(() => {
    setInProgressPoints([]);
    setCursor(null);
  }, [tool, pageNumber]);

  // Re-render on transform/size changes so overlay updates
  const handleTransformChange = useCallback((t: { scale: number; tx: number; ty: number }) => {
    setTransform(t);
  }, []);

  const handleLoad = useCallback(({ pageCount: pc }: { pageCount: number }) => {
    if (onPageChange && pageCount === undefined) {
      // first load — caller may want to know total page count via separate channel
    }
    void pc;
  }, [onPageChange, pageCount]);

  // Track container size for the overlay
  const containerDivRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!containerDivRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cr = e.contentRect;
        setContainerSize({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(containerDivRef.current);
    return () => ro.disconnect();
  }, []);

  // ─── Drawing interaction ───────────────────────────────────────────────────
  const handlePointerDown = useCallback((pt: PdfPoint) => {
    if (tool === 'select' || tool === 'pan') return;
    setInProgressPoints(prev => {
      const next = [...prev, pt];
      if (tool === 'linear' || tool === 'calibrate') {
        // 2-click linear: complete after 2 points
        if (next.length === 2) {
          if (tool === 'calibrate') {
            // Open dialog
            setCalDialog({ anchorA: next[0], anchorB: next[1] });
          } else {
            onShapeComplete?.({ type: 'linear', points: next });
          }
          return [];
        }
        return next;
      }
      // polygon: keep adding; closing happens on double-click
      return next;
    });
  }, [tool, onShapeComplete]);

  const handlePointerMove = useCallback((pt: PdfPoint) => {
    if (tool === 'select' || tool === 'pan') return;
    setCursor(pt);
  }, [tool]);

  const handleDoubleClick = useCallback(() => {
    if (tool !== 'polygon') return;
    if (inProgressPoints.length >= 3) {
      onShapeComplete?.({ type: 'polygon', points: inProgressPoints });
      setInProgressPoints([]);
    }
  }, [tool, inProgressPoints, onShapeComplete]);

  // Escape to cancel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInProgressPoints([]);
        setCursor(null);
      } else if (e.key === 'Enter' && tool === 'polygon' && inProgressPoints.length >= 3) {
        onShapeComplete?.({ type: 'polygon', points: inProgressPoints });
        setInProgressPoints([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, inProgressPoints, onShapeComplete]);

  // ─── Calibration confirmation ──────────────────────────────────────────────
  const handleCalibrationConfirm = (realDistance: number, unit: LinearUnit) => {
    if (!calDialog) return;
    const dist = pdfDistance(calDialog.anchorA, calDialog.anchorB);
    const cal: PageCalibration = {
      pdfUnitsPerLinearUnit: dist / realDistance,
      unit,
      anchorA: calDialog.anchorA,
      anchorB: calDialog.anchorB,
      realDistance,
      calibratedAt: new Date().toISOString(),
      calibratedBy: 'lumber-wizard',
    };
    setCalDialog(null);
    onCalibrate?.(cal);
  };

  // ─── Adapt lumber shapes → generic Measurement[] for the overlay ──────────
  const measurements: Measurement[] = shapes.map(s => {
    if (s.type === 'linear') {
      return {
        id: s.id,
        pageNumber,
        type: 'linear',
        label: s.label,
        color: s.color,
        points: s.points,
        value: calibration ? realLinearDistance(s.points, calibration, 'ft') : 0,
        unit: 'ft',
        createdAt: '',
        createdBy: '',
      };
    }
    return {
      id: s.id,
      pageNumber,
      type: 'area',
      label: s.label,
      color: s.color,
      points: s.points,
      value: calibration ? realPolygonArea(s.points, calibration, 'sq ft') : 0,
      unit: 'sq ft',
      createdAt: '',
      createdBy: '',
    };
  });

  // pdfToCss adapter (drives overlay positioning)
  const pdfToCss = useCallback((pt: PdfPoint) => {
    if (!canvasRef.current) return null;
    return canvasRef.current.pdfToCssPoint(pt);
  }, []);
  // re-render dependency so overlay recomputes on transform change
  void transform.scale; void transform.tx; void transform.ty;

  // Cursor + interaction style based on tool
  const cursorStyle = tool === 'select' ? 'default'
    : tool === 'pan' ? 'grab'
    : 'crosshair';

  const livePreview = (() => {
    if (!calibration || inProgressPoints.length === 0) return null;
    const pts = cursor ? [...inProgressPoints, cursor] : inProgressPoints;
    if (tool === 'linear' || tool === 'calibrate') {
      const len = realLinearDistance(pts, calibration, 'ft');
      return formatLinear(len, 'ft');
    }
    if (tool === 'polygon' && pts.length >= 3) {
      const area = realPolygonArea(pts, calibration, 'sq ft');
      return formatArea(area, 'sq ft');
    }
    return null;
  })();

  return (
    <div className="flex flex-col bg-white rounded-lg overflow-hidden border" style={{ borderColor: '#E5E7EB' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-center gap-1.5">
          {pageCount && pageCount > 1 ? (
            <>
              <Button
                variant="ghost" size="sm"
                onClick={() => onPageChange?.(Math.max(1, pageNumber - 1))}
                disabled={pageNumber <= 1}
                className="h-7 px-2"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-gray-600 font-mono min-w-[60px] text-center">
                Page {pageNumber} / {pageCount}
              </span>
              <Button
                variant="ghost" size="sm"
                onClick={() => onPageChange?.(Math.min(pageCount, pageNumber + 1))}
                disabled={pageNumber >= pageCount}
                className="h-7 px-2"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <span className="text-xs text-gray-500 font-mono">Page {pageNumber}</span>
          )}
          <div className="w-px h-5 bg-gray-300 mx-1" />
          {calibration ? (
            <Badge variant="outline" className="text-[10px] gap-1" style={{ color: '#0F6F40', borderColor: 'rgba(16,185,129,0.4)' }}>
              <Ruler className="w-2.5 h-2.5" /> Calibrated
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] gap-1" style={{ color: '#B45309', borderColor: 'rgba(251,191,36,0.5)' }}>
              <Ruler className="w-2.5 h-2.5" /> Not calibrated
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.25, z / 1.25))} className="h-7 w-7 p-0">
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-gray-600 font-mono min-w-[44px] text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(8, z * 1.25))} className="h-7 w-7 p-0">
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)} className="h-7 w-7 p-0" title="Fit width">
            <Maximize2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* PDF stage */}
      <div
        ref={containerDivRef}
        className="relative overflow-hidden"
        style={{ height, backgroundColor: '#F3F4F6' }}
        onDoubleClick={handleDoubleClick}
      >
        <PdfCanvas
          ref={canvasRef}
          fileUrl={pdfUrl}
          pageNumber={pageNumber}
          zoom={zoom}
          onLoad={handleLoad}
          onZoomChange={setZoom}
          onTransformChange={handleTransformChange}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          cursor={cursorStyle}
        >
          <MeasurementOverlay
            width={containerSize.w}
            height={containerSize.h}
            measurements={measurements}
            inProgress={inProgressPoints.length > 0 ? {
              type: tool === 'calibrate' ? 'calibrate' : tool === 'polygon' ? 'area' : 'linear',
              points: inProgressPoints,
              cursor,
              color: tool === 'calibrate' ? '#ef4444' : toolColor,
            } : null}
            calibration={calibration}
            pdfToCss={pdfToCss}
            selectedId={selectedId}
            onSelect={id => onSelect?.(id)}
            viewerScale={transform.scale}
            viewerTx={transform.tx}
            viewerTy={transform.ty}
            interactive={tool === 'select'}
          />
        </PdfCanvas>

        {/* Hint */}
        {(tool !== 'select' && tool !== 'pan') && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <div className="bg-black/75 text-white text-xs px-2.5 py-1 rounded shadow-sm">
              {tool === 'linear' && (inProgressPoints.length === 0
                ? 'Click the start of the wall, then click the end.'
                : 'Click the end point to finish. Esc to cancel.')}
              {tool === 'calibrate' && (inProgressPoints.length === 0
                ? 'Click the first end of a known dimension line.'
                : 'Click the other end, then enter the real distance.')}
              {tool === 'polygon' && (inProgressPoints.length < 3
                ? `Click each corner of the area (${inProgressPoints.length} placed). Need at least 3.`
                : 'Click more corners, double-click or press Enter to finish.')}
            </div>
            {livePreview && (
              <div className="bg-white border text-xs px-2 py-1 rounded shadow-sm" style={{ borderColor: GOLD, color: '#141414' }}>
                {livePreview}
              </div>
            )}
          </div>
        )}
        {!calibration && tool !== 'calibrate' && (tool === 'linear' || tool === 'polygon') && (
          <div className="absolute top-2 left-2 right-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-900 pointer-events-none">
            This page isn't calibrated yet — your drawings will show but length/area can't be computed until you set the scale in the <strong>Scale</strong> step.
          </div>
        )}
      </div>

      {/* Calibration dialog */}
      {calDialog && (
        <CalibrationDialog
          open={true}
          pdfDistanceUnits={pdfDistance(calDialog.anchorA, calDialog.anchorB)}
          anchorA={calDialog.anchorA}
          anchorB={calDialog.anchorB}
          onCancel={() => { setCalDialog(null); setInProgressPoints([]); }}
          onConfirm={handleCalibrationConfirm}
        />
      )}
    </div>
  );
}

// Kept around (will use in v1.5.1 toolbar): icons referenced for menus
void MousePointer2; void Square; void Move;
