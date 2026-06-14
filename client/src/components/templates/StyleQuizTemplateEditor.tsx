// Editor for a Style Quiz template (templates doc, category 'styleQuiz').
// The GC edits questions + options and manages a GALLERY of renderings per
// option (hero + context + detail + comparison). Upload, set-hero, reorder,
// replace, delete. Backward-compatible: an option that only has the legacy
// single `imageUrl` is shown as a hero image you can build on.

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Plus, Trash2, ImagePlus, Loader2, Star, ArrowUp, ArrowDown } from 'lucide-react';
import {
  type StyleQuestion, type StyleOption, type StyleOptionImage,
  makeImageSlots,
} from '@/data/standardStyleQuiz';
import { StyleImagePlaceholder } from '@/components/style/StyleImagePlaceholder';

const uid = () => Math.random().toString(36).slice(2, 9);

// Ensure an option has a gallery to edit (migrate legacy single imageUrl).
function ensureImages(o: StyleOption, questionId: string): StyleOptionImage[] {
  if (o.images && o.images.length) return o.images;
  if (o.imageUrl) {
    return [{ imageId: uid(), optionId: o.id, questionId, imageType: 'hero', title: 'Hero', sortOrder: 0, imageUrl: o.imageUrl, isHero: true }];
  }
  return makeImageSlots(questionId, o.id);
}

export function StyleQuizTemplateEditor({ templateId, onBack }: { templateId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [questions, setQuestions] = useState<StyleQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'templates', templateId));
      const d = snap.data() as any;
      setName(d?.name || 'Style Quiz');
      const qs: StyleQuestion[] = Array.isArray(d?.questions) ? d.questions : [];
      // Normalize: guarantee every option has an images[] gallery.
      qs.forEach(q => q.options.forEach(o => { o.images = ensureImages(o, q.id); }));
      setQuestions(qs);
      setLoading(false);
    })();
  }, [templateId]);

  // ── mutation helpers ────────────────────────────────────────────────────
  const updateQ = (qi: number, patch: Partial<StyleQuestion>) =>
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, ...patch } : q));
  const updateOpt = (qi: number, oi: number, patch: Partial<StyleOption>) =>
    setQuestions(qs => qs.map((q, i) => i === qi
      ? { ...q, options: q.options.map((o, j) => j === oi ? { ...o, ...patch } : o) } : q));
  const setImages = (qi: number, oi: number, images: StyleOptionImage[]) =>
    updateOpt(qi, oi, { images });

  const addQuestion = () =>
    setQuestions(qs => [...qs, { id: uid(), area: '', prompt: 'New question', options: [
      { id: uid(), label: 'Option A', images: [] }, { id: uid(), label: 'Option B', images: [] },
    ] }]);
  const removeQuestion = (qi: number) => setQuestions(qs => qs.filter((_, i) => i !== qi));
  const addOption = (qi: number) => {
    const q = questions[qi];
    const oid = uid();
    updateQ(qi, { options: [...q.options, { id: oid, label: 'New option', images: makeImageSlots(q.id, oid) }] });
  };
  const removeOption = (qi: number, oi: number) => updateQ(qi, { options: questions[qi].options.filter((_, j) => j !== oi) });

  const addImage = (qi: number, oi: number) => {
    const o = questions[qi].options[oi];
    const imgs = o.images || [];
    setImages(qi, oi, [...imgs, {
      imageId: uid(), optionId: o.id, questionId: questions[qi].id,
      imageType: 'context2', title: `Image ${imgs.length + 1}`, sortOrder: imgs.length, imageUrl: '',
      isHero: imgs.length === 0,
    }]);
  };
  const updateImage = (qi: number, oi: number, ii: number, patch: Partial<StyleOptionImage>) => {
    const imgs = (questions[qi].options[oi].images || []).map((im, k) => k === ii ? { ...im, ...patch } : im);
    setImages(qi, oi, imgs);
  };
  const removeImage = (qi: number, oi: number, ii: number) => {
    let imgs = (questions[qi].options[oi].images || []).filter((_, k) => k !== ii);
    if (imgs.length && !imgs.some(im => im.isHero)) imgs = imgs.map((im, k) => k === 0 ? { ...im, isHero: true } : im);
    setImages(qi, oi, imgs.map((im, k) => ({ ...im, sortOrder: k })));
  };
  const setHero = (qi: number, oi: number, ii: number) => {
    const imgs = (questions[qi].options[oi].images || []).map((im, k) => ({ ...im, isHero: k === ii }));
    setImages(qi, oi, imgs);
  };
  const moveImage = (qi: number, oi: number, ii: number, dir: -1 | 1) => {
    const imgs = (questions[qi].options[oi].images || []).slice();
    const j = ii + dir;
    if (j < 0 || j >= imgs.length) return;
    [imgs[ii], imgs[j]] = [imgs[j], imgs[ii]];
    setImages(qi, oi, imgs.map((im, k) => ({ ...im, sortOrder: k })));
  };

  const uploadTo = async (qi: number, oi: number, ii: number, file: File) => {
    const key = `${qi}-${oi}-${ii}`;
    setUploading(key);
    try {
      const path = `styleQuiz/${templateId}/${questions[qi].options[oi].id}/${Date.now()}-${file.name}`;
      const sref = storageRef(storage, path);
      await uploadBytesResumable(sref, file);
      const url = await getDownloadURL(sref);
      updateImage(qi, oi, ii, { imageUrl: url, storagePath: path, updatedAt: Date.now() });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      // Normalize sortOrder + ensure a hero per option before saving.
      const clean = questions.map(q => ({
        ...q,
        options: q.options.map(o => {
          const imgs = (o.images || []).map((im, k) => ({ ...im, sortOrder: k }));
          if (imgs.length && !imgs.some(im => im.isHero)) imgs[0].isHero = true;
          return { ...o, images: imgs };
        }),
      }));
      await updateDoc(doc(db, 'templates', templateId), { name, questions: clean, updatedAt: serverTimestamp() });
      toast({ title: 'Style quiz saved' });
      onBack();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="w-4 h-4" /> Templates
        </button>
        <Button onClick={save} disabled={saving} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>

      <Input value={name} onChange={e => setName(e.target.value)} className="max-w-sm font-semibold" placeholder="Quiz name" />
      <p className="text-xs text-gray-400">
        Upload a rendering into each slot. The ★ image is the card thumbnail clients see; the rest show in “View Examples”.
      </p>
      <p className="text-xs text-amber-600">
        TODO: Replace placeholders with final AI renderings (each option supports Hero · Context 1 · Context 2 · Detail · Lifestyle).
      </p>

      <div className="space-y-5">
        {questions.map((q, qi) => (
          <div key={q.id} className="rounded-xl border border-gray-200 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Input value={q.area} onChange={e => updateQ(qi, { area: e.target.value })} placeholder="Area" className="w-40 h-8 text-xs" />
              <Input value={q.prompt} onChange={e => updateQ(qi, { prompt: e.target.value })} placeholder="Question prompt" className="flex-1 h-8 text-sm font-medium" />
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => removeQuestion(qi)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <Input value={q.helpText || ''} onChange={e => updateQ(qi, { helpText: e.target.value })} placeholder="Help text (optional)" className="h-8 text-xs" />

            <div className="space-y-4">
              {q.options.map((o, oi) => (
                <div key={o.id} className="rounded-lg border border-gray-200 p-3 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Input value={o.label} onChange={e => updateOpt(qi, oi, { label: e.target.value })} placeholder="Option label" className="w-48 h-8 text-xs font-semibold bg-white" />
                    <Input value={o.description || ''} onChange={e => updateOpt(qi, oi, { description: e.target.value })} placeholder="Short note" className="flex-1 h-8 text-xs bg-white" />
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-red-500 text-xs" onClick={() => removeOption(qi, oi)}>Remove option</Button>
                  </div>

                  {/* Gallery slots */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {(o.images || []).map((im, ii) => {
                      const key = `${qi}-${oi}-${ii}`;
                      return (
                        <div key={im.imageId || ii} className="rounded-md border border-gray-200 bg-white p-1.5 space-y-1">
                          <div className="aspect-square rounded bg-gray-50 overflow-hidden flex items-center justify-center relative">
                            {im.imageUrl ? (
                              <img src={im.imageUrl} alt={im.altText || im.title} className="w-full h-full object-cover" />
                            ) : (
                              <StyleImagePlaceholder label={o.label} slotTitle={im.title} imageType={String(im.imageType)} compact />
                            )}
                            {im.isHero && (
                              <span className="absolute top-1 left-1 bg-amber-500 text-white rounded px-1 text-[8px] flex items-center gap-0.5">
                                <Star className="w-2 h-2 fill-white" /> Hero
                              </span>
                            )}
                            <label className="absolute bottom-1 right-1 cursor-pointer bg-white/90 rounded px-1 py-0.5 text-[9px] flex items-center gap-0.5 border">
                              {uploading === key ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ImagePlus className="w-2.5 h-2.5" />}
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadTo(qi, oi, ii, f); }} />
                            </label>
                          </div>
                          <Input value={im.title} onChange={e => updateImage(qi, oi, ii, { title: e.target.value })} className="h-6 text-[10px] px-1" placeholder="Title" />
                          <Input value={im.description || ''} onChange={e => updateImage(qi, oi, ii, { description: e.target.value })} className="h-6 text-[10px] px-1" placeholder="Description" />
                          <Input value={im.altText || ''} onChange={e => updateImage(qi, oi, ii, { altText: e.target.value })} className="h-6 text-[10px] px-1" placeholder="Alt text" />
                          <Badge variant="outline" className="text-[8px] w-full justify-center">{String(im.imageType)}</Badge>
                          <div className="flex items-center justify-between">
                            <button title="Set as hero" onClick={() => setHero(qi, oi, ii)} className={`text-[9px] ${im.isHero ? 'text-amber-600' : 'text-gray-400 hover:text-amber-600'}`}>
                              <Star className={`w-3 h-3 ${im.isHero ? 'fill-amber-500 stroke-amber-500' : ''}`} />
                            </button>
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => moveImage(qi, oi, ii, -1)} className="text-gray-400 hover:text-gray-700"><ArrowUp className="w-3 h-3" /></button>
                              <button onClick={() => moveImage(qi, oi, ii, 1)} className="text-gray-400 hover:text-gray-700"><ArrowDown className="w-3 h-3" /></button>
                              <button onClick={() => removeImage(qi, oi, ii)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addImage(qi, oi)} className="gap-1 text-[11px] mt-2 h-7">
                    <Plus className="w-3 h-3" /> Add image
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => addOption(qi)} className="gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add option
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={addQuestion} className="gap-2">
        <Plus className="w-4 h-4" /> Add question
      </Button>
    </div>
  );
}
