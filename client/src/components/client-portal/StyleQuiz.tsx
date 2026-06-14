// Design Style Discovery — the guided visual flow the homeowner walks through in
// the Design Studio. Feels like a design consultation, not a form:
//   intro → Step 1 style direction (top 4 + "Show More" + Other/Upload)
//         → remaining selection questions (image galleries)
//         → Step 2 pairwise "which feels more like you?"
//         → Step 3 preliminary Design Profile.
// Answers log to projects/{id}/stylePreferences/quiz; comparisons + inspiration
// to their own subcollections (see lib/styleDiscovery).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Check, ChevronLeft, ChevronRight, Images, Plus } from 'lucide-react';
import {
  type StyleQuestion, type StyleOption, type StyleOptionImage,
  heroImageUrl, optionGallery,
} from '@/data/standardStyleQuiz';
import { StyleImagePlaceholder } from '@/components/style/StyleImagePlaceholder';
import { StyleInspirationCapture } from '@/components/client-portal/StyleInspirationCapture';
import { StylePairwise } from '@/components/client-portal/StylePairwise';
import { StyleProfileCard } from '@/components/client-portal/StyleProfileCard';
import { computeDesignProfile, type DesignProfile, type StyleComparison } from '@/lib/styleDiscovery';

interface StyleQuizProps {
  projectId: string;
  fromUserId?: string;
  fromUserName?: string;
}

type Phase = 'intro' | 'questions' | 'upload' | 'compare' | 'profile';
const FEATURED_COUNT = 4;

export default function StyleQuiz({ projectId, fromUserId, fromUserName }: StyleQuizProps) {
  const { toast } = useToast();
  const [quizId, setQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<StyleQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0);
  const [showAllStyles, setShowAllStyles] = useState(false);
  const [comparisons, setComparisons] = useState<StyleComparison[]>([]);
  const [profile, setProfile] = useState<DesignProfile | null>(null);
  const [completedAt, setCompletedAt] = useState<any>(null);
  // Gallery modal.
  const [gallery, setGallery] = useState<{ option: StyleOption; images: StyleOptionImage[] } | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'templates'), where('category', '==', 'styleQuiz')));
        const def = snap.docs.find(d => (d.data() as any).isDefault === true) || snap.docs[0];
        if (def) {
          setQuizId(def.id);
          setQuestions(Array.isArray((def.data() as any).questions) ? (def.data() as any).questions : []);
        }
        if (projectId) {
          const ans = await getDoc(doc(db, 'projects', projectId, 'stylePreferences', 'quiz'));
          if (ans.exists()) {
            const d = ans.data() as any;
            setAnswers(d.answers || {});
            setCompletedAt(d.completedAt || null);
            if (d.profile) setProfile(d.profile);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const overallOptions = useMemo(
    () => questions.find(q => q.id === 'overall-style')?.options || [],
    [questions],
  );
  const answeredCount = useMemo(() => questions.filter(q => answers[q.id]).length, [questions, answers]);

  const persist = async (patch: Record<string, any>) => {
    try {
      await setDoc(doc(db, 'projects', projectId, 'stylePreferences', 'quiz'), {
        quizTemplateId: quizId,
        updatedByUid: fromUserId || null,
        updatedByName: fromUserName || null,
        updatedAt: serverTimestamp(),
        ...patch,
      }, { merge: true });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || '', variant: 'destructive' });
    }
  };

  const choose = async (questionId: string, optionId: string) => {
    const next = { ...answers, [questionId]: optionId };
    setAnswers(next);
    await persist({ answers: next });
    if (step >= questions.length - 1) setPhase('compare');
    else setStep(s => s + 1);
  };

  const finishCompare = async (results: StyleComparison[]) => {
    setComparisons(results);
    const primary = answers['overall-style'] && answers['overall-style'] !== 'other-upload' ? answers['overall-style'] : null;
    const computed = computeDesignProfile(primary, results, overallOptions);
    setProfile(computed);
    await persist({ profile: computed, comparisonCount: results.length, completedAt: serverTimestamp() });
    setCompletedAt(Date.now());
    setPhase('profile');
    toast({ title: 'Your design profile is ready 🎉' });
  };

  const restart = () => { setPhase('questions'); setStep(0); setShowAllStyles(false); };

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading your design studio…</div>;

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-gray-400">
        <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="font-medium">Your style discovery is coming soon</p>
        <p className="text-sm mt-1">Your builder is putting together the style options for you.</p>
      </div>
    );
  }

  // ── Intro / results ────────────────────────────────────────────────────────
  if (phase === 'intro') {
    const done = answeredCount > 0;
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5" style={{ color: '#C9A96E' }} />
          <h3 className="text-sm font-bold text-gray-900">Design Style Discovery</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          A guided, visual walk through your home’s look — choose the renderings you love and we’ll shape your design profile. Feels like a consultation, not a form.
        </p>

        {done && (
          <div className="space-y-1.5 mb-4">
            {questions.filter(q => answers[q.id]).map(q => {
              const opt = q.options.find(o => o.id === answers[q.id]);
              return (
                <div key={q.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{q.area || q.prompt}</span>
                  <span className="font-medium text-gray-800 flex items-center gap-1">
                    <Check className="h-3 w-3 text-green-600" /> {opt?.label || '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={restart} style={{ backgroundColor: '#C9A96E', color: '#141414' }} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {done ? 'Start over' : 'Begin discovery'}
          </Button>
          {profile && (
            <Button variant="outline" onClick={() => setPhase('profile')}>View my design profile</Button>
          )}
          <span className="text-xs text-gray-400">{answeredCount}/{questions.length} answered</span>
        </div>
      </div>
    );
  }

  // ── Other / Upload Inspiration ───────────────────────────────────────────────
  if (phase === 'upload') {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <StyleInspirationCapture
          projectId={projectId}
          clientId={fromUserId}
          onBack={() => setPhase('questions')}
          onDone={async () => {
            const next = { ...answers, 'overall-style': 'other-upload' };
            setAnswers(next);
            await persist({ answers: next });
            if (questions.length <= 1) setPhase('compare');
            else { setStep(1); setPhase('questions'); }
          }}
        />
      </div>
    );
  }

  // ── Step 2: pairwise comparison ──────────────────────────────────────────────
  if (phase === 'compare') {
    return (
      <StylePairwise
        projectId={projectId}
        clientId={fromUserId}
        styleOptions={overallOptions}
        selectedIds={answers['overall-style'] ? [answers['overall-style']] : []}
        onDone={finishCompare}
      />
    );
  }

  // ── Step 3: design profile ───────────────────────────────────────────────────
  if (phase === 'profile' && profile) {
    return <StyleProfileCard profile={profile} onRetake={restart} />;
  }

  // ── Questions ────────────────────────────────────────────────────────────────
  const qn = questions[step];
  const isOverall = qn.id === 'overall-style';
  const visibleOptions = isOverall && !showAllStyles
    ? qn.options.filter((o, i) => o.featured || o.kind === 'upload' || i < FEATURED_COUNT)
    : qn.options;
  const hiddenCount = qn.options.length - visibleOptions.length;

  const OptionCard = ({ o }: { o: StyleOption }) => {
    // Other / Upload Inspiration card.
    if (o.kind === 'upload') {
      return (
        <button onClick={() => setPhase('upload')}
          className="rounded-xl border-2 border-dashed border-gray-300 hover:border-[#C9A96E] transition-colors flex flex-col items-center justify-center text-center p-4 min-h-[160px] text-gray-500 hover:text-[#8a6a3a]">
          <Plus className="h-6 w-6 mb-2" />
          <p className="text-sm font-semibold">{o.label}</p>
          {o.description && <p className="text-xs mt-1">{o.description}</p>}
        </button>
      );
    }
    const selected = answers[qn.id] === o.id;
    const hero = heroImageUrl(o);
    const story = optionGallery(o, qn.id);
    const uploadedCount = story.filter(i => i.imageUrl).length;
    return (
      <div className={`rounded-xl border overflow-hidden transition-all hover:shadow-md ${selected ? 'ring-2 ring-offset-1' : 'border-gray-200'}`}
        style={selected ? { borderColor: '#C9A96E', boxShadow: '0 0 0 2px #C9A96E55' } : {}}>
        <button onClick={() => { setGallery({ option: o, images: story }); setGalleryIdx(0); }} className="block w-full text-left">
          <div className="aspect-[4/3] flex items-center justify-center overflow-hidden relative">
            {hero ? <img src={hero} alt={o.label} className="w-full h-full object-cover" />
                  : <StyleImagePlaceholder label={o.label} slotTitle="Hero View" imageType="hero" />}
            {selected && <span className="absolute top-2 right-2 bg-green-600 text-white rounded-full p-1"><Check className="h-3.5 w-3.5" /></span>}
          </div>
        </button>
        <div className="p-2.5">
          <p className="text-sm font-semibold text-gray-900">{o.label}</p>
          {o.description && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{o.description}</p>}
          <div className="flex items-center justify-between gap-2 mt-2">
            <button onClick={() => { setGallery({ option: o, images: story }); setGalleryIdx(0); }}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#8a6a3a] hover:underline">
              <Images className="h-3.5 w-3.5" /> View Examples{uploadedCount ? ` (${uploadedCount})` : ''}
            </button>
            <Button size="sm" className="h-7 text-xs" style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              onClick={() => choose(qn.id, o.id)}>
              {isOverall ? 'Select This Style' : 'Select'}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => (step === 0 ? setPhase('intro') : setStep(s => s - 1))}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-xs text-gray-400">{step + 1} of {questions.length}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${(step / questions.length) * 100}%`, backgroundColor: '#C9A96E' }} />
      </div>

      {qn.area && <p className="text-xs font-medium uppercase tracking-wide" style={{ color: '#8a6a3a' }}>{qn.area}</p>}
      <h3 className="text-lg font-bold text-gray-900 mt-0.5">{qn.prompt}</h3>
      {qn.helpText && <p className="text-sm text-gray-500 mt-0.5">{qn.helpText}</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {visibleOptions.map(o => <OptionCard key={o.id} o={o} />)}
      </div>

      {isOverall && !showAllStyles && hiddenCount > 0 && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => setShowAllStyles(true)}>Show More Styles ({hiddenCount})</Button>
        </div>
      )}

      {/* Examples gallery */}
      <Dialog open={!!gallery} onOpenChange={() => setGallery(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          {gallery && (() => {
            const img = gallery.images[Math.min(galleryIdx, gallery.images.length - 1)];
            const last = gallery.images.length - 1;
            const go = (dir: -1 | 1) => setGalleryIdx(i => (dir < 0 ? (i <= 0 ? last : i - 1) : (i >= last ? 0 : i + 1)));
            const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
            const onTouchEnd = (e: React.TouchEvent) => {
              if (touchX.current == null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
              touchX.current = null;
            };
            return (
              <div>
                <div className="relative bg-black flex items-center justify-center select-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                  {img?.imageUrl ? (
                    <img src={img.imageUrl} alt={img.altText || img.title || gallery.option.label} className="max-h-[70vh] w-full object-contain" />
                  ) : (
                    <div className="w-full aspect-[4/3] max-h-[70vh]">
                      <StyleImagePlaceholder label={gallery.option.label} slotTitle={img?.title} imageType={String(img?.imageType || 'hero')} />
                    </div>
                  )}
                  {gallery.images.length > 1 && (
                    <>
                      <button onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1.5 hover:bg-white"><ChevronLeft className="h-5 w-5" /></button>
                      <button onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-1.5 hover:bg-white"><ChevronRight className="h-5 w-5" /></button>
                    </>
                  )}
                </div>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{gallery.option.label}</p>
                    <p className="text-xs text-gray-500 truncate">{img?.title}{img?.description ? ` — ${img.description}` : ''}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{galleryIdx + 1} of {gallery.images.length}</p>
                  </div>
                  <Button size="sm" style={{ backgroundColor: '#C9A96E', color: '#141414' }}
                    onClick={() => { choose(qn.id, gallery.option.id); setGallery(null); }}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Select This Style
                  </Button>
                </div>
                {gallery.images.length > 1 && (
                  <div className="flex gap-1.5 px-4 pb-4 overflow-x-auto">
                    {gallery.images.map((g, k) => (
                      <button key={g.imageId || k} onClick={() => setGalleryIdx(k)}
                        className={`flex-shrink-0 w-14 h-14 rounded overflow-hidden border ${k === galleryIdx ? 'ring-2 ring-[#C9A96E]' : 'border-gray-200'}`}>
                        {g.imageUrl ? <img src={g.imageUrl} alt={g.title} className="w-full h-full object-cover" />
                                    : <StyleImagePlaceholder slotTitle={g.title} imageType={String(g.imageType)} compact />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
