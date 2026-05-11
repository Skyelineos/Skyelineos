import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
// Use the LEGACY build — main 'pdfjs-dist' entry uses ES2024 Map methods
// (getOrInsertComputed) that older iPad Safari doesn't support. The legacy
// build is transpiled for those targets.
// @ts-ignore — no types on legacy subpath, types come from main entry below.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import type { PdfPoint } from './lib/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface PdfCanvasHandle {
  getViewport: () => PageViewport | null;
  cssToPdfPoint: (cssX: number, cssY: number) => PdfPoint | null;
  pdfToCssPoint: (pt: PdfPoint) => { x: number; y: number } | null;
  getCssSize: () => { width: number; height: number };
  /** Pan offset in CSS pixels — exposed so spacebar-pan in the parent can set it. */
  setPan: (tx: number, ty: number) => void;
  panBy: (dx: number, dy: number) => void;
  getPan: () => { tx: number; ty: number };
}

interface PdfCanvasProps {
  fileUrl: string;
  pageNumber: number;
  /** Display zoom multiplier. 1.0 = fit-to-width baseline. */
  zoom: number;
  onLoad?: (info: { pageCount: number }) => void;
  onPageReady?: (viewport: PageViewport, userUnit?: number) => void;
  /** Fired when zoom changes via wheel inside the canvas (so parent toolbar tracks it). */
  onZoomChange?: (zoom: number) => void;
  /**
   * Fired on every transform change (zoom or pan). Parent listens so the
   * SVG measurement overlay re-renders with up-to-date pdfToCss values.
   * `scale` here is css-px-per-pdf-pt (= baseScale × zoom).
   */
  onTransformChange?: (t: { scale: number; tx: number; ty: number }) => void;
  className?: string;
  /** Bump to force the canvas to re-measure its container — useful when
   *  the parent's layout changes (e.g. fullscreen toggle) and the
   *  ResizeObserver doesn't catch the new size on its own. */
  remeasureKey?: number | string;
  // Mouse callbacks — coords are PDF user space.
  onPointerDown?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void;
  /** SVG overlay etc. */
  children?: React.ReactNode;
  cursor?: string;
}

// Render the PDF page once at this multiple of fit-width. The image lives in
// an offscreen bitmap. All zoom in/out is then `ctx.setTransform()` on the
// SAME bitmap — instant, GPU-friendly, never stretches because we never
// resize the visible canvas during interaction. We re-render at higher
// resolution if the user zooms beyond the bitmap's native sharpness.
const BASE_RENDER_OVERSAMPLE = 3;

// iOS Safari blanks any canvas whose width OR height exceeds ~4096 px on
// older iPads (and area > 16M pixels on most). Cap the offscreen bitmap
// dimensions below that to keep rendering reliable when the user zooms in
// past 2× on a large architect plan. Slight blur at extreme zoom is
// preferable to a blank page.
const MAX_OFFSCREEN_DIM = 4096;

export const PdfCanvas = forwardRef<PdfCanvasHandle, PdfCanvasProps>(function PdfCanvas(
  { fileUrl, pageNumber, zoom, onLoad, onPageReady, onZoomChange, onTransformChange, onPointerDown, onPointerMove, onPointerUp, children, className, cursor, remeasureKey },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  /** Offscreen canvas holding the rasterized page. drawImage'd onto the visible canvas with setTransform. */
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  /** Scale at which the offscreen was rendered. baseScale * BASE_RENDER_OVERSAMPLE. */
  const renderedAtScaleRef = useRef<number>(0);
  /** Page number whose pixels are currently in the offscreen bitmap. */
  const renderedPageRef = useRef<number>(0);
  /** Natural-size viewport (scale=1) of the currently-rendered page — cached
   *  so we can decide whether a re-rasterize is needed without re-fetching
   *  the page (which triggers the loading overlay). */
  const pageNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  /** Fit-width scale: baseScale * 1 = canvas-px-per-PDF-pt at zoom=1. */
  const baseScaleRef = useRef<number>(1);
  /** Live transform — these drive the canvas redraw. tx/ty are CSS px offsets in the visible canvas. */
  const txRef = useRef<number>(0);
  const tyRef = useRef<number>(0);
  /** scale = baseScale × zoom. Drawn pixels per PDF point. */
  const scaleRef = useRef<number>(1);
  /** PageViewport at zoom=1 (kept for measurement helpers compatibility). */
  const viewportRef = useRef<PageViewport | null>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);
  /** Visible canvas size in CSS px (fixed; matches container). */
  const [viewSize, setViewSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  // Flips true once the PDF document is fully loaded into docRef. Used so the
  // rasterize effect re-runs after the async doc-load resolves (it would
  // otherwise see docRef.current === null on first run and bail forever).
  const [docReady, setDocReady] = useState(false);

  // ─── Document load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDocReady(false);

    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) { pdf.destroy(); return; }
        docRef.current = pdf;
        onLoad?.({ pageCount: pdf.numPages });
        setDocReady(true);
        forceTick(t => t + 1);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load PDF');
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
      if (pageRef.current) { pageRef.current.cleanup(); pageRef.current = null; }
      if (docRef.current) { docRef.current.destroy(); docRef.current = null; }
      // also clear rendered offscreen so a new fileUrl always re-rasterizes
      offscreenRef.current = null;
      renderedAtScaleRef.current = 0;
      renderedPageRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // ─── Track container size ───────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      setViewSize(prev => (prev.w === w && prev.h === h) ? prev : { w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Forced remeasure trigger — parent bumps remeasureKey when its layout
  // changes in a way ResizeObserver might miss (e.g. fullscreen toggle).
  // We re-measure after a couple frames so the browser has finished
  // laying out the new geometry.
  useEffect(() => {
    if (remeasureKey === undefined) return;
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      setViewSize(prev => (prev.w === w && prev.h === h) ? prev : { w, h });
    };
    const id1 = requestAnimationFrame(() => {
      measure();
      const id2 = requestAnimationFrame(measure);
      (id1 as any).next = id2;
    });
    const tid = setTimeout(measure, 200);
    return () => {
      cancelAnimationFrame(id1);
      clearTimeout(tid);
    };
  }, [remeasureKey]);

  // ─── Render the PDF page into the offscreen bitmap ──────────────────────────
  // Called whenever pageNumber changes, or when zoom climbs past the rendered
  // bitmap's resolution (so we re-render sharper).
  const rasterizePage = useCallback(async (atScale: number) => {
    const pdf = docRef.current;
    if (!pdf) return;
    if (pageNumber < 1 || pageNumber > pdf.numPages) return;

    // Early bail — if we already have the same page rendered at (or above)
    // the scale the canvas cap would allow, redraw and return without
    // showing the loading overlay. Avoids a flicker when toolbar buttons
    // / pinch ticks keep nudging zoom past the rasterizer cap.
    if (
      renderedPageRef.current === pageNumber &&
      offscreenRef.current &&
      pageNaturalSizeRef.current
    ) {
      const dprNow = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = pageNaturalSizeRef.current;
      const maxScale = Math.min(
        MAX_OFFSCREEN_DIM / (width * dprNow),
        MAX_OFFSCREEN_DIM / (height * dprNow),
      );
      const eff = Math.min(atScale, maxScale);
      if (renderedAtScaleRef.current >= eff * 0.95) {
        drawCanvas();
        return;
      }
    }

    setLoading(true);
    try {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} renderTaskRef.current = null; }

      const page = await pdf.getPage(pageNumber);
      pageRef.current = page;

      // Clamp the actual render scale so the resulting bitmap stays below
      // iOS Safari's canvas size cap. We compute the unclamped viewport
      // first to know the natural page dimensions, then derive how much we
      // can multiply that by without crossing MAX_OFFSCREEN_DIM in either
      // axis (after dpr).
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      const natural = page.getViewport({ scale: 1 });
      const maxScaleByWidth = MAX_OFFSCREEN_DIM / (natural.width * dpr);
      const maxScaleByHeight = MAX_OFFSCREEN_DIM / (natural.height * dpr);
      const maxScale = Math.min(maxScaleByWidth, maxScaleByHeight);
      const effectiveScale = Math.min(atScale, maxScale);

      // Cache the natural-size dimensions so the next rasterizePage call
      // can do its cap calc without re-fetching the page (which would
      // flash the loading overlay).
      pageNaturalSizeRef.current = { width: natural.width, height: natural.height };

      const renderViewport = page.getViewport({ scale: effectiveScale });
      viewportRef.current = page.getViewport({ scale: 1 }); // for measurement helpers

      const off = document.createElement('canvas');
      off.width = Math.floor(renderViewport.width * dpr);
      off.height = Math.floor(renderViewport.height * dpr);
      const ctx = off.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, off.width, off.height);

      const renderTask = page.render({
        canvasContext: ctx as any,
        viewport: renderViewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      } as any);
      renderTaskRef.current = renderTask;
      await renderTask.promise;

      offscreenRef.current = off;
      renderedAtScaleRef.current = effectiveScale;
      renderedPageRef.current = pageNumber;
      // PDF.js exposes the user-unit factor on the page; default 1.0 means
      // 1 PDF unit = 1/72 inch. Some architect exports use 2.0 or 0.5 which
      // would otherwise throw standard-scale math off by that factor.
      onPageReady?.(viewportRef.current, (page as any).userUnit ?? 1);
      drawCanvas(); // paint into visible canvas
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        setError(e?.message || 'Failed to render page');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // ─── Compute base scale (fit-to-screen) and center the page ─────────────────
  // True fit-to-screen: pick the smaller of fit-width vs fit-height so the
  // entire page is visible inside the viewer on first load.
  useEffect(() => {
    const pdf = docRef.current;
    if (!pdf || !viewSize.w || !viewSize.h) return;
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const naturalVp = page.getViewport({ scale: 1 });
      const fitW = viewSize.w / naturalVp.width;
      const fitH = viewSize.h / naturalVp.height;
      const fitToScreen = Math.min(fitW, fitH) * 0.96; // small margin
      const newBase = Math.max(0.05, fitToScreen);
      // Only update if it changed materially OR page changed (always re-fit on page).
      const isPageChange = baseScaleRef.current === 0 || Math.abs(newBase - baseScaleRef.current) > 0.001;
      if (isPageChange) {
        baseScaleRef.current = newBase;
        scaleRef.current = newBase * zoom;
        // Center the page in the viewer.
        const displayedW = naturalVp.width * scaleRef.current;
        const displayedH = naturalVp.height * scaleRef.current;
        txRef.current = Math.max(0, (viewSize.w - displayedW) / 2);
        tyRef.current = Math.max(0, (viewSize.h - displayedH) / 2);
      } else {
        scaleRef.current = baseScaleRef.current * zoom;
      }
      // Render the page at sufficient resolution to stay crisp at the highest
      // likely zoom. Re-rasterize when:
      //   - the offscreen holds a different page than what we want to show
      //   - zoom climbs past the current resolution
      //   - first load
      const targetRenderScale = baseScaleRef.current * Math.max(zoom, 1) * BASE_RENDER_OVERSAMPLE;
      const pageChanged = renderedPageRef.current !== pageNumber;
      if (pageChanged || targetRenderScale > renderedAtScaleRef.current * 1.2 || !offscreenRef.current) {
        await rasterizePage(targetRenderScale);
      } else {
        drawCanvas();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSize.w, viewSize.h, pageNumber, fileUrl, docReady]);

  // ─── External zoom prop changes (toolbar buttons / direct setZoom) ──────────
  // Center the zoom on the current viewport center for a clean experience.
  useEffect(() => {
    if (!offscreenRef.current) return;
    const oldScale = scaleRef.current;
    const newScale = baseScaleRef.current * zoom;
    if (Math.abs(newScale - oldScale) < 0.0001) return;
    const cx = viewSize.w / 2;
    const cy = viewSize.h / 2;
    const ratio = newScale / oldScale;
    txRef.current = cx - (cx - txRef.current) * ratio;
    tyRef.current = cy - (cy - tyRef.current) * ratio;
    scaleRef.current = newScale;
    // Re-rasterize if user zoomed past current resolution
    const need = baseScaleRef.current * zoom * BASE_RENDER_OVERSAMPLE;
    if (need > renderedAtScaleRef.current * 1.2) {
      rasterizePage(need);
    } else {
      drawCanvas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, viewSize.w, viewSize.h]);

  // ─── Draw current state into visible canvas ─────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const off = offscreenRef.current;
    if (!canvas) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    // Keep the visible canvas backing store at viewSize × dpr; only update if changed.
    const targetW = Math.floor(viewSize.w * dpr);
    const targetH = Math.floor(viewSize.h * dpr);
    if (canvas.width !== targetW) canvas.width = targetW;
    if (canvas.height !== targetH) canvas.height = targetH;
    canvas.style.width = `${viewSize.w}px`;
    canvas.style.height = `${viewSize.h}px`;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Clear (in CSS-px space).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#e5e7eb'; // gray-200 — matches the surrounding bg
    ctx.fillRect(0, 0, viewSize.w, viewSize.h);

    if (!off) return;

    // The offscreen image is at renderedAtScaleRef.current PDF-points-per-pixel.
    // We want to display PDF coords transformed by scaleRef + tx/ty.
    // drawImage takes the offscreen at its natural pixel resolution; canvas
    // scale converts those pixels to display.
    const imgScale = scaleRef.current / renderedAtScaleRef.current;
    ctx.setTransform(dpr * imgScale, 0, 0, dpr * imgScale, dpr * txRef.current, dpr * tyRef.current);
    ctx.drawImage(off, 0, 0);
    // Reset for cleanliness.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    forceTick(t => t + 1); // bump children that depend on transform
    // Tell the parent so React state stays in sync — measurements overlay
    // re-renders on every pan/zoom and stays glued to the plan.
    onTransformChange?.({ scale: scaleRef.current, tx: txRef.current, ty: tyRef.current });
  }, [viewSize.w, viewSize.h, onTransformChange]);

  // ─── Wheel: Tyler's exact zoom-anchored-to-cursor formula ───────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;

      txRef.current = mouseX - (mouseX - txRef.current) * zoomFactor;
      tyRef.current = mouseY - (mouseY - tyRef.current) * zoomFactor;
      scaleRef.current *= zoomFactor;
      // Clamp
      const min = baseScaleRef.current * 0.25;
      const max = baseScaleRef.current * 8;
      if (scaleRef.current < min) scaleRef.current = min;
      if (scaleRef.current > max) scaleRef.current = max;

      drawCanvas();
      onZoomChange?.(scaleRef.current / baseScaleRef.current);
      // Re-rasterize at higher res if needed
      const need = scaleRef.current * BASE_RENDER_OVERSAMPLE;
      if (need > renderedAtScaleRef.current * 1.2) {
        rasterizePage(need);
      }
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawCanvas]);

  // ─── Pinch-zoom (iPad / touch) ──────────────────────────────────────────────
  // Two-finger touch on the canvas zooms anchored on the midpoint between
  // fingers — same UX as Photos / Maps / Adobe Acrobat. Single-touch falls
  // through to the React pointer handlers used for measurements/panning.
  // While pinching, we set pinchingRef so the pointer-handler wrap below
  // ignores the secondary pointer (otherwise 2-finger pinch double-fires the
  // measurement-click callback and drops stray points).
  const pinchingRef = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Live midpoint between the two fingers in canvas-relative CSS px.
    // Updated on every touchmove and used by BOTH the cross-platform touch
    // handler and the iOS gesture handler so zoom always anchors on the
    // current location of the user's fingers (not where they started).
    let midX = 0;
    let midY = 0;
    let prevDist = 0;
    let pinchActive = false;

    const dist = (a: Touch, b: Touch) => {
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const captureMidAndDist = (e: TouchEvent): number => {
      if (e.touches.length < 2) return 0;
      const rect = canvas.getBoundingClientRect();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      midX = (t1.clientX + t2.clientX) / 2 - rect.left;
      midY = (t1.clientY + t2.clientY) / 2 - rect.top;
      return dist(t1, t2);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchingRef.current = true;
        pinchActive = true;
        prevDist = captureMidAndDist(e);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchActive) {
        e.preventDefault();
        const cur = captureMidAndDist(e);
        if (prevDist <= 0) { prevDist = cur; return; }
        // Incremental tick — anchor on the LIVE midpoint, so zoom follows
        // the fingers as they move. 20% dampening (half the previous 40%)
        // keeps the motion calm and matches the gesture-handler factor.
        const tick = cur / prevDist;
        prevDist = cur;
        const damped = 1 + (tick - 1) * 0.2;
        const min = baseScaleRef.current * 0.25;
        const max = baseScaleRef.current * 8;
        let newScale = scaleRef.current * damped;
        if (newScale < min) newScale = min;
        if (newScale > max) newScale = max;
        const actual = newScale / scaleRef.current;
        txRef.current = midX - (midX - txRef.current) * actual;
        tyRef.current = midY - (midY - tyRef.current) * actual;
        scaleRef.current = newScale;
        drawCanvas();
        onZoomChange?.(scaleRef.current / baseScaleRef.current);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        if (pinchActive) {
          const need = scaleRef.current * BASE_RENDER_OVERSAMPLE;
          if (need > renderedAtScaleRef.current * 1.2) {
            rasterizePage(need);
          }
        }
        pinchActive = false;
        prevDist = 0;
        // Clear pinch flag after a tick so the trailing pointer-up doesn't
        // immediately fire a stray measurement click.
        setTimeout(() => { pinchingRef.current = false; }, 50);
      }
    };

    // ─── iOS Safari gesture handlers ──────────────────────────────────────
    // Required so Safari doesn't hijack touch events mid-pinch. Uses the
    // live midpoint from touchmove (captured above) so the anchor follows
    // the fingers — iOS gesture events don't reliably carry midpoint
    // coordinates across versions, but touch events always do.
    let gActive = false;
    let lastE = 1;
    // GestureEvent on iOS Safari exposes clientX/clientY as the midpoint
    // between the two fingers in viewport space. We prefer those over the
    // touch-event-derived midpoint because Safari can drop touchmove
    // events while a gesture is active, which would freeze our cached
    // midpoint at its initial (often 0,0) value and yank the zoom anchor
    // to the canvas top-left corner.
    const updateMidFromGesture = (e: any) => {
      const r = canvas.getBoundingClientRect();
      if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        midX = e.clientX - r.left;
        midY = e.clientY - r.top;
      }
    };
    const onGestureStart = (e: any) => {
      e.preventDefault();
      gActive = true;
      pinchingRef.current = true;
      lastE = e.scale || 1;
      updateMidFromGesture(e);
    };
    const onGestureChange = (e: any) => {
      e.preventDefault();
      updateMidFromGesture(e);
      const cur = e.scale || 1;
      const tick = cur / (lastE || 1);
      lastE = cur;
      // 20% dampening — half the previous sensitivity per Tyler's request.
      const damped = 1 + (tick - 1) * 0.2;
      const min = baseScaleRef.current * 0.25;
      const max = baseScaleRef.current * 8;
      let newScale = scaleRef.current * damped;
      if (newScale < min) newScale = min;
      if (newScale > max) newScale = max;
      const actual = newScale / scaleRef.current;
      txRef.current = midX - (midX - txRef.current) * actual;
      tyRef.current = midY - (midY - tyRef.current) * actual;
      scaleRef.current = newScale;
      drawCanvas();
      onZoomChange?.(scaleRef.current / baseScaleRef.current);
    };
    const onGestureEnd = (e: any) => {
      e.preventDefault();
      gActive = false;
      const need = scaleRef.current * BASE_RENDER_OVERSAMPLE;
      if (need > renderedAtScaleRef.current * 1.2) rasterizePage(need);
      setTimeout(() => { pinchingRef.current = false; }, 50);
    };

    // Always update the midpoint from touch events so the gesture handler
    // has a fresh anchor; only run touch-zoom math when the iOS gesture
    // handler ISN'T already driving the zoom (avoids double-applying).
    const wrappedTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length >= 2) captureMidAndDist(ev);
      if (gActive) { ev.preventDefault(); return; }
      onTouchStart(ev);
    };
    const wrappedTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length >= 2) captureMidAndDist(ev);
      if (gActive) { ev.preventDefault(); return; }
      onTouchMove(ev);
    };

    canvas.addEventListener('touchstart', wrappedTouchStart, { passive: false });
    canvas.addEventListener('touchmove', wrappedTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
    canvas.addEventListener('gesturestart', onGestureStart as any, { passive: false });
    canvas.addEventListener('gesturechange', onGestureChange as any, { passive: false });
    canvas.addEventListener('gestureend', onGestureEnd as any, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', wrappedTouchStart);
      canvas.removeEventListener('touchmove', wrappedTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
      canvas.removeEventListener('touchcancel', onTouchEnd);
      canvas.removeEventListener('gesturestart', onGestureStart as any);
      canvas.removeEventListener('gesturechange', onGestureChange as any);
      canvas.removeEventListener('gestureend', onGestureEnd as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawCanvas]);

  // ─── Coordinate conversion (current transform) ──────────────────────────────
  // mouseX_visible = scale * pdfX + tx  →  pdfX = (mouseX_visible - tx) / scale
  // For PDF user-space (points): rendered offscreen at renderedAtScaleRef pts→px,
  // displayed via canvas-space scale: scaleRef.current px-per-pt.
  // So pdf_pt = (mouseX_visible - tx) / scaleRef.current.
  const cssToPdfPoint = useCallback((cssX: number, cssY: number): PdfPoint | null => {
    if (!scaleRef.current) return null;
    return {
      x: (cssX - txRef.current) / scaleRef.current,
      y: (cssY - tyRef.current) / scaleRef.current,
    };
  }, []);

  const pdfToCssPoint = useCallback((pt: PdfPoint): { x: number; y: number } | null => {
    if (!scaleRef.current) return null;
    return {
      x: pt.x * scaleRef.current + txRef.current,
      y: pt.y * scaleRef.current + tyRef.current,
    };
  }, []);

  const getCssSize = useCallback(() => ({ width: viewSize.w, height: viewSize.h }), [viewSize.w, viewSize.h]);

  // ─── Imperative handle ──────────────────────────────────────────────────────
  // Throttle pan redraws to one per animation frame. Without this, an iPad Pro
  // pointermove can fire 120Hz and overwhelm React + drawImage, which on iPad
  // Safari has been observed to drop the tab.
  const pendingPanRaf = useRef<number | null>(null);
  const requestDraw = useCallback(() => {
    if (pendingPanRaf.current != null) return;
    pendingPanRaf.current = requestAnimationFrame(() => {
      pendingPanRaf.current = null;
      try {
        drawCanvas();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[PdfCanvas] drawCanvas failed', e);
      }
    });
  }, [drawCanvas]);

  useImperativeHandle(ref, () => ({
    getViewport: () => viewportRef.current,
    cssToPdfPoint,
    pdfToCssPoint,
    getCssSize,
    setPan: (tx, ty) => { txRef.current = tx; tyRef.current = ty; requestDraw(); },
    panBy: (dx, dy) => {
      // Guard against NaN/Infinity which would corrupt the transform matrix
      // and crash drawImage downstream.
      const ndx = Number.isFinite(dx) ? dx : 0;
      const ndy = Number.isFinite(dy) ? dy : 0;
      txRef.current += ndx;
      tyRef.current += ndy;
      requestDraw();
    },
    getPan: () => ({ tx: txRef.current, ty: tyRef.current }),
  }), [cssToPdfPoint, pdfToCssPoint, getCssSize, drawCanvas, requestDraw]);

  // ─── Pointer wrap (mouse coords → PDF user space) ──────────────────────────
  // Skip non-primary pointers and pointers fired during a pinch — otherwise
  // two-finger zoom on iPad would drop unwanted measurement points.
  const handlerWrap = (cb?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void) =>
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!cb) return;
      if (pinchingRef.current) return;
      if (e.pointerType === 'touch' && e.isPrimary === false) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const pt = cssToPdfPoint(cssX, cssY);
      if (pt) cb(pt, e);
    };

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {error && (
        <div className="p-8 text-center text-red-600 bg-red-50 rounded">
          Failed to load PDF: {error}
        </div>
      )}
      {!error && (
        <div
          style={{
            position: 'relative',
            width: viewSize.w,
            height: viewSize.h,
            cursor: cursor || 'default',
            touchAction: 'none',
            overflow: 'hidden',
          }}
          onPointerDown={handlerWrap(onPointerDown)}
          onPointerMove={handlerWrap(onPointerMove)}
          onPointerUp={handlerWrap(onPointerUp)}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}
          />
          {/* Overlay children (SVG measurement layer). They use pdfToCss which
              accounts for the live transform — so they track zoom/pan. */}
          {children}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
              <div className="bg-white px-4 py-2 rounded shadow text-sm">Loading…</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
