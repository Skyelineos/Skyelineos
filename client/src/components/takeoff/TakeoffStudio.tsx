import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  collection, doc, addDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp,
  setDoc, deleteDoc, where, type Query,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Upload, Ruler, Move, MousePointer2, Square, MapPin, Hash,
  Trash2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2,
  FileText, Plus, AlertTriangle, CheckCircle2, Send, Edit2, Divide,
  Maximize, Minimize,
} from 'lucide-react';

import { PdfCanvas, type PdfCanvasHandle } from './PdfCanvas';
import { MeasurementOverlay } from './MeasurementOverlay';
import { CalibrationDialog } from './CalibrationDialog';
import { ScalePageDialog } from './ScalePageDialog';
import { PageThumbnails } from './PageThumbnails';
import {
  pdfDistance,
  realLinearDistance, realPolygonArea, realPolygonPerimeter,
  formatLinear, formatArea, DEFAULT_COLORS,
} from './lib/geometry';
import type {
  Takeoff, Measurement, PdfPoint, PageCalibration,
  TakeoffTool, LinearMeasurement, AreaMeasurement, CountMeasurement,
  LinearUnit, AreaUnit,
} from './lib/types';

// Scope tells the studio which Firestore collection to read/write. 'gc' is the
// default — project-scoped takeoffs visible to GC/designers. 'sub' is per-sub
// scope — measurements live in `subTakeoffs/` filtered by subUserId so a sub
// can do their own takeoff against a project's plans without exposing it to
// other subs. The `bidRequestId` lets us tag the takeoff with the bid context.
export interface TakeoffScope {
  kind: 'gc' | 'sub';
  bidRequestId?: string;
}

interface Props {
  projectId: string;
  projectName?: string;
  scope?: TakeoffScope;
  // Optional: when set, pushing to estimate will use this estimate id; otherwise opens a picker.
  estimateId?: string;
  onPushToEstimate?: (lineItems: Array<{
    description: string;
    qty: number;
    unit: string;
    trade?: string;
    sourceMeasurementId: string;
  }>) => void;
  // Optional: in sub scope, lets the parent bid form know which measurements
  // the sub wants attached to their bid submission.
  onAttachToBid?: (measurements: Array<{
    id: string;
    type: 'linear' | 'area' | 'count';
    label: string;
    value: number;
    unit: string;
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

export default function TakeoffStudio({ projectId, projectName, scope, estimateId, onPushToEstimate, onAttachToBid }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<PdfCanvasHandle>(null);

  // ─── Scope helpers (gc = project takeoffs / sub = subTakeoffs filtered by uid) ──
  const isSub = scope?.kind === 'sub';
  const subUserId = user?.id?.toString() || user?.email || '';
  const subUserName = user?.name || user?.email || '';

  const buildListQuery = useCallback((): Query | null => {
    if (!projectId) return null;
    if (isSub) {
      // No orderBy here — composite indexes are easier to skip; sort client-side.
      return query(
        collection(db, 'subTakeoffs'),
        where('subUserId', '==', subUserId),
        where('projectId', '==', projectId),
      );
    }
    return query(collection(db, 'projects', projectId, 'takeoffs'), orderBy('createdAt', 'desc'));
  }, [isSub, projectId, subUserId]);

  const newTakeoffRef = (id: string) =>
    isSub ? doc(db, 'subTakeoffs', id) : doc(db, 'projects', projectId, 'takeoffs', id);

  const existingTakeoffRef = (id: string) =>
    isSub ? doc(db, 'subTakeoffs', id) : doc(db, 'projects', projectId, 'takeoffs', id);

  const buildStoragePath = (id: string, fileName: string) =>
    isSub ? `subTakeoffs/${id}/${fileName}` : `projects/${projectId}/takeoffs/${id}/${fileName}`;

  // ─── Takeoff list / selection ────────────────────────────────────────────
  const [takeoffs, setTakeoffs] = useState<Takeoff[]>([]);
  const [activeTakeoffId, setActiveTakeoffId] = useState<string | null>(null);
  const activeTakeoff = takeoffs.find(t => t.id === activeTakeoffId) || null;

  // ─── Viewer state ───────────────────────────────────────────────────────
  const [pageNumber, setPageNumber] = useState(1);
  // PDF.js userUnit for the current page. Default 1.0 means 1 PDF unit =
  // 1/72 inch (the spec default). Some architect exports ship at 2.0 (or
  // 0.5) which throws standard-scale math off by that factor — we multiply
  // pdfUnitsPerLinearUnit by this when applying a standard scale.
  const [pageUserUnit, setPageUserUnit] = useState(1);
  // Holds the result of a completed Verify so we can prompt the user to
  // confirm the measurement matches the labeled dimension on the plan.
  const [verifyResult, setVerifyResult] = useState<{
    a: PdfPoint;
    b: PdfPoint;
    measured: number;
    unit: LinearUnit;
  } | null>(null);
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

  // ─── Scale Page dialog ──────────────────────────────────────────────────
  const [scalePageOpen, setScalePageOpen] = useState(false);

  // ─── Fullscreen view of the plan ────────────────────────────────────────
  // When true, the takeoff studio root takes over the viewport (position
  // fixed) so subs / Tyler can measure on the full screen without the page
  // chrome competing for space.
  const [fullscreen, setFullscreen] = useState(false);

  // ─── Per-tool color + label selection ───────────────────────────────────
  // When the user enters a measurement tool we prompt for a color AND a
  // title. While they stay in that tool, consecutive measurements reuse
  // both (auto-numbered: "Kitchen Flooring 1", "Kitchen Flooring 2"…).
  // Switching to any other tool clears them so the picker fires again
  // next time they enter Linear / Area / Count.
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [colorPickerTool, setColorPickerTool] = useState<'linear' | 'area' | 'count' | null>(null);

  // ─── Viewport pan / zoom (wheel + spacebar) ─────────────────────────────
  const viewerScrollRef = useRef<HTMLDivElement | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Live transform mirrored from PdfCanvas. Triggers re-render of
  // MeasurementOverlay so measurements track pan/zoom in real time.
  const [liveTransform, setLiveTransform] = useState<{ scale: number; tx: number; ty: number }>({ scale: 1, tx: 0, ty: 0 });
  const panState = useRef<{ active: boolean; startX: number; startY: number; scrollLeft: number; scrollTop: number }>({
    active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0,
  });

  // Track spacebar (hold to pan) + Escape (exit measuring back to Pan).
  useEffect(() => {
    const isFormField = (target: any) => target && (
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
    );
    const onDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.code === 'Space' && !e.repeat) {
        if (isFormField(target)) return;
        e.preventDefault();
        setSpaceHeld(true);
      } else if (e.code === 'Escape') {
        if (isFormField(target)) return;
        // Bail out of any active measurement back to Pan mode.
        setInProgressPoints([]);
        setTool(prev => (prev === 'pan' ? prev : 'pan'));
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceHeld(false);
        panState.current.active = false;
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Wheel zoom is now owned by PdfCanvas (it implements the cursor-anchored
  // formula directly on its 2D context). We just listen for zoom changes via
  // the onZoomChange callback so the toolbar stays in sync.
  const setViewerScrollRef = useCallback((node: HTMLDivElement | null) => {
    viewerScrollRef.current = node;
  }, []);

  // Spacebar-pan — click-drag pans the canvas internally via panBy on the
  // PdfCanvas ref. No more scrollLeft/scrollTop on the wrapper.
  const onViewerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!spaceHeld) return;
    panState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: 0, // unused with internal canvas pan
      scrollTop: 0,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };
  const onViewerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!spaceHeld || !panState.current.active) return;
    const dx = e.clientX - panState.current.startX;
    const dy = e.clientY - panState.current.startY;
    panState.current.startX = e.clientX;
    panState.current.startY = e.clientY;
    canvasRef.current?.panBy(dx, dy);
  };
  const onViewerPointerUp = () => {
    panState.current.active = false;
  };

  // ─── Subscribe to takeoffs (project-scoped or sub-scoped) ─────────────────
  useEffect(() => {
    const q = buildListQuery();
    if (!q) return;
    const unsub = onSnapshot(q, snap => {
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Takeoff));
      // Sub-scope skips orderBy in the query (avoids needing a composite index).
      // Sort client-side so newest is first.
      if (isSub) {
        list = [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      }
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
  const calibrationVerified = !!(currentCalibration && (currentCalibration as any).verified);

  const measurementsThisPage = useMemo(
    () => (activeTakeoff?.measurements ?? []).filter(m => m.pageNumber === pageNumber),
    [activeTakeoff, pageNumber],
  );

  // Gate measurement tools behind a Scale Page + Verify combo. Blocks the
  // user from drawing Linear/Area/Count until the calibration was either
  // manually picked (auto-verified) OR a standard scale was applied AND a
  // verify-against-known-dimension was confirmed.
  const requireVerified = (onProceed: () => void) => {
    if (!currentCalibration) {
      toast({
        title: 'Scale this page first',
        description: 'Set the page scale, then Verify on a known dimension before measuring.',
        variant: 'destructive',
      });
      setScalePageOpen(true);
      return;
    }
    if (!calibrationVerified) {
      toast({
        title: 'Verify the scale first',
        description: 'Click two points on a known dimension to confirm the scale before measuring.',
        variant: 'destructive',
      });
      setTool('verify');
      setInProgressPoints([]);
      return;
    }
    onProceed();
  };

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
      const path = buildStoragePath(takeoffId, file.name);
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

      const docRef = newTakeoffRef(takeoffId);
      const now = new Date().toISOString();
      const baseData: Omit<Takeoff, 'id'> = {
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
      // In sub scope, tag the doc with the sub identity + bid context so the
      // Firestore rule can scope reads/writes per-sub.
      const takeoffData: any = isSub
        ? { ...baseData, subUserId, subUserName, bidRequestId: scope?.bidRequestId || null }
        : baseData;
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
    const ref = existingTakeoffRef(activeTakeoff.id);
    await updateDoc(ref, {
      ...patch,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id?.toString() || user.email || 'unknown',
    } as any);
  }, [activeTakeoff, projectId, user, isSub]);

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

  // ─── Tool-entry helpers (color + label picker integration) ──────────────
  // Switch to a non-measurement tool. Always clears the pending color/label
  // so the next measurement tool entry re-prompts.
  const enterNonMeasurementTool = (newTool: TakeoffTool) => {
    setPendingColor(null);
    setPendingLabel(null);
    setInProgressPoints([]);
    setTool(newTool);
  };

  // Click handler for Linear / Area / Count toolbar buttons.
  // - If already on this tool with prior selections, no-op (consecutive
  //   measurements reuse color + label).
  // - Otherwise open the picker; on confirm it enters the tool.
  const enterMeasurementTool = (newTool: 'linear' | 'area' | 'count') => {
    requireVerified(() => {
      if (tool === newTool && pendingColor) return;
      setColorPickerTool(newTool);
      setColorPickerOpen(true);
    });
  };

  // Picker confirm — atomically set pendingColor, pendingLabel + tool.
  const confirmColorSelection = (color: string, label: string) => {
    if (!colorPickerTool) return;
    setPendingColor(color);
    setPendingLabel(label.trim() || null);
    setInProgressPoints([]);
    setTool(colorPickerTool);
    setColorPickerOpen(false);
    setColorPickerTool(null);
  };

  // Manual escape hatch: doubles or un-doubles every page's calibration so
  // all measurements are halved (or restored). Use when a plan set reads
  // exactly 2× the real dimensions and the userUnit auto-correct didn't
  // catch it (e.g. user picked imprecise verify points).
  const toggleHalveAll = useCallback(async () => {
    if (!activeTakeoff) return;
    const turningOn = !activeTakeoff.halvedAllPages;
    const factor = turningOn ? 2 : 0.5;
    const src = activeTakeoff.calibrations || {};
    const next: Record<string, PageCalibration> = {};
    for (const key of Object.keys(src)) {
      const c = src[key];
      next[key] = { ...c, pdfUnitsPerLinearUnit: c.pdfUnitsPerLinearUnit * factor };
    }
    await persistTakeoff({ calibrations: next, halvedAllPages: turningOn });
    toast({
      title: turningOn ? 'Measurements halved on all pages' : 'Halving turned off',
      description: turningOn
        ? 'All existing and new measurements will display at half value. Toggle again to undo.'
        : 'All pages restored to their original calibration.',
    });
  }, [activeTakeoff, persistTakeoff, toast]);

  // ─── Pointer handlers (tool-driven state machine) ───────────────────────
  const handlePointerDown = (pt: PdfPoint) => {
    if (!activeTakeoff) return;
    // Spacebar held → user is panning; do not place measurement points.
    if (spaceHeld) return;

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

    if (tool === 'verify') {
      // Tap two points on a known dimension. After the second click we open
      // a confirmation dialog so the user can mark the page verified (or
      // re-calibrate from those two points if the scale is wrong).
      if (!currentCalibration) {
        toast({
          title: 'Scale page first',
          description: 'Verify needs a scale to compare against. Set the page scale first.',
          variant: 'destructive',
        });
        return;
      }
      if (inProgressPoints.length === 0) {
        setInProgressPoints([pt]);
      } else {
        const a = inProgressPoints[0];
        const b = pt;
        const realLen = realLinearDistance([a, b], currentCalibration, currentCalibration.unit);
        setVerifyResult({
          a,
          b,
          measured: realLen,
          unit: currentCalibration.unit,
        });
        setInProgressPoints([]);
      }
      return;
    }

    // Measuring tools require calibration first.
    if ((tool === 'linear' || tool === 'area') && !currentCalibration) {
      toast({
        title: 'Scale page first',
        description: 'Use the Scale Page button to set the page scale before measuring.',
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
          label: pendingLabel
            ? `${pendingLabel} ${(activeTakeoff.measurements?.filter(x => x.type === 'count' && x.label.startsWith(pendingLabel)).length ?? 0) + 1}`
            : `Count ${(activeTakeoff.measurements?.filter(x => x.type === 'count').length ?? 0) + 1}`,
          color: pendingColor || DEFAULT_COLORS.count,
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
    if (spaceHeld) return;
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
      label: pendingLabel
        ? `${pendingLabel} ${(activeTakeoff?.measurements?.filter(x => x.type === 'linear' && x.label.startsWith(pendingLabel)).length ?? 0) + 1}`
        : `Linear ${(activeTakeoff?.measurements?.filter(x => x.type === 'linear').length ?? 0) + 1}`,
      color: pendingColor || DEFAULT_COLORS.linear,
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
      label: pendingLabel
        ? `${pendingLabel} ${(activeTakeoff?.measurements?.filter(x => x.type === 'area' && x.label.startsWith(pendingLabel)).length ?? 0) + 1}`
        : `Area ${(activeTakeoff?.measurements?.filter(x => x.type === 'area').length ?? 0) + 1}`,
      color: pendingColor || DEFAULT_COLORS.area,
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

  // Apply a standard architectural / engineering / metric scale directly,
  // bypassing the two-point calibration. Assumes PDF user space is at 72
  // units/inch (the PDF spec default; matches plans exported to-scale).
  // When applyAllPages=true, writes the calibration to every page in the doc
  // (most plan sets share a single scale).
  const applyStandardScale = (pdfUnitsPerLinearUnit: number, unit: LinearUnit, label: string, applyAllPages: boolean = false) => {
    if (!user || !activeTakeoff) return;
    // PDF.js userUnit auto-correction: standard scales assume 72 PDF units/inch
    // (spec default). Architect exports with a non-default UserUnit shift the
    // ratio by that factor. We scale here so the user just picks "1/4" = 1'-0""
    // and the math is right regardless of how the PDF was exported.
    const corrected = pdfUnitsPerLinearUnit * (pageUserUnit || 1);
    const cal: PageCalibration = {
      pdfUnitsPerLinearUnit: corrected,
      unit,
      anchorA: { x: 0, y: 0 },
      anchorB: { x: 0, y: 0 },
      realDistance: 0,
      calibratedAt: new Date().toISOString(),
      calibratedBy: user.id?.toString() || user.email || 'unknown',
      // Standard scales need verification on the page — see verifiedAt check
      // below that gates the measurement tools.
      verified: false,
    } as any;
    if (applyAllPages && pageCount > 1) {
      const calibrations = { ...(activeTakeoff.calibrations || {}) };
      for (let p = 1; p <= pageCount; p++) calibrations[String(p)] = cal;
      persistTakeoff({ calibrations });
      toast({
        title: `All ${pageCount} pages scaled`,
        description: `${label} applied to every page.`,
      });
    } else {
      saveCalibration(cal);
      toast({
        title: 'Page scaled — verify before measuring',
        description: `${label} · 1 ${unit} = ${corrected.toFixed(2)} PDF units. Run Verify on a known dimension to unlock measurements.`,
      });
    }
    setScalePageOpen(false);
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
      // Manual calibration is self-verifying (user picked a known dimension).
      verified: true,
    } as any;
    saveCalibration(cal);
    setCalibrationDialog(null);
    setInProgressPoints([]);
    setCursorPdf(null);
    setTool('pan');
    toast({
      title: 'Page scaled',
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
    <div
      className={
        fullscreen
          ? 'flex flex-col fixed inset-0 z-50 bg-white'
          : 'flex flex-col h-full'
      }
      style={fullscreen ? undefined : { minHeight: 600 }}
    >
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
          {currentCalibration ? (() => {
            // Reverse-lookup: if pdfUnitsPerLinearUnit matches a known architectural
            // scale within 1%, display the friendly label ("1/4\" = 1'-0\"").
            const ratio = currentCalibration.pdfUnitsPerLinearUnit;
            const ARCH_SCALES: Array<[number, string]> = [
              [72 / 16,    '1/16" = 1\'-0"'],
              [72 * 3/32,  '3/32" = 1\'-0"'],
              [72 / 8,     '1/8" = 1\'-0"'],
              [72 * 3/16,  '3/16" = 1\'-0"'],
              [72 / 4,     '1/4" = 1\'-0"'],
              [72 * 3/8,   '3/8" = 1\'-0"'],
              [72 / 2,     '1/2" = 1\'-0"'],
              [72 * 3/4,   '3/4" = 1\'-0"'],
              [72,         '1" = 1\'-0"'],
              [72 * 1.5,   '1 1/2" = 1\'-0"'],
              [72 * 3,     '3" = 1\'-0"'],
              [72 / 10,    '1" = 10\''],
              [72 / 20,    '1" = 20\''],
              [72 / 30,    '1" = 30\''],
              [72 / 40,    '1" = 40\''],
              [72 / 50,    '1" = 50\''],
              [72 / 60,    '1" = 60\''],
              [72 / 100,   '1" = 100\''],
            ];
            const match = currentCalibration.unit === 'ft'
              ? ARCH_SCALES.find(([v]) => Math.abs(v - ratio) / ratio < 0.01)
              : null;
            return (
              <Badge variant="outline" className="text-xs gap-1 border-green-300 bg-green-50">
                <CheckCircle2 className="w-3 h-3 text-green-600" />
                <span>
                  <strong>Scale:</strong>{' '}
                  {match
                    ? match[1]
                    : `${ratio.toFixed(2)} px / ${currentCalibration.unit}`}
                </span>
              </Badge>
            );
          })() : (
            <Badge variant="outline" className="text-xs gap-1 text-orange-700 border-orange-300 bg-orange-50">
              <AlertTriangle className="w-3 h-3" />
              Page {pageNumber} not scaled — measurements will be inaccurate
            </Badge>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border-b bg-gray-50">
        <ToolButton icon={Move} label="Pan" active={tool === 'pan'} onClick={() => enterNonMeasurementTool('pan')} />
        <ToolButton icon={Ruler} label="Scale Page" active={tool === 'calibrate' || scalePageOpen} onClick={() => setScalePageOpen(true)} accent />
        <ToolButton icon={CheckCircle2} label="Verify" active={tool === 'verify'} onClick={() => enterNonMeasurementTool('verify')} />
        <ToolButton
          icon={Divide}
          label="2"
          active={!!activeTakeoff?.halvedAllPages}
          onClick={toggleHalveAll}
          title="Halve all measurements — toggle on if every page reads double the real dimensions. Click again to revert."
        />
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <ToolButton icon={MousePointer2} label="Linear" active={tool === 'linear'} onClick={() => enterMeasurementTool('linear')} />
        <ToolButton icon={Square} label="Area" active={tool === 'area'} onClick={() => enterMeasurementTool('area')} />
        <ToolButton icon={Hash} label="Count" active={tool === 'count'} onClick={() => enterMeasurementTool('count')} />

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
          <Button size="sm" variant="ghost" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1} title="Previous page">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          {/* Direct jump-to-page input (useful for multi-page plan sets). */}
          <div className="flex items-center gap-1 text-xs tabular-nums">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={pageNumber}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n) && n >= 1 && n <= pageCount) setPageNumber(n);
              }}
              className="w-12 text-center border border-gray-200 rounded px-1 py-0.5 tabular-nums focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
            />
            <span>/ {pageCount}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setPageNumber(p => Math.min(pageCount, p + 1))} disabled={pageNumber >= pageCount} title="Next page">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <Button
            size="sm"
            variant={fullscreen ? 'default' : 'outline'}
            onClick={() => setFullscreen(f => !f)}
            title={fullscreen ? 'Exit full screen' : 'Full screen'}
            className="gap-1"
          >
            {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            <span className="hidden sm:inline text-xs">
              {fullscreen ? 'Exit Full Screen' : 'Full Screen'}
            </span>
          </Button>
        </div>
      </div>

      {/* Body: thumbnails + viewer + measurement sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Page thumbnails — only show for multi-page docs. */}
        {activeTakeoff && pageCount > 1 && (
          <PageThumbnails
            fileUrl={activeTakeoff.fileUrl}
            currentPage={pageNumber}
            onSelectPage={(p) => setPageNumber(p)}
          />
        )}

        {/* PDF viewer — fixed-size box. The canvas inside owns zoom/pan via
            ctx.setTransform; nothing scrolls at the DOM level. */}
        <div
          ref={setViewerScrollRef}
          className="flex-1 min-w-0 bg-gray-200 relative"
          style={{
            cursor: spaceHeld ? (panState.current.active ? 'grabbing' : 'grab') : undefined,
            touchAction: 'none',
            overscrollBehavior: 'contain',
            overflow: 'hidden',
          }}
          onDoubleClick={handleDoubleClick}
          onPointerDown={onViewerPointerDown}
          onPointerMove={onViewerPointerMove}
          onPointerUp={onViewerPointerUp}
          onPointerCancel={onViewerPointerUp}
          onContextMenu={(e) => {
            // Right-click commits the in-progress measurement (industry std).
            e.preventDefault();
            if (tool === 'linear' && inProgressPoints.length >= 2) {
              finishLinearMeasurement(inProgressPoints);
            } else if (tool === 'area' && inProgressPoints.length >= 3) {
              finishAreaMeasurement(inProgressPoints);
            } else if (tool === 'calibrate') {
              setInProgressPoints([]);
            } else if (activeCountId) {
              finishCount();
            } else {
              // Cancel anything in-progress on right-click empty.
              setInProgressPoints([]);
            }
          }}
        >
          {activeTakeoff && (
            <PdfCanvas
              ref={canvasRef}
              fileUrl={activeTakeoff.fileUrl}
              pageNumber={pageNumber}
              zoom={zoom}
              remeasureKey={fullscreen ? 'fs' : 'norm'}
              cursor={spaceHeld ? 'grab' : (tool === 'pan' ? 'default' : 'crosshair')}
              onLoad={({ pageCount: pc }) => {
                setPageCount(pc);
                if (activeTakeoff && activeTakeoff.pageCount !== pc) {
                  persistTakeoff({ pageCount: pc });
                }
              }}
              onPageReady={(_vp, userUnit) => {
                setPageUserUnit(userUnit ?? 1);
              }}
              onZoomChange={(z) => setZoom(z)}
              onTransformChange={(t) => setLiveTransform(t)}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
            >
              <MeasurementOverlay
                width={cssSize.width}
                height={cssSize.height}
                measurements={measurementsThisPage}
                viewerScale={liveTransform.scale}
                /* tx/ty included so overlay re-renders on pan-only changes */
                viewerTx={liveTransform.tx}
                viewerTy={liveTransform.ty}
                inProgress={
                  tool === 'calibrate' || tool === 'linear' || tool === 'area' || tool === 'verify'
                    ? {
                        // Verify uses calibrate's visual (single dashed segment)
                        // since both pick exactly two points.
                        type: tool === 'verify' ? 'calibrate' : tool,
                        points: inProgressPoints,
                        cursor: cursorPdf,
                        color: (tool === 'calibrate' || tool === 'verify') ? DEFAULT_COLORS.calibration
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

          {/* Floating page-nav arrows on the canvas itself — easier to tap
              than the toolbar buttons up top. */}
          {activeTakeoff && pageCount > 1 && (
            <>
              <button
                type="button"
                onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                disabled={pageNumber <= 1}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-gray-300 shadow flex items-center justify-center hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed z-10"
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <button
                type="button"
                onClick={() => setPageNumber(p => Math.min(pageCount, p + 1))}
                disabled={pageNumber >= pageCount}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-gray-300 shadow flex items-center justify-center hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed z-10"
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight className="w-5 h-5 text-gray-700" />
              </button>
            </>
          )}

          {/* Top-right indicators / action floats */}
          {activeTakeoff && (
            <div className="absolute top-3 right-3 flex flex-col items-end gap-2 z-10 pointer-events-none">
              {/* Pan reminder — only relevant while a measurement tool is active. */}
              {(tool === 'linear' || tool === 'area' || tool === 'calibrate' || tool === 'verify' || tool === 'count') && (
                <div className={`px-2.5 py-1 rounded text-xs border shadow-sm pointer-events-none ${
                  spaceHeld ? 'bg-green-50 border-green-300 text-green-800' : 'bg-white/95 border-gray-300 text-gray-700'
                }`}>
                  {spaceHeld ? '✓ Pan mode — drag to move' : 'Hold Space to pan the plan'}
                </div>
              )}
              {/* Done-measuring button — exits the active tool back to Pan.
                  Escape key triggers the same action. */}
              {(tool === 'linear' || tool === 'area' || tool === 'count' || tool === 'verify') && (
                <button
                  type="button"
                  onClick={() => {
                    setInProgressPoints([]);
                    setTool('pan');
                  }}
                  className="pointer-events-auto px-3 py-1.5 rounded bg-[#C9A96E] text-white text-xs font-medium shadow hover:opacity-90 inline-flex items-center gap-1.5"
                  title="Done measuring (Esc)"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Done measuring
                  <kbd className="ml-1 px-1 py-0.5 rounded bg-white/20 text-[10px] font-mono">Esc</kbd>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar — measurement list. flex-shrink-0 keeps it locked at 320px
            so a wide PDF can't push it narrower. */}
        <div className="w-80 flex-shrink-0 border-l bg-white flex flex-col">
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
          {onAttachToBid && (
            <div className="p-3 border-t bg-amber-50/40">
              <Button
                className="w-full"
                style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                disabled={pushSelection.size === 0}
                onClick={() => {
                  const all = (activeTakeoff?.measurements || []) as Measurement[];
                  const selected = all
                    .filter(m => pushSelection.has(m.id))
                    .map(m => {
                      const cal = activeTakeoff?.calibrations?.[m.pageNumber];
                      let value = 0;
                      let unit = '';
                      if (m.type === 'linear') {
                        const lm = m as LinearMeasurement;
                        value = cal ? realLinearDistance(lm.points, cal, lm.unit) : 0;
                        unit = lm.unit || 'ft';
                      } else if (m.type === 'area') {
                        const am = m as AreaMeasurement;
                        value = cal ? realPolygonArea(am.points, cal, am.unit) : 0;
                        unit = am.unit || 'sq ft';
                      } else if (m.type === 'count') {
                        value = (m as CountMeasurement).points?.length || 0;
                        unit = 'ea';
                      }
                      return {
                        id: m.id,
                        type: m.type,
                        label: m.label || `${m.type} measurement`,
                        value: Math.round(value * 100) / 100,
                        unit,
                      };
                    });
                  onAttachToBid(selected);
                  toast({
                    title: `${selected.length} measurement${selected.length === 1 ? '' : 's'} attached to bid`,
                    description: 'They will be sent with your bid submission.',
                  });
                }}
              >
                <Send className="w-4 h-4 mr-2" />
                Attach {pushSelection.size} to Bid
              </Button>
            </div>
          )}
        </div>
      </div>

      {scalePageOpen && (
        <ScalePageDialog
          open={scalePageOpen}
          pageCount={pageCount}
          currentPage={pageNumber}
          existingCalibrations={activeTakeoff?.calibrations}
          onClose={() => setScalePageOpen(false)}
          onApplyStandard={applyStandardScale}
          onApplyPerPage={(entries) => {
            if (!user || !activeTakeoff || entries.length === 0) return;
            const calibrations = { ...(activeTakeoff.calibrations || {}) };
            for (const e of entries) {
              calibrations[String(e.pageNumber)] = {
                pdfUnitsPerLinearUnit: e.pdfUnitsPerLinearUnit,
                unit: e.unit,
                anchorA: { x: 0, y: 0 },
                anchorB: { x: 0, y: 0 },
                realDistance: 0,
                calibratedAt: new Date().toISOString(),
                calibratedBy: user.id?.toString() || user.email || 'unknown',
              };
            }
            persistTakeoff({ calibrations });
            toast({
              title: `${entries.length} page${entries.length === 1 ? '' : 's'} scaled`,
              description: 'Per-page scales saved.',
            });
            setScalePageOpen(false);
          }}
          onSwitchToManual={() => {
            setScalePageOpen(false);
            setTool('calibrate');
          }}
        />
      )}

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

      <ColorPickerDialog
        open={colorPickerOpen}
        toolLabel={colorPickerTool === 'linear' ? 'Linear' : colorPickerTool === 'area' ? 'Area' : 'Count'}
        onCancel={() => { setColorPickerOpen(false); setColorPickerTool(null); }}
        onPick={confirmColorSelection}
      />

      {verifyResult && (
        <VerifyConfirmDialog
          open={!!verifyResult}
          measured={verifyResult.measured}
          unit={verifyResult.unit}
          onCancel={() => setVerifyResult(null)}
          onConfirm={() => {
            // Mark current page calibration verified.
            if (!currentCalibration) {
              setVerifyResult(null);
              return;
            }
            const updated = { ...currentCalibration, verified: true } as any;
            saveCalibration(updated);
            setVerifyResult(null);
            setTool('pan');
            toast({
              title: 'Scale verified',
              description: 'Measurement tools unlocked for this page.',
            });
          }}
          onRecalibrate={() => {
            // Use the two verify points as the basis for a manual calibration.
            const r = verifyResult;
            if (!r) return;
            setVerifyResult(null);
            setCalibrationDialog({ a: r.a, b: r.b });
          }}
        />
      )}
    </div>
  );
}

// ─── Verify confirmation dialog ──────────────────────────────────────────────
// After the user picks two points with the Verify tool, this prompts them to
// confirm the reading matches the labeled dimension on the plan. Confirm
// marks the page calibration `verified: true`; Recalibrate jumps to manual
// calibration using the two points they just picked.
function VerifyConfirmDialog({
  open, measured, unit, onCancel, onConfirm, onRecalibrate,
}: {
  open: boolean;
  measured: number;
  unit: LinearUnit;
  onCancel: () => void;
  onConfirm: () => void;
  onRecalibrate: () => void;
}) {
  const txt = formatLinear(measured, unit);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Does this match the plan?</DialogTitle>
          <DialogDescription>
            We measured the two points you picked. Compare against the labeled
            dimension on the plan to confirm the scale is right.
          </DialogDescription>
        </DialogHeader>
        <div className="text-center py-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Measured</p>
          <p className="text-3xl font-bold font-mono mt-1">{txt}</p>
        </div>
        <p className="text-xs text-gray-500">
          If this matches what the plan says, confirm to unlock measurement tools.
          If it's off, use these two points to recalibrate — we'll use the real
          distance you type in to set the right scale automatically.
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" onClick={onRecalibrate} className="sm:mr-auto">
            Off — recalibrate from these points
          </Button>
          <Button
            onClick={onConfirm}
            className="text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            Confirm — scale is correct
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Color picker dialog ─────────────────────────────────────────────────────
// Prompts the user to pick a color when entering a new measurement tool.
// Stays out of the way for consecutive measurements (no re-prompt while the
// same tool is active).
const COLOR_OPTIONS: { hex: string; name: string }[] = [
  { hex: '#ef4444', name: 'Red' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#eab308', name: 'Yellow' },
  { hex: '#22c55e', name: 'Green' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#0ea5e9', name: 'Sky' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#6366f1', name: 'Indigo' },
  { hex: '#a855f7', name: 'Purple' },
  { hex: '#ec4899', name: 'Pink' },
  { hex: '#0f172a', name: 'Black' },
  { hex: '#64748b', name: 'Slate' },
];

function ColorPickerDialog({
  open, toolLabel, onCancel, onPick,
}: {
  open: boolean;
  toolLabel: string;
  onCancel: () => void;
  onPick: (hex: string, label: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string | null>(null);
  // Reset on each open so a stale title from a previous session doesn't
  // bleed into the new tool.
  useEffect(() => {
    if (open) { setTitle(''); setColor(null); }
  }, [open]);
  const canSave = !!color;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New {toolLabel} measurement</DialogTitle>
          <DialogDescription>
            Name and color apply to every {toolLabel.toLowerCase()} measurement until you
            switch tools. Measurements auto-number ("Kitchen Flooring 1", "Kitchen Flooring 2"…).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <Input
              autoFocus
              placeholder={`e.g. Kitchen ${toolLabel}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
            <div className="grid grid-cols-6 gap-2">
              {COLOR_OPTIONS.map(c => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                  className={`w-10 h-10 rounded-md border-2 transition ${
                    color === c.hex ? 'border-gray-900 scale-105' : 'border-gray-200 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button
            disabled={!canSave}
            onClick={() => color && onPick(color, title)}
            className="text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            Start measuring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolButton({
  icon: Icon, label, active, onClick, accent, title,
}: { icon: any; label: string; active: boolean; onClick: () => void; accent?: boolean; title?: string }) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'ghost'}
      onClick={onClick}
      title={title}
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
