import { useEffect, useRef, useState } from 'react';
// @ts-ignore — legacy build is transpiled so older iPad Safari can run pdfjs.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2, ChevronUp, ChevronDown } from 'lucide-react';

// Worker is configured in PdfCanvas.tsx; importing pdfjsLib here picks up the
// same workerSrc since it's a singleton.

interface Props {
  fileUrl: string;
  currentPage: number;
  onSelectPage: (page: number) => void;
}

interface ThumbItem {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
}

const THUMB_WIDTH = 130; // px

/** Vertical thumbnail strip — click any page to jump to it in the viewer. */
export function PageThumbnails({ fileUrl, currentPage, onSelectPage }: Props) {
  const [thumbs, setThumbs] = useState<ThumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll the active thumb into view when the viewer changes pages.
  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentPage]);

  // Direct scrollTop assignment — most reliable cross-browser, especially on
  // iPad Safari where scroll-animation APIs are flaky with momentum scrolling.
  const scrollByAmount = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = dir * Math.max(160, el.clientHeight * 0.7);
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + amount));
  };

  useEffect(() => {
    cancelledRef.current = false;
    setThumbs([]);
    setLoading(true);

    let pdf: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const task = pdfjsLib.getDocument({ url: fileUrl });
        pdf = await task.promise;
        if (cancelledRef.current) { pdf?.destroy(); return; }

        const total = pdf.numPages;
        for (let p = 1; p <= total; p++) {
          if (cancelledRef.current) return;
          const page = await pdf.getPage(p);
          const naturalVp = page.getViewport({ scale: 1 });
          const scale = THUMB_WIDTH / naturalVp.width;
          const vp = page.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = Math.floor(vp.width);
          c.height = Math.floor(vp.height);
          const ctx = c.getContext('2d', { alpha: false });
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx as any, viewport: vp } as any).promise;
          if (cancelledRef.current) return;
          const dataUrl = c.toDataURL('image/jpeg', 0.6);
          setThumbs(prev => [...prev, {
            pageNumber: p,
            dataUrl,
            width: c.width,
            height: c.height,
          }]);
          page.cleanup();
        }
        setLoading(false);
      } catch {
        if (!cancelledRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
      if (pdf) try { pdf.destroy(); } catch {}
    };
  }, [fileUrl]);

  return (
    <div className="w-[160px] flex-shrink-0 border-r bg-gray-100 flex flex-col min-h-0">
      <div className="px-2 py-2 text-[11px] uppercase tracking-wide font-semibold text-gray-500 border-b bg-white flex items-center gap-1.5">
        Pages
        {loading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
        <span className="ml-auto text-gray-400 normal-case font-normal">{thumbs.length}</span>
      </div>

      {/* Up arrow */}
      <button
        type="button"
        onClick={() => scrollByAmount(-1)}
        className="flex items-center justify-center py-1.5 border-b bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition-colors"
        title="Scroll up"
      >
        <ChevronUp className="w-4 h-4" />
      </button>

      {/* Scrollable thumb list. iOS Safari needs explicit touch-action,
          -webkit-overflow-scrolling and a non-zero min-height to do inertial
          scroll inside a flex column. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-2"
        style={{
          touchAction: 'pan-y',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          minHeight: 0,
        }}
      >
        {thumbs.map(t => {
          const active = t.pageNumber === currentPage;
          return (
            <button
              key={t.pageNumber}
              ref={active ? activeThumbRef : undefined}
              onClick={() => onSelectPage(t.pageNumber)}
              className={`relative block w-full rounded border-2 transition-colors overflow-hidden bg-white ${
                active ? 'border-[#C9A96E] shadow-sm' : 'border-gray-200 hover:border-gray-400'
              }`}
              title={`Page ${t.pageNumber}`}
            >
              <img
                src={t.dataUrl}
                alt={`Page ${t.pageNumber}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
              <span className={`absolute bottom-1 right-1 text-[10px] tabular-nums px-1 rounded ${
                active ? 'bg-[#C9A96E] text-black font-bold' : 'bg-black/60 text-white'
              }`}>
                {t.pageNumber}
              </span>
            </button>
          );
        })}
        {!loading && thumbs.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No pages</p>
        )}
      </div>

      {/* Down arrow */}
      <button
        type="button"
        onClick={() => scrollByAmount(1)}
        className="flex items-center justify-center py-1.5 border-t bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-800 transition-colors"
        title="Scroll down"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}
