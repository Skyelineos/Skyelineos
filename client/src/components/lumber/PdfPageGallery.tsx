import { useEffect, useRef, useState } from 'react';
// @ts-ignore — legacy build is transpiled so older iPad Safari can run pdfjs.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader2, Maximize2, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface Assignment {
  floorLabel: string;
  role: 'plan' | 'framing';
}

interface Props {
  fileUrl: string;
  pageCount: number;
  /** Map of pageNumber → list of floor/role assignments for that page. */
  assignments: Record<number, Assignment[]>;
}

interface Thumb {
  pageNumber: number;
  dataUrl: string;
  largeUrl?: string;
}

const THUMB_WIDTH = 220;       // px — bigger than the takeoff studio strip (130) so labels are readable
const LARGE_WIDTH  = 1400;     // px — for the click-to-zoom preview

const GOLD = '#C9A96E';

export function PdfPageGallery({ fileUrl, pageCount, assignments }: Props) {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedPage, setZoomedPage] = useState<number | null>(null);
  const cancelledRef = useRef(false);
  const docRef = useRef<PDFDocumentProxy | null>(null);

  useEffect(() => {
    cancelledRef.current = false;
    setThumbs([]);
    setLoading(true);

    (async () => {
      try {
        const task = pdfjsLib.getDocument({ url: fileUrl });
        const pdf = await task.promise;
        docRef.current = pdf;
        if (cancelledRef.current) { pdf.destroy(); return; }

        const total = Math.min(pdf.numPages, pageCount);
        for (let p = 1; p <= total; p++) {
          if (cancelledRef.current) return;
          const page = await pdf.getPage(p);
          const natural = page.getViewport({ scale: 1 });
          const scale = THUMB_WIDTH / natural.width;
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
          const dataUrl = c.toDataURL('image/jpeg', 0.7);
          setThumbs(prev => [...prev, { pageNumber: p, dataUrl }]);
          page.cleanup();
        }
        setLoading(false);
      } catch {
        if (!cancelledRef.current) setLoading(false);
      }
    })();

    return () => {
      cancelledRef.current = true;
      try { docRef.current?.destroy(); } catch { /* */ }
    };
  }, [fileUrl, pageCount]);

  // Lazy-render large image on zoom-click
  const ensureLarge = async (pageNumber: number) => {
    const existing = thumbs.find(t => t.pageNumber === pageNumber);
    if (!existing || existing.largeUrl || !docRef.current) return;
    try {
      const page = await docRef.current.getPage(pageNumber);
      const natural = page.getViewport({ scale: 1 });
      const scale = LARGE_WIDTH / natural.width;
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx as any, viewport: vp } as any).promise;
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      setThumbs(prev => prev.map(t => t.pageNumber === pageNumber ? { ...t, largeUrl: dataUrl } : t));
      page.cleanup();
    } catch { /* */ }
  };

  return (
    <>
      <div className="bg-gray-50 border rounded-lg p-3" style={{ borderColor: '#E5E7EB' }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B7280' }}>Plan pages</h3>
            <p className="text-xs text-gray-500">Click any page to view it larger. Use the page dropdowns below to assign each one to a floor.</p>
          </div>
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Rendering thumbnails…
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map(p => {
            const t = thumbs.find(x => x.pageNumber === p);
            const tags = assignments[p] ?? [];
            return (
              <button
                key={p}
                onClick={() => { setZoomedPage(p); ensureLarge(p); }}
                className="group relative bg-white rounded-md border-2 overflow-hidden text-left transition-colors hover:shadow-md"
                style={{ borderColor: tags.length > 0 ? GOLD : '#E5E7EB' }}
                title={`Page ${p}`}
              >
                <div className="aspect-[8.5/11] flex items-center justify-center bg-white">
                  {t ? (
                    <img src={t.dataUrl} alt={`Page ${p}`} className="w-full h-full object-contain" loading="lazy" />
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                  )}
                </div>
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[10px] font-mono font-medium bg-black/75 text-white px-1.5 py-0.5 rounded">
                    Page {p}
                  </span>
                </div>
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="bg-white/95 rounded p-1 shadow-sm">
                    <Maximize2 className="w-3 h-3 text-gray-600" />
                  </span>
                </div>
                {tags.length > 0 && (
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 flex flex-wrap gap-1">
                    {tags.map((tag, idx) => (
                      <Badge
                        key={idx}
                        className="text-[9px] font-medium px-1.5 py-0 truncate"
                        style={{
                          backgroundColor: tag.role === 'plan' ? 'rgba(37,99,235,0.92)' : 'rgba(220,38,38,0.92)',
                          color: 'white',
                        }}
                      >
                        {tag.floorLabel} · {tag.role === 'plan' ? 'plan' : 'framing'}
                      </Badge>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zoom preview dialog */}
      <Dialog open={zoomedPage !== null} onOpenChange={o => { if (!o) setZoomedPage(null); }}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          {zoomedPage !== null && (() => {
            const t = thumbs.find(x => x.pageNumber === zoomedPage);
            const src = t?.largeUrl ?? t?.dataUrl;
            return (
              <div className="relative bg-gray-100">
                <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                  <span className="text-xs font-mono bg-black/75 text-white px-2 py-1 rounded">Page {zoomedPage}</span>
                  <button
                    onClick={() => setZoomedPage(null)}
                    className="bg-white/95 rounded p-1.5 shadow hover:bg-white"
                  >
                    <X className="w-4 h-4 text-gray-700" />
                  </button>
                </div>
                <div className="max-h-[80vh] overflow-auto flex items-center justify-center p-4">
                  {src ? (
                    <img src={src} alt={`Page ${zoomedPage}`} className="max-w-full h-auto" />
                  ) : (
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
