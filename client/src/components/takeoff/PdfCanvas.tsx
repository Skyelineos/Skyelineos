import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist';
import type { PdfPoint } from './lib/types';

// Set worker path. Vite serves node_modules via /node_modules/... at dev; for prod we use a public asset.
// Using import.meta.url + new URL keeps it bundler-friendly.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface PdfCanvasHandle {
  getViewport: () => PageViewport | null;
  // Convert a CSS-pixel mouse position (relative to the canvas) to PDF user space.
  cssToPdfPoint: (cssX: number, cssY: number) => PdfPoint | null;
  // Convert a PDF user-space point to CSS pixel position relative to the canvas (for SVG overlay).
  pdfToCssPoint: (pt: PdfPoint) => { x: number; y: number } | null;
  // Current canvas size in CSS pixels.
  getCssSize: () => { width: number; height: number };
}

interface PdfCanvasProps {
  fileUrl: string;
  pageNumber: number;
  zoom: number; // 1.0 = fit-width baseline
  onLoad?: (info: { pageCount: number }) => void;
  onPageReady?: (viewport: PageViewport) => void;
  className?: string;
  // Mouse callbacks — coords are PDF user space.
  onPointerDown?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void;
  // Children render on top of the canvas (e.g. the SVG overlay). They receive the viewport via context — we pass directly here for simplicity.
  children?: React.ReactNode;
  cursor?: string;
}

export const PdfCanvas = forwardRef<PdfCanvasHandle, PdfCanvasProps>(function PdfCanvas(
  { fileUrl, pageNumber, zoom, onLoad, onPageReady, onPointerDown, onPointerMove, onPointerUp, children, className, cursor },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const viewportRef = useRef<PageViewport | null>(null);
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  // Load the document when fileUrl changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        docRef.current = pdf;
        onLoad?.({ pageCount: pdf.numPages });
        forceTick(t => t + 1);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load PDF');
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
      }
      if (pageRef.current) {
        pageRef.current.cleanup();
        pageRef.current = null;
      }
      if (docRef.current) {
        docRef.current.destroy();
        docRef.current = null;
      }
    };
    // We intentionally exclude onLoad from deps — it can be inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // Render the requested page at the requested zoom whenever inputs change.
  const renderPage = useCallback(async () => {
    const pdf = docRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!pdf || !canvas || !container) return;
    if (pageNumber < 1 || pageNumber > pdf.numPages) return;

    setLoading(true);
    try {
      // Cancel any in-flight render before starting a new one.
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }

      const page = await pdf.getPage(pageNumber);
      pageRef.current = page;

      // Compute fit-width base scale so zoom=1 fills the container width.
      const baseViewport = page.getViewport({ scale: 1 });
      const containerWidth = container.clientWidth || 800;
      const fitWidthScale = containerWidth / baseViewport.width;
      const finalScale = fitWidthScale * zoom;

      const viewport = page.getViewport({ scale: finalScale });
      viewportRef.current = viewport;

      // Set CSS size (logical) and backing store size (physical).
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;

      // Scale the drawing context so PDF.js renders at logical CSS coordinates.
      const renderTask = page.render({
        canvasContext: ctx as any,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      } as any);
      renderTaskRef.current = renderTask;
      await renderTask.promise;

      onPageReady?.(viewport);
      forceTick(t => t + 1);
    } catch (e: any) {
      // RenderingCancelledException is thrown by pdf.js when we cancel — ignore.
      if (e?.name !== 'RenderingCancelledException') {
        setError(e?.message || 'Failed to render page');
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, zoom]);

  // Re-render when doc loaded / page / zoom change.
  useEffect(() => {
    if (!docRef.current) return;
    renderPage();
  }, [renderPage, docRef.current?.numPages]);

  // Re-render on container resize so fit-width adapts.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let lastWidth = container.clientWidth;
    const ro = new ResizeObserver(() => {
      if (container.clientWidth !== lastWidth) {
        lastWidth = container.clientWidth;
        renderPage();
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [renderPage]);

  // ─── Coordinate conversion ──────────────────────────────────────────────────
  const cssToPdfPoint = useCallback((cssX: number, cssY: number): PdfPoint | null => {
    const vp = viewportRef.current;
    if (!vp) return null;
    const [x, y] = vp.convertToPdfPoint(cssX, cssY);
    return { x, y };
  }, []);

  const pdfToCssPoint = useCallback((pt: PdfPoint): { x: number; y: number } | null => {
    const vp = viewportRef.current;
    if (!vp) return null;
    const [x, y] = vp.convertToViewportPoint(pt.x, pt.y);
    return { x, y };
  }, []);

  const getCssSize = useCallback(() => {
    const vp = viewportRef.current;
    return vp ? { width: vp.width, height: vp.height } : { width: 0, height: 0 };
  }, []);

  useImperativeHandle(ref, () => ({
    getViewport: () => viewportRef.current,
    cssToPdfPoint,
    pdfToCssPoint,
    getCssSize,
  }), [cssToPdfPoint, pdfToCssPoint, getCssSize]);

  // ─── Mouse handling ────────────────────────────────────────────────────────
  const handlerWrap = (cb?: (pt: PdfPoint, e: React.PointerEvent<HTMLDivElement>) => void) =>
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!cb) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const pt = cssToPdfPoint(cssX, cssY);
      if (pt) cb(pt, e);
    };

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative', width: '100%' }}>
      {error && (
        <div className="p-8 text-center text-red-600 bg-red-50 rounded">
          Failed to load PDF: {error}
        </div>
      )}
      {!error && (
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            cursor: cursor || 'default',
            touchAction: 'none',
          }}
          onPointerDown={handlerWrap(onPointerDown)}
          onPointerMove={handlerWrap(onPointerMove)}
          onPointerUp={handlerWrap(onPointerUp)}
        >
          <canvas ref={canvasRef} style={{ display: 'block' }} />
          {/* Overlay children (SVG measurement layer) */}
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
