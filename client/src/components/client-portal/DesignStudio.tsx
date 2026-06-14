import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query as fsQuery } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { InspirationBoard } from '@/components/client-portal/InspirationBoard';
import {
  Image as ImageIcon, Layers, CheckCircle2, ChevronRight, Sparkles, Lock,
} from 'lucide-react';
import type { Selection } from '@/types/selections';

interface DesignStudioProps {
  projectId: string;
  clientContactId: string;
  clientName?: string;
  onNavigate: (tab: string) => void;
}

interface GalleryImage {
  url: string;
  label: string;     // room · area
  sub: string;       // category
  kind: 'Rendering' | 'Design Board' | 'Option' | 'Layout';
  approved: boolean;
}

const KIND_COLORS: Record<GalleryImage['kind'], string> = {
  'Rendering':    'bg-purple-100 text-purple-700',
  'Design Board': 'bg-blue-100 text-blue-700',
  'Option':       'bg-amber-100 text-amber-700',
  'Layout':       'bg-teal-100 text-teal-700',
};

export default function DesignStudio({ projectId, clientContactId, clientName, onNavigate }: DesignStudioProps) {
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<GalleryImage | null>(null);
  const [roomFilter, setRoomFilter] = useState<string>('All');

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      fsQuery(collection(db, 'projects', projectId, 'selections'), orderBy('createdAt', 'asc')),
      snap => {
        setSelections(snap.docs.map(d => ({ id: d.id, ...d.data() } as Selection)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [projectId]);

  // ── Aggregate every piece of design imagery into one gallery ───────────────
  const gallery = useMemo<GalleryImage[]>(() => {
    const out: GalleryImage[] = [];
    for (const sel of selections) {
      const label = [sel.room, sel.area].filter(Boolean).join(' · ') || sel.category || 'Selection';
      const approved = sel.clientApprovalStatus === 'Approved';
      // Designer renderings / boards / reference files.
      for (const f of sel.designerFiles || []) {
        if (!f.url) continue;
        const isImg = f.type === 'image' || f.type === 'board' || /\.(png|jpe?g|webp|gif)$/i.test(f.url);
        if (!isImg) continue;
        out.push({
          url: f.url,
          label,
          sub: sel.category,
          kind: f.type === 'board' ? 'Design Board' : 'Rendering',
          approved,
        });
      }
      // Product option photos + layout images.
      for (const item of sel.items || []) {
        if (item.status === 'removed') continue;
        for (const u of item.imageUrls || []) {
          out.push({ url: u, label: `${label} — ${item.productName}`, sub: sel.category, kind: 'Option', approved: item.status === 'approved' });
        }
        for (const u of (item.layoutImageUrls || [])) {
          out.push({ url: u, label: `${label} — ${item.productName}`, sub: sel.category, kind: 'Layout', approved: item.status === 'approved' });
        }
      }
    }
    return out;
  }, [selections]);

  const rooms = useMemo(
    () => ['All', ...Array.from(new Set(selections.map(s => s.room).filter(Boolean)))],
    [selections],
  );
  const filteredGallery = roomFilter === 'All'
    ? gallery
    : gallery.filter(g => g.label.startsWith(roomFilter));

  // Selections that present more than one live option — the "play with it" set.
  const comparisons = selections.filter(
    s => (s.items || []).filter(i => i.status !== 'removed').length > 1,
  );

  const pendingCount = selections.filter(
    s => s.clientApprovalStatus !== 'Approved',
  ).length;

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Loading your design studio…</div>;
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: '#C9A96E' }} />
            Design Studio
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Explore your renderings and options, save inspiration, then finalize your selections.
          </p>
        </div>
        {pendingCount > 0 && (
          <Button
            size="sm"
            style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            onClick={() => onNavigate('selections')}
          >
            Finalize {pendingCount} selection{pendingCount > 1 ? 's' : ''}
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </div>

      {/* ── Renderings & options gallery ───────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900">Renderings & Options</h3>
          {rooms.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {rooms.map(r => (
                <button
                  key={r}
                  onClick={() => setRoomFilter(r)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    roomFilter === r
                      ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>

        {filteredGallery.length === 0 ? (
          <div className="text-center py-14 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No renderings posted yet</p>
            <p className="text-sm mt-1">Your designer's renderings and finish options will show up here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredGallery.map((g, i) => (
              <button
                key={i}
                onClick={() => setLightbox(g)}
                className="group relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50 aspect-square"
              >
                <img src={g.url} alt={g.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute top-2 left-2 flex gap-1">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${KIND_COLORS[g.kind]}`}>{g.kind}</span>
                  {g.approved && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-600 text-white flex items-center gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> Chosen
                    </span>
                  )}
                </div>
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-[11px] text-white font-medium leading-tight truncate">{g.label}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Compare options ────────────────────────────────────────────── */}
      {comparisons.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-gray-900 mb-3">Compare Your Options</h3>
          <div className="space-y-5">
            {comparisons.map(sel => {
              const items = (sel.items || []).filter(i => i.status !== 'removed');
              const locked = !!sel.locked;
              return (
                <div key={sel.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {[sel.room, sel.area].filter(Boolean).join(' · ') || sel.category}
                      </p>
                      <p className="text-xs text-gray-400">
                        {sel.category}
                        {sel.allowanceAmount > 0 && ` · $${sel.allowanceAmount.toLocaleString()} allowance`}
                      </p>
                    </div>
                    {locked ? (
                      <Badge className="bg-slate-100 text-slate-600 flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" /> Finalized
                      </Badge>
                    ) : (
                      <Badge className={sel.clientApprovalStatus === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                        {sel.clientApprovalStatus}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {items.map(item => (
                      <div
                        key={item.id}
                        className={`rounded-lg border overflow-hidden ${item.status === 'approved' ? 'border-green-400 ring-1 ring-green-200' : 'border-gray-200'}`}
                      >
                        <div className="aspect-square bg-gray-50">
                          {item.imageUrls?.[0] ? (
                            <img
                              src={item.imageUrls[0]}
                              alt={item.productName}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => setLightbox({ url: item.imageUrls[0], label: item.productName, sub: sel.category, kind: 'Option', approved: item.status === 'approved' })}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Layers className="h-6 w-6 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs font-semibold text-gray-900 leading-tight truncate">{item.productName}</p>
                          {(item.totalCost || 0) > 0 && (
                            <p className="text-[11px] text-gray-500">${(item.totalCost || 0).toLocaleString()}</p>
                          )}
                          {item.status === 'approved' && (
                            <span className="text-[11px] text-green-600 font-medium flex items-center gap-0.5 mt-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Chosen
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!locked && sel.clientApprovalStatus !== 'Approved' && (
                    <div className="flex justify-end mt-3">
                      <Button size="sm" variant="outline" onClick={() => onNavigate('selections')}>
                        Choose & approve <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Inspiration ────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Your Inspiration</h3>
        <p className="text-xs text-gray-500 mb-3">
          Upload photos of looks you love — your designer sees these and pulls from them.
        </p>
        <InspirationBoard clientContactId={clientContactId} clientName={clientName} />
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          {lightbox && (
            <div>
              <img src={lightbox.url} alt={lightbox.label} className="w-full rounded-lg" />
              <div className="flex items-center gap-2 px-2 py-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${KIND_COLORS[lightbox.kind]}`}>{lightbox.kind}</span>
                <p className="text-sm font-medium text-gray-800">{lightbox.label}</p>
                {lightbox.approved && (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1 ml-auto">
                    <CheckCircle2 className="h-3 w-3" /> Chosen
                  </span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
