// Interactive "soft sales pitch" shown in the client portal BEFORE a homeowner
// has an active project. A grid of one-pager cards — each answers the questions
// prospective clients have about working with Skyeline Homes, with a slot for a
// video (added later) and any downloadable documents.
//
// Content comes from the `salesPitchSections` Firestore collection and is
// editable in place by staff (admin / gc): pencil to edit, + to add, trash lives
// inside the editor. Real clients see a clean, read-only experience. When the
// collection is empty we fall back to the built-in starter drafts so the screen
// is never blank, and staff get a one-click "publish starter content" button.

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Pencil, Plus, ArrowRight, FileText, Download, PlayCircle, EyeOff,
  Sparkles, Loader2,
} from 'lucide-react';
import {
  type SalesPitchSection as Section, blankSection,
  subscribeSalesPitch, seedDefaultSections, DEFAULT_SECTIONS,
} from '@/lib/salesPitch';
import { SalesIcon } from './salesPitchIcons';
import { SalesPitchEditDialog } from './SalesPitchEditDialog';

const GOLD = '#C9A96E';

// ── video embed helper ──────────────────────────────────────────────────────
function VideoSlot({ url, title }: { url?: string; title: string }) {
  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 py-10 text-center">
        <PlayCircle className="h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm font-medium text-gray-500">Video coming soon</p>
        <p className="text-xs text-gray-400">A short walkthrough on “{title}” will live here.</p>
      </div>
    );
  }
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  let embed = '';
  if (yt) embed = `https://www.youtube.com/embed/${yt[1]}`;
  else if (vimeo) embed = `https://player.vimeo.com/video/${vimeo[1]}`;

  if (embed) {
    return (
      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
        <iframe src={embed} title={title} className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(url)) {
    return <video src={url} controls className="w-full rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }} />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-6 text-sm font-medium text-[#8a6a3a] hover:bg-gray-50">
      <PlayCircle className="h-5 w-5" /> Watch the video
    </a>
  );
}

// ── one-pager reader ────────────────────────────────────────────────────────
function OnePager({ section, onClose }: { section: Section; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-t-lg px-6 py-8"
          style={{ background: `linear-gradient(135deg, #141414 0%, #1f1d1a 60%, #2a2419 100%)` }}>
          <div className="pointer-events-none absolute -top-20 -right-12 h-56 w-56 rounded-full opacity-25 blur-3xl"
            style={{ backgroundColor: GOLD }} />
          <div className="relative">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: 'rgba(201,169,110,0.16)' }}>
              <SalesIcon name={section.icon} className="h-6 w-6" style={{ color: GOLD }} />
            </div>
            <DialogHeader className="mt-4 space-y-1 text-left">
              <DialogTitle className="text-2xl font-bold text-white">{section.title}</DialogTitle>
              <p className="text-sm" style={{ color: GOLD }}>{section.tagline}</p>
            </DialogHeader>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          {section.intro && (
            <p className="text-[15px] leading-relaxed text-gray-700">{section.intro}</p>
          )}

          <VideoSlot url={section.videoUrl} title={section.title} />

          {section.faqs?.length > 0 && (
            <div className="space-y-4">
              {section.faqs.map((f, i) => (
                <div key={i} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
                  <p className="text-sm font-semibold text-gray-900">{f.q}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{f.a}</p>
                </div>
              ))}
            </div>
          )}

          {section.documents?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Documents</p>
              <div className="space-y-2">
                {section.documents.map((d, i) => (
                  <a key={i} href={d.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:border-[#C9A96E]/50 hover:bg-gray-50">
                    <FileText className="h-4 w-4 flex-shrink-0 text-gray-400" />
                    <span className="flex-1 truncate text-sm text-gray-700">{d.name}</span>
                    <Download className="h-4 w-4 text-gray-300" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── main section ────────────────────────────────────────────────────────────
export function SalesPitchSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const canEdit = user?.role === 'admin' || user?.role === 'gc';

  const [remote, setRemote] = useState<Section[] | null>(null);
  const [reader, setReader] = useState<Section | null>(null);
  const [editing, setEditing] = useState<Section | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    const unsub = subscribeSalesPitch(setRemote, () => setRemote([]));
    return () => unsub();
  }, []);

  // Firestore content wins; fall back to built-in drafts when nothing is curated.
  const usingDefaults = !remote || remote.length === 0;
  const all = usingDefaults ? DEFAULT_SECTIONS : remote!;

  // Clients only see published sections; staff see everything (hidden ones badged).
  const sections = useMemo(
    () => (canEdit ? all : all.filter(s => s.published)),
    [all, canEdit],
  );

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDefaultSections(user ? String((user as any).uid || user.id) : undefined);
      toast({ title: 'Starter content published', description: 'You can now edit every section.' });
    } catch (e: any) {
      toast({ title: 'Could not publish', description: e?.message, variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  if (remote === null) {
    return (
      <div className="px-4 sm:px-6">
        <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (sections.length === 0 && !canEdit) return null;

  return (
    <div className="px-4 sm:px-6 pb-2">
      {/* Section header */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
            <Sparkles className="h-3.5 w-3.5" style={{ color: GOLD }} />
            Explore Skyeline
          </div>
          <h2 className="mt-1 text-lg font-bold text-gray-900">Everything you’re wondering about working with us</h2>
          <p className="text-sm text-gray-500">Tap any topic for a quick guide — no question too small.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setEditing(blankSection((all[all.length - 1]?.order || 0) + 1))}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-[#C9A96E]/60 hover:text-[#8a6a3a]"
          >
            <Plus className="h-3.5 w-3.5" /> Add section
          </button>
        )}
      </div>

      {/* Staff banner when content is still the built-in drafts */}
      {canEdit && usingDefaults && (
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-[#C9A96E]/40 bg-[#C9A96E]/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
            <p className="text-sm text-gray-700">
              These are <span className="font-semibold">starter drafts</span>. Publish them to Firestore to edit the copy, swap icons, add videos, and attach documents.
            </p>
          </div>
          <button onClick={handleSeed} disabled={seeding}
            className="flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[#1a1a1a]"
            style={{ backgroundColor: GOLD }}>
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Publish starter content
          </button>
        </div>
      )}

      {/* Card grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map(section => (
          <div key={section.id} className="group relative">
            <button
              onClick={() => setReader(section)}
              className="flex h-full w-full flex-col items-start rounded-xl border border-gray-200 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#C9A96E]/50 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'rgba(201,169,110,0.12)' }}>
                <SalesIcon name={section.icon} className="h-5 w-5" style={{ color: GOLD }} />
              </div>
              <div className="mt-4 flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900">{section.title}</p>
                {!section.published && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                    <EyeOff className="h-2.5 w-2.5" /> Hidden
                  </span>
                )}
              </div>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-gray-500">{section.tagline}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-400 group-hover:text-[#8a6a3a]">
                Read more <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>

            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); setEditing(section); }}
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white/90 text-gray-400 opacity-0 shadow-sm transition-opacity hover:text-[#8a6a3a] group-hover:opacity-100"
                title="Edit section"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="mt-5 text-center text-xs text-gray-400">
        Still have a question? Reach your Skyeline team anytime in the Messages tab.
      </p>

      {reader && <OnePager section={reader} onClose={() => setReader(null)} />}
      {editing && (
        <SalesPitchEditDialog
          open
          section={editing}
          uid={user ? String((user as any).uid || user.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
