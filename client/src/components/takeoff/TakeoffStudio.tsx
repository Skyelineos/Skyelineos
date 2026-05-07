import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  collection, doc, addDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp,
  setDoc, deleteDoc,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Upload, Ruler, Move, MousePointer2, Square, MapPin, Hash,
  Trash2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  FileText, Plus, AlertTriangle, CheckCircle2, Send, Edit2,
} from 'lucide-react';

import { PdfCanvas, type PdfCanvasHandle } from './PdfCanvas';
import { MeasurementOverlay } from './MeasurementOverlay';
import { CalibrationDialog } from './CalibrationDialog';
import {
  pdfDistance, pdfPolylineLength, pdfPolygonArea,
  realLinearDistance, realPolygonArea, realPolygonPerimeter,
  formatLinear, formatArea, DEFAULT_COLORS,
} from './lib/geometry';
import type {
  Takeoff, Measurement, PdfPoint, PageCalibration,
  TakeoffTool, LinearMeasurement, AreaMeasurement, CountMeasurement,
  LinearUnit, AreaUnit,
} from './lib/types';

interface Props {
  projectId: string;
  projectName?: string;
  // Optional: when set, pushing to estimate will use this estimate id; otherwise opens a picker.
  estimateId?: string;
  onPushToEstimate?: (lineItems: Array<{
    description: string;
    qty: number;
    unit: string;
    trade?: string;
    sourceMeasurementId: string;
  }>) => void;
}

const TRADES = [
  '', 'general', 'site', 'concrete', 'framing', 'roofing', 'electrical',
  'plumbing', 'hvac', 'insulation', 'drywall', 'flooring', 'paint',
  'cabinets', 'tile', 'exterior', 'landscaping', 'other',
];

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function TakeoffStudio({ projectId, projectName, estimateId, onPushToEstimate }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<PdfCanvasHandle>(null);

  // ─── Takeoff list / selection ────────────────────────────────────────────
  const [takeoffs, setTakeoffs] = useState<Takeoff[]>([]);
  const [activeTakeoffId, setActiveTakeoffId] = useState<string | null>(null);
  const activeTakeoff = takeoffs.find(t => t.id === activeTakeoffId) || null;

  // ─── Viewer state ───────────────────────────────────────────────────────
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [zoom, setZoom] = useState(1.0);

  // ─── Tool state ─────────────────────────────────────────────────────────
  const [tool, setTool] = useState<TakeoffTool>('pan');
  const [inProgressPoints, setInProgressPoints] = useState<PdfPoint[]>([]);
  const [cursorPdf, setCursorPdf] = useState<PdfPoint | null>(null);
  const [calibrationDialog, setCalibrationDialog] = useState<{ a: PdfPoint; b: PdfPoint } | null>(null);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [activeCountId, setActiveCountId] = useState<string | null>(null);
  const [pushSelection, setPushSelection] = useState<Set<string>>(new Set());

  // ─── Upload state ───────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Subscribe to takeoffs for this project ─────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    const q = query(
      collection(db, 'projects', projectId, 'takeoffs'),
      orderBy('createdAt', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Takeoff));
      setTakeoffs(list);
      // Auto-select the most recent one if nothing selected.
      if (!activeTakeoffId && list.length > 0) setActiveTakeoffId(list[0].id);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Reset transient state when switching takeoff or page.
  useEffect(() => {
    setInProgressPoints([]);
    setCursorPdf(null);
    setActiveCountId(null);
    setSelectedMeasurementId(null);
  }, [activeTakeoffId, pageNumber, tool]);

  const currentCalibration: PageCalibration | null =
    activeTakeoff?.calibrations?.[String(pageNumber)] ?? null;

  const measurementsThisPage = useMemo(
    () => (activeTakeoff?.measurements ?? []).filter(m => m.pageNumber === pageNumber),
    [activeTakeoff, pageNumber],
  );

  // ─── Upload handler ─────────────────────────────────────────────────────
  const handleFileSelected = async (file: File) => {
    if (!user) return;
    if (file.type !== 'application/pdf') {
      toast({ title: 'PDF only', description: 'Phase 1 supports PDF plans only.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setUploadProgress(0);

    try {
      const takeoffId = newId();
      const path = `projects/${projectId}/takeoffs/${takeoffId}/${file.name}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          err => reject(err),
          () => resolve(),
        );
      });
      const url = await getDownloadURL(sref);

      const docRef = doc(db, 'projects', projectId, 'takeoffs', takeoffId);
      const now = new Date().toISOString();
      const takeoffData: Omit<Takeoff, 'id'> = {
        projectId,
        name: file.name.replace(/\.pdf$/i, ''),
        fileUrl: url,
        fileName: file.name,
        fileSize: file.size,
        pageCount: 1, // updated after PDF loads
        calibrations: {},
        measurements: [],
        createdAt: now,
        createdBy: user.id?.toString() || user.email || 'unknown',
        updatedAt: now,
        updatedBy: user.id?.toString() || user.email || 'unknown',
      };
      await setDoc(docRef, takeoffData);
      setActiveTakeoffId(takeoffId);
      setPageNumber(1);
      toast({ title: 'Plan uploaded', description: file.name });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ─── Persist helpers ────────────────────────────────────────────────────
  const persistTakeoff = useCallback(async (patch: Partial<Takeoff>) => {
    if (!activeTakeoff || !user) return;
    const ref = doc(db, 'projects', projectId, 'takeoffs', activeTakeoff.id);
    await updateDoc(ref, {
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id?.toString() || user.email || 'unknown',
    } as any);
  }, [activeTakeoff, projectId, user]);

  const saveMeasurement = useCallback(async (m: Measurement) => {
    if (!activeTakeoff) return;
    const list = [...(activeTakeoff.measurements || []), m];
    await persistTakeoff({ measurements: list });
  }, [activeTakeoff, persistTakeoff]);

  const updateMeasurement = useCallback(async (id: string, patch: Partial<Measurement>) => {
    if (!activeTakeoff) return;
    const list = (activeTakeoff.measurements || []).map(m =>
      m.id === id ? { ...m, ...patch } as Measurement : m
    );
    await persistTakeoff({ measurements: list });
  }, [activeTakeoff, persistTakeoff]);

  const deleteMeasurement = useCallback(async (id: string) => {
    if (!activeTakeoff) return;
    const list = (activeTakeoff.measurements || []).filter(m => m.id !== id);
    await persistTakeoff({ measurements: list });
  }, [activeTakeoff, persistTakeoff]);

  const saveCalibration = useCallback(async (cal: PageCalibration) => {
    if (!activeTakeoff) return;
    const calibrations = { ...(activeTakeoff.calibrations || {}), [String(pageNumber)]: cal };
    await persistTakeoff({ calibrations });
  }, [activeTakeoff, pageNumber, persistTakeoff]);

  // ─── Pointer handlers (tool-driven state machine) ───────────────────────
  const handlePointerDown = (pt: PdfPoint) => {
    if (!activeTakeoff) return;

    if (tool === 'calibrate') {
      if (inProgressPoints.length === 0) {
        setInProgressPoints([pt]);
      } else {
        const a = inProgressPoints[0];
        const b = pt;
        if (pdfDistance(a, b) < 0.5) {
          toast({ title: 'Points too close', description: 'Pick points further apart.', variant: 'destructive' });
          return;
        }
        setCalibrationDialog({ a, b });
      }
      return;
    }

    // Measuring tools require calibration first.
    if ((tool === 'linear' || tool === 'area') && !currentCalibration) {
      toast({
        title: 'Calibrate page first',
        description: 'Use the Calibrate tool to set scale before measuring.',
        variant: 'destructive',
      });
      setTool('calibrate');
      return;
    }

    if (tool === 'linear') {
      setInProgressPoints(prev => [...prev, pt]);
      return;
    }

    if (tool === 'area') {
      // If clicking near the first point with ≥3 points, close the polygon.
      if (inProgressPoints.length >= 3) {
        const cssFirst = canvasRef.current?.pdfToCssPoint(inProgressPoints[0]);
        const cssNow = canvasRef.current?.pdfToCssPoint(pt);
        if (cssFirst && cssNow) {
          const dx = cssNow.x - cssFirst.x;
          const dy = cssNow.y - cssFirst.y;
          if (Math.sqrt(dx * dx + dy * dy) < 10) {
            finishAreaMeasurement(inProgressPoints);
            return;
          }
        }
      }
      setInProgressPoints(prev => [...prev, pt]);
      return;
    }

    if (tool === 'count') {
      if (!currentCalibration && false) {
        // Count doesn't strictly need calibration.
      }
      if (!activeCountId) {
        // Start a new count measurement.
        const id = newId();
        const m: CountMeasurement = {
          id,
          pageNumber,
          type: 'count',
          label: `Count ${(activeTakeoff.measurements?.filter(x => x.type === 'count').length ?? 0) + 1}`,
          color: DEFAULT_COLORS.count,
          points: [pt],
          value: 1,
          createdAt: new Date().toISOString(),
          createdBy: user?.id?.toString() || user?.email || 'unknown',
        };
        setActiveCountId(id);
        saveMeasurement(m);
      } else {
        // Append point to active count.
        const existing = activeTakeoff.measurements.find(m => m.id === activeCountId) as CountMeasurement | undefined;
        if (existing) {
          const next = [...existing.points, pt];
          updateMeasurement(activeCountId, { points: next, value: next.length } as Partial<CountMeasurement>);
        }
      }
      return;
    }
  };

  const handlePointerMove = (pt: PdfPoint) => {
    if (tool === 'pan' || tool === 'count') return;
    setCursorPdf(pt);
  };

  const handleDoubleClick = () => {
    if (!activeTakeoff) return;
    if (tool === 'linear' && inProgressPoints.length >= 2) {
      finishLinearMeasurement(inProgressPoints);
    } else if (tool === 'area' && inProgressPoints.length >= 3) {
      finishAreaMeasurement(inProgressPoints);
    }
  };

  const finishLinearMeasurement = (pts: PdfPoint[]) => {
    if (!currentCalibration || !user) return;
    const value = realLinearDistance(pts, currentCalibration, currentCalibration.unit);
    const id = newId();
    const m: LinearMeasurement = {
      id,
      pageNumber,
      type: 'linear',
      label: `Linear ${(activeTakeoff?.measurements?.filter(x => x.type === 'linear').length ?? 0) + 1}`,
      color: DEFAULT_COLORS.linear,
      points: pts,
      value,
      unit: currentCalibration.unit,
      createdAt: new Date().toISOString(),
      createdBy: user.id?.toString() || user.email || 'unknown',
    };
    saveMeasurement(m);
    setInProgressPoints([]);
    setCursorPdf(null);
  };

  const finishAreaMeasurement = (pts: PdfPoint[]) => {
    if (!currentCalibration || !user) return;
    const value = realPolygonArea(pts, currentCalibration, 'sq ft');
    const perimeter = realPolygonPerimeter(pts, currentCalibration, 'ft');
    const id = newId();
    const m: AreaMeasurement = {
      id,
      pageNumber,
      type: 'area',
      label: `Area ${(activeTakeoff?.measurements?.filter(x => x.type === 'area').length ?? 0) + 1}`,
      color: DEFAULT_COLORS.area,
      points: pts,
      value,
      unit: 'sq ft',
      perimeter,
      perimeterUnit: 'ft',
      createdAt: new Date().toISOString(),
      createdBy: user.id?.toString() || user.email || 'unknown',
    };
    saveMeasurement(m);
    setInProgressPoints([]);
    setCursorPdf(null);
  };

  const finishCount = () => {
    setActiveCountId(null);
    setTool('pan');
  };

  // Calibration confirm — convert the picked PDF distance to scale factor.
  const onCalibrationConfirm = (realDistance: number, unit: LinearUnit) => {
    if (!calibrationDialog || !user) return;
    const { a, b } = calibrationDialog;
    const pdfDist = pdfDistance(a, b);
    const cal: PageCalibration = {
      pdfUnitsPerLinearUnit: pdfDist / realDistance,
      unit,
      anchorA: a,
      anchorB: b,
      realDistance,
      calibratedAt: new Date().toISOString(),
      calibratedBy: user.id?.toString() || user.email || 'unknown',
    };
    saveCalibration(cal);
    setCalibrationDialog(null);
    setInProgressPoints([]);
    setCursorPdf(null);
    setTool('pan');
    toast({
      title: 'Page calibrated',
      description: `1 ${unit} = ${cal.pdfUnitsPerLinearUnit.toFixed(2)} PDF units`,
    });
  };

  // ESC cancels in-progress measurement
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInProgressPoints([]);
        setCursorPdf(null);
        if (activeCountId) finishCount();
      } else if (e.key === 'Enter' && tool === 'linear' && inProgressPoints.length >= 2) {
        finishLinearMeasurement(inProgressPoints);
      } else if (e.key === 'Enter' && tool === 'area' && inProgressPoints.length >= 3) {
        finishAreaMeasurement(inProgressPoints);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, inProgressPoints, activeCountId]);

  // ─── Push to estimate ───────────────────────────────────────────────────
  const handlePushToEstimate = () => {
    if (pushSelection.size === 0) {
      toast({ title: 'Nothing selected', description: 'Check measurements to push.' });
      return;
    }
    const items = Array.from(pushSelection)
      .map(id => activeTakeoff!.measurements.find(m => m.id === id))
      .filter((m): m is Measurement => !!m)
      .map(m => {
        const unit = m.type === 'linear' ? (m as LinearMeasurement).unit
          : m.type === 'area' ? (m as AreaMeasurement).unit
          : 'ea';
        const qty = m.type === 'count' ? (m as CountMeasurement).value : (m as any).value;
        return {
          description: m.label,
          qty: Math.round(qty * 100) / 100,
          unit: unit === 'ft' ? 'lin ft' : unit === 'sq ft' ? 'sq ft' : unit,
          trade: m.trade,
          sourceMeasurementId: m.id,
        };
      });
    onPushToEstimate?.(items);
    toast({ title: 'Pushed to estimate', description: `${items.length} line item(s) added.` });
    setPushSelection(new Set());
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const cssSize = canvasRef.current?.getCssSize?.() || { width: 0, height: 0 };

  // No takeoffs yet → show upload prompt.
  if (takeoffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 space-y-4 bg-gray-50 rounded-lg">
        <Upload className="w-12 h-12 text-gray-400" />
        <h3 className="text-lg font-medium">No plans uploaded yet</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">
          Upload a PDF plan set for {projectName || 'this project'} to start measuring. Set the scale once per page,
          then take linear, area, and count measurements that push directly to your estimates.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
        />
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? `Uploading… ${Math.round(uploadProgress)}%` : 'Upload Plan PDF'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 600 }}>
      {/* Header / takeoff selector */}
      <div className="flex items-center gap-2 p-3 border-b bg-white">
        <FileText className="w-4 h-4 text-gray-500" />
        <select
          className="text-sm border rounded px-2 py-1"
          value={activeTakeoffId || ''}
          onChange={e => { setActiveTakeoffId(e.target.value); setPageNumber(1); }}
        >
          {takeoffs.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
        />
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          {uploading ? `${Math.round(uploadProgress)}%` : 'Upload'}
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {currentCalibration ? (
            <Badge variant="outline" className="text-xs gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-600" />
              Page {pageNumber} calibrated · 1 {currentCalibration.unit} = {currentCalibration.pdfUnitsPerLinearUnit.toFixed(2)} u
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs gap-1 text-orange-700 border-orange-300">
              <AlertTriangle className="w-3 h-3" />
              Page {pageNumber} not calibrated
            </Badge>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-gray-50">
        <ToolButton icon={Move} label="Pan" active={tool === 'pan'} onClick={() => setTool('pan')} />
        <ToolButton icon={Ruler} label="Calibrate" active={tool === 'calibrate'} onClick={() => setTool('calibrate')} accent />
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <ToolButton icon={MousePointer2} label="Linear" active={tool === 'linear'} onClick={() => setTool('linear')} />
        <ToolButton icon={Square} label="Area" active={tool === 'area'} onClick={() => setTool('area')} />
        <ToolButton icon={Hash} label="Count" active={tool === 'count'} onClick={() => setTool('count')} />

        {(tool === 'linear' || tool === 'area') && inProgressPoints.length >= (tool === 'linear' ? 2 : 3) && (
          <Button size="sm" variant="default" className="ml-2"
            onClick={() => tool === 'linear' ? finishLinearMeasurement(inProgressPoints) : finishAreaMeasurement(inProgressPoints)}>
            Finish ({inProgressPoints.length} pts)
          </Button>
        )}
        {tool === 'count' && activeCountId && (
          <Button size="sm" variant="default" className="ml-2" onClick={finishCount}>Finish Count</Button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.max(0.25, z * 0.85))}><ZoomOut className="w-4 h-4" /></Button>
          <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={() => setZoom(z => Math.min(8, z * 1.18))}><ZoomIn className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(1)}><Maximize2 className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <Button size="sm" variant="ghost" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs tabular-nums">Page {pageNumber} / {pageCount}</span>
          <Button size="sm" variant="ghost" onClick={() => setPageNumber(p => Math.min(pageCount, p + 1))} disabled={pageNumber >= pageCount}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Body: viewer + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* PDF viewer */}
        <div
          className="flex-1 overflow-auto bg-gray-200 p-4"
          onDoubleClick={handleDoubleClick}
        >
          {activeTakeoff && (
            <PdfCanvas
              ref={canvasRef}
              fileUrl={activeTakeoff.fileUrl}
              pageNumber={pageNumber}
              zoom={zoom}
              cursor={tool === 'pan' ? 'default' : 'crosshair'}
              onLoad={({ pageCount: pc }) => {
                setPageCount(pc);
                if (activeTakeoff && activeTakeoff.pageCount !== pc) {
                  persistTakeoff({ pageCount: pc });
                }
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
            >
              <MeasurementOverlay
                width={cssSize.width}
                height={cssSize.height}
                measurements={measurementsThisPage}
                inProgress={
                  tool === 'calibrate' || tool === 'linear' || tool === 'area'
                    ? {
                        type: tool,
                        points: inProgressPoints,
                        cursor: cursorPdf,
                        color: tool === 'calibrate' ? DEFAULT_COLORS.calibration
                          : tool === 'linear' ? DEFAULT_COLORS.linear
                          : DEFAULT_COLORS.area,
                      }
                    : null
                }
                calibration={currentCalibration}
                pdfToCss={(pt) => canvasRef.current?.pdfToCssPoint(pt) ?? null}
                selectedId={selectedMeasurementId}
                onSelect={setSelectedMeasurementId}
              />
            </PdfCanvas>
          )}
        </div>

        {/* Sidebar — measurement list */}
        <div className="w-80 border-l bg-white flex flex-col">
          <div className="p-3 border-b flex items-center justify-between">
            <span className="text-sm font-semibold">Measurements (p.{pageNumber})</span>
            <Badge variant="outline" className="text-xs">{measurementsThisPage.length}</Badge>
          </div>
          <ScrollArea className="flex-1">
            {measurementsThisPage.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400">
                Pick a tool above and start measuring. Calibrate the page first for accurate results.
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {measurementsThisPage.map(m => (
                  <MeasurementRow
                    key={m.id}
                    m={m}
                    calibration={currentCalibration}
                    selected={selectedMeasurementId === m.id}
                    checked={pushSelection.has(m.id)}
                    onSelect={() => setSelectedMeasurementId(m.id)}
                    onCheck={(checked) => {
                      const next = new Set(pushSelection);
                      checked ? next.add(m.id) : next.delete(m.id);
                      setPushSelection(next);
                    }}
                    onDelete={() => deleteMeasurement(m.id)}
                    onRename={(label) => updateMeasurement(m.id, { label })}
                    onTradeChange={(trade) => updateMeasurement(m.id, { trade })}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
          {onPushToEstimate && (
            <div className="p-3 border-t">
              <Button
                className="w-full"
                disabled={pushSelection.size === 0}
                onClick={handlePushToEstimate}
              >
                <Send className="w-4 h-4 mr-2" />
                Push {pushSelection.size} to Estimate
              </Button>
            </div>
          )}
        </div>
      </div>

      {calibrationDialog && (
        <CalibrationDialog
          open={!!calibrationDialog}
          pdfDistanceUnits={pdfDistance(calibrationDialog.a, calibrationDialog.b)}
          anchorA={calibrationDialog.a}
          anchorB={calibrationDialog.b}
          onCancel={() => { setCalibrationDialog(null); setInProgressPoints([]); }}
          onConfirm={onCalibrationConfirm}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolButton({
  icon: Icon, label, active, onClick, accent,
}: { icon: any; label: string; active: boolean; onClick: () => void; accent?: boolean }) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'ghost'}
      onClick={onClick}
      className={`gap-1.5 ${accent && !active ? 'text-red-600 hover:text-red-700' : ''}`}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}

function MeasurementRow({
  m, calibration, selected, checked, onSelect, onCheck, onDelete, onRename, onTradeChange,
}: {
  m: Measurement;
  calibration: PageCalibration | null;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
  onDelete: () => void;
  onRename: (label: string) => void;
  onTradeChange: (trade: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.label);

  let valueStr = '—';
  if (calibration) {
    if (m.type === 'linear') {
      valueStr = formatLinear(realLinearDistance(m.points, calibration, (m as LinearMeasurement).unit), (m as LinearMeasurement).unit);
    } else if (m.type === 'area') {
      valueStr = formatArea(realPolygonArea(m.points, calibration, (m as AreaMeasurement).unit), (m as AreaMeasurement).unit);
    } else if (m.type === 'count') {
      valueStr = `${(m as CountMeasurement).value}`;
    }
  } else if (m.type === 'count') {
    valueStr = `${(m as CountMeasurement).value}`;
  }

  return (
    <div
      className={`p-2 rounded border ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => { e.stopPropagation(); onCheck(e.target.checked); }}
          onClick={e => e.stopPropagation()}
        />
        <span className="w-3 h-3 rounded-full" style={{ background: m.color }} />
        {editing ? (
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              if (e.key === 'Enter') { onRename(draft); setEditing(false); }
              if (e.key === 'Escape') { setDraft(m.label); setEditing(false); }
            }}
            onBlur={() => { onRename(draft); setEditing(false); }}
            className="h-7 text-sm flex-1"
            autoFocus
          />
        ) : (
          <span
            className="text-sm font-medium flex-1 truncate"
            onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
          >
            {m.label}
          </span>
        )}
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); setEditing(true); }}>
          <Edit2 className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"
          onClick={e => { e.stopPropagation(); onDelete(); }}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex items-center gap-2 mt-1.5 pl-6 text-xs">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{m.type}</Badge>
        <span className="font-mono text-gray-700">{valueStr}</span>
        <select
          value={m.trade || ''}
          onChange={e => { e.stopPropagation(); onTradeChange(e.target.value); }}
          onClick={e => e.stopPropagation()}
          className="ml-auto text-[11px] border rounded px-1 py-0.5 bg-white"
        >
          {TRADES.map(t => <option key={t} value={t}>{t || '— trade —'}</option>)}
        </select>
      </div>
      {m.type === 'area' && calibration && (m as AreaMeasurement).perimeter != null && (
        <div className="text-[11px] text-gray-500 pl-6 mt-1">
          Perimeter: {formatLinear((m as AreaMeasurement).perimeter!, (m as AreaMeasurement).perimeterUnit || 'ft')}
        </div>
      )}
    </div>
  );
}
