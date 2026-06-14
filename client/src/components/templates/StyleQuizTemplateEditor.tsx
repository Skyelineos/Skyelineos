// Editor for a Style Quiz template (templates doc, category 'styleQuiz').
// The GC edits the questions + options and uploads a representative photo for
// each option (what the client sees while clicking through). ★ to set default.

import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, Plus, Trash2, ImagePlus, Loader2 } from 'lucide-react';
import type { StyleQuestion, StyleOption } from '@/data/standardStyleQuiz';

const uid = () => Math.random().toString(36).slice(2, 9);

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
      setQuestions(Array.isArray(d?.questions) ? d.questions : []);
      setLoading(false);
    })();
  }, [templateId]);

  const updateQ = (qi: number, patch: Partial<StyleQuestion>) =>
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, ...patch } : q));
  const updateOpt = (qi: number, oi: number, patch: Partial<StyleOption>) =>
    setQuestions(qs => qs.map((q, i) => i === qi
      ? { ...q, options: q.options.map((o, j) => j === oi ? { ...o, ...patch } : o) } : q));
  const addQuestion = () =>
    setQuestions(qs => [...qs, { id: uid(), area: '', prompt: 'New question', options: [{ id: uid(), label: 'Option A' }, { id: uid(), label: 'Option B' }] }]);
  const removeQuestion = (qi: number) => setQuestions(qs => qs.filter((_, i) => i !== qi));
  const addOption = (qi: number) => updateQ(qi, { options: [...questions[qi].options, { id: uid(), label: 'New option' }] });
  const removeOption = (qi: number, oi: number) => updateQ(qi, { options: questions[qi].options.filter((_, j) => j !== oi) });

  const uploadImage = async (qi: number, oi: number, file: File) => {
    const key = `${qi}-${oi}`;
    setUploading(key);
    try {
      const path = `styleQuiz/${templateId}/${Date.now()}-${file.name}`;
      const sref = storageRef(storage, path);
      await uploadBytesResumable(sref, file);
      const url = await getDownloadURL(sref);
      updateOpt(qi, oi, { imageUrl: url });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'templates', templateId), { name, questions, updatedAt: serverTimestamp() });
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

      <div className="space-y-4">
        {questions.map((q, qi) => (
          <div key={q.id} className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Input value={q.area} onChange={e => updateQ(qi, { area: e.target.value })} placeholder="Area (e.g. Bathrooms)" className="w-44 h-8 text-xs" />
              <Input value={q.prompt} onChange={e => updateQ(qi, { prompt: e.target.value })} placeholder="Question prompt" className="flex-1 h-8 text-sm font-medium" />
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" onClick={() => removeQuestion(qi)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
            <Input value={q.helpText || ''} onChange={e => updateQ(qi, { helpText: e.target.value })} placeholder="Help text (optional)" className="h-8 text-xs" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {q.options.map((o, oi) => (
                <div key={o.id} className="rounded-lg border border-gray-200 p-2 space-y-1.5">
                  <div className="aspect-square rounded-md bg-gray-50 overflow-hidden flex items-center justify-center relative">
                    {o.imageUrl ? (
                      <img src={o.imageUrl} alt={o.label} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-gray-400 text-center px-2">No photo yet</span>
                    )}
                    <label className="absolute bottom-1 right-1 cursor-pointer bg-white/90 rounded px-1.5 py-1 text-[10px] flex items-center gap-1 border">
                      {uploading === `${qi}-${oi}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(qi, oi, f); }} />
                    </label>
                  </div>
                  <Input value={o.label} onChange={e => updateOpt(qi, oi, { label: e.target.value })} placeholder="Label" className="h-7 text-xs font-medium" />
                  <Input value={o.description || ''} onChange={e => updateOpt(qi, oi, { description: e.target.value })} placeholder="Short note" className="h-7 text-[11px]" />
                  <button onClick={() => removeOption(qi, oi)} className="text-[10px] text-red-500 hover:underline">Remove</button>
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
