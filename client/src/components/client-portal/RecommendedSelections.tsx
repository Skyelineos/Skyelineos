// "Recommended For You" — the homeowner's friendly first pass at selections.
// We put a recommended rendering in front of them for each part of the home
// (drawn from their Style Discovery answers + anything the designer added). They
// either ❤ Love it or ✕ Not for me. Saying "not for me" creates a task to upload
// a photo of what they'd like instead — that photo lands in the designer's lap.
//
// Two taps, plus an optional photo. The heavy selections engine is untouched;
// this is the guided front layer that feeds it.

import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, orderBy, query as fsQuery,
  getDoc, getDocs, doc, query, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Heart, X, Sparkles, Check, Upload, Loader2, RotateCcw, ImageUp,
} from 'lucide-react';
import { StyleImagePlaceholder } from '@/components/style/StyleImagePlaceholder';
import type { StyleQuestion } from '@/data/standardStyleQuiz';
import type { SelectionRecommendation } from '@/types/selectionRecommendations';
import {
  generateFromQuiz, loveRecommendation, removeRecommendation,
  undoRecommendationResponse, uploadRedirectPhoto, attachRecommendationPhoto,
} from '@/lib/selectionRecommendations';

interface Props {
  projectId: string;
  clientContactId?: string;
  clientName?: string;
}

export default function RecommendedSelections({ projectId, clientContactId, clientName }: Props) {
  const { toast } = useToast();
  const [recs, setRecs] = useState<SelectionRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<StyleQuestion[]>([]);
  const [generating, setGenerating] = useState(false);
  const triedAutoGen = useState({ done: false })[0];

  // Live recommendations.
  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      fsQuery(COL(projectId), orderBy('sortOrder', 'asc')),
      snap => {
        setRecs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SelectionRecommendation)));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [projectId]);

  // Load quiz answers + the standard quiz template (for generation).
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const ans = await getDoc(doc(db, 'projects', projectId, 'stylePreferences', 'quiz'));
        if (ans.exists()) setAnswers((ans.data() as any).answers || {});
        const tpl = await getDocs(query(collection(db, 'templates'), where('category', '==', 'styleQuiz')));
        const def = tpl.docs.find(d => (d.data() as any).isDefault === true) || tpl.docs[0];
        if (def) setQuestions(Array.isArray((def.data() as any).questions) ? (def.data() as any).questions : []);
      } catch { /* best-effort */ }
    })();
  }, [projectId]);

  const answeredCount = useMemo(
    () => questions.filter(q => q.id !== 'overall-style' && answers[q.id]).length,
    [questions, answers],
  );

  const runGenerate = async (silent = false) => {
    if (!questions.length) return;
    setGenerating(true);
    try {
      const res = await generateFromQuiz(projectId, answers, questions);
      if (!silent && res.total > 0) {
        toast({ title: 'Recommendations ready ✨', description: `${res.total} look${res.total > 1 ? 's' : ''} picked from your style profile.` });
      }
    } catch (e: any) {
      if (!silent) toast({ title: 'Could not build recommendations', description: e?.message || '', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate once if the client has answered the quiz but has no cards yet.
  useEffect(() => {
    if (loading || triedAutoGen.done) return;
    if (recs.length === 0 && answeredCount > 0 && questions.length > 0) {
      triedAutoGen.done = true;
      runGenerate(true);
    }
  }, [loading, recs.length, answeredCount, questions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;

  // Nothing to recommend yet — nudge them to finish the quiz.
  if (recs.length === 0) {
    return (
      <div>
        <SectionHeader />
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="font-medium text-gray-500">
            {answeredCount > 0 ? 'Building your recommendations…' : 'Finish your Design Style Discovery above'}
          </p>
          <p className="text-sm mt-1">
            {answeredCount > 0
              ? 'We’re pulling looks from your style profile.'
              : 'Once you tell us your style, we’ll recommend a look for each part of your home.'}
          </p>
          {answeredCount > 0 && (
            <Button size="sm" className="mt-3" disabled={generating}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }} onClick={() => runGenerate(false)}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Build my recommendations'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  const lovedCount = recs.filter(r => r.status === 'loved').length;
  const pendingCount = recs.filter(r => r.status === 'pending').length;

  return (
    <div>
      <SectionHeader>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {lovedCount} loved · {pendingCount} to review
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={generating}
            onClick={() => runGenerate(false)}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" />Refresh</>}
          </Button>
        </div>
      </SectionHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recs.map(r => (
          <RecCard key={r.id} projectId={projectId} rec={r} toast={toast} />
        ))}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <div>
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Heart className="h-4 w-4" style={{ color: '#C9A96E' }} /> Recommended For You
        </h3>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          A look we’d pull for each part of your home. Keep what you love — or swap in a photo of what you’d like instead.
        </p>
      </div>
      {children}
    </div>
  );
}

// ── One recommendation card ───────────────────────────────────────────────────
function RecCard({ projectId, rec, toast }: { projectId: string; rec: SelectionRecommendation; toast: ReturnType<typeof useToast>['toast'] }) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState('');

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); }
    catch (e: any) { toast({ title: 'Something went wrong', description: e?.message || '', variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const photo = await uploadRedirectPhoto(projectId, rec.id, file);
      await attachRecommendationPhoto(projectId, rec.id, photo, note);
      toast({ title: 'Got it — thanks!', description: 'Your designer will use your photo for this.' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const heading = (
    <div className="p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: '#8a6a3a' }}>
        {[rec.room, rec.category].filter(Boolean).join(' · ')}
      </p>
      <p className="text-sm font-semibold text-gray-900 leading-tight">{rec.title}</p>
      {rec.description && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{rec.description}</p>}
    </div>
  );

  return (
    <div className={`rounded-xl border overflow-hidden bg-white transition-all ${rec.status === 'loved' ? 'border-green-300 ring-1 ring-green-100' : 'border-gray-200'}`}>
      {/* Image / placeholder */}
      <div className="aspect-[4/3] relative bg-gray-50">
        {rec.status === 'photo_added' && rec.clientPhotoUrl ? (
          <img src={rec.clientPhotoUrl} alt="Your photo" className="w-full h-full object-cover" />
        ) : rec.imageUrl ? (
          <img src={rec.imageUrl} alt={rec.title} className="w-full h-full object-cover" />
        ) : (
          <StyleImagePlaceholder label={rec.title} slotTitle={rec.category} imageType="hero" />
        )}
        {rec.status === 'loved' && (
          <span className="absolute top-2 right-2 bg-green-600 text-white rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1">
            <Check className="h-3 w-3" /> Loved
          </span>
        )}
        {rec.status === 'photo_added' && (
          <span className="absolute top-2 right-2 bg-[#C9A96E] text-[#141414] rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1">
            <ImageUp className="h-3 w-3" /> Your photo
          </span>
        )}
      </div>

      {heading}

      {/* Actions per status */}
      <div className="px-3 pb-3">
        {rec.status === 'pending' && (
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1 h-8" disabled={busy}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={() => guard(() => loveRecommendation(projectId, rec.id))}>
              <Heart className="h-3.5 w-3.5 mr-1" /> Love it
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-8 text-gray-600" disabled={busy}
              onClick={() => guard(() => removeRecommendation(projectId, rec.id))}>
              <X className="h-3.5 w-3.5 mr-1" /> Not for me
            </Button>
          </div>
        )}

        {rec.status === 'loved' && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-green-700 font-medium flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Added to your loved looks
            </span>
            <button className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1" disabled={busy}
              onClick={() => guard(() => undoRecommendationResponse(projectId, rec.id))}>
              <RotateCcw className="h-3 w-3" /> Undo
            </button>
          </div>
        )}

        {rec.status === 'removed' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-600">
              No problem. Upload a photo of what you’d like instead — we’ve added this as a task for you.
            </p>
            <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Optional: what do you like about it?" className="text-xs" />
            <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 cursor-pointer text-gray-500 hover:border-[#C9A96E] hover:text-[#8a6a3a] text-sm font-medium">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Upload a photo'}
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={e => onFile(e.target.files?.[0])} />
            </label>
            <button className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mx-auto" disabled={busy}
              onClick={() => guard(() => undoRecommendationResponse(projectId, rec.id))}>
              <RotateCcw className="h-3 w-3" /> Actually, I’ll keep it
            </button>
          </div>
        )}

        {rec.status === 'photo_added' && (
          <div className="space-y-2">
            <span className="text-xs text-[#8a6a3a] font-medium flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Shared with your designer
            </span>
            {rec.clientNote && <p className="text-xs text-gray-500 italic">“{rec.clientNote}”</p>}
            <label className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 cursor-pointer">
              <Upload className="h-3 w-3" /> Replace photo
              <input type="file" accept="image/*" className="hidden" disabled={uploading}
                onChange={e => onFile(e.target.files?.[0])} />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

// Collection ref helper (function decl is hoisted, so it's usable above).
function COL(projectId: string) {
  return collection(db, 'projects', projectId, 'selectionRecommendations');
}
