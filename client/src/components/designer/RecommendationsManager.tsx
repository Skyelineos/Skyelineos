// Designer-side control for the "Recommended For You" layer. Lets the designer:
//   - see every recommendation + how the client responded (loved / not for me /
//     uploaded a photo of what they'd like instead)
//   - add a one-off recommendation or edit/override an auto one
//   - (re)generate recommendations from the client's Style Discovery answers
// The client experience lives in client-portal/RecommendedSelections.

import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, orderBy, query as fsQuery,
  getDoc, getDocs, doc, query, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Heart, Plus, Sparkles, Loader2, Pencil, Check, X, ImageUp } from 'lucide-react';
import type { StyleQuestion } from '@/data/standardStyleQuiz';
import type { SelectionRecommendation, RecommendationStatus } from '@/types/selectionRecommendations';
import {
  generateFromQuiz, addDesignerRecommendation, updateRecommendationContent,
} from '@/lib/selectionRecommendations';

interface Props {
  projectId: string;
}

const STATUS_BADGE: Record<RecommendationStatus, { label: string; cls: string }> = {
  pending: { label: 'Awaiting client', cls: 'bg-gray-100 text-gray-600' },
  loved: { label: 'Loved', cls: 'bg-green-100 text-green-700' },
  removed: { label: 'Not for me — photo pending', cls: 'bg-amber-100 text-amber-700' },
  photo_added: { label: 'Client sent a photo', cls: 'bg-[#C9A96E]/20 text-[#8a6a3a]' },
};

export function RecommendationsManager({ projectId }: Props) {
  const { toast } = useToast();
  const [recs, setRecs] = useState<SelectionRecommendation[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<StyleQuestion[]>([]);
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ category: '', title: '', description: '', imageUrl: '' });

  useEffect(() => {
    if (!projectId) return;
    const unsub = onSnapshot(
      fsQuery(collection(db, 'projects', projectId, 'selectionRecommendations'), orderBy('sortOrder', 'asc')),
      snap => setRecs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SelectionRecommendation)))
    );
    return unsub;
  }, [projectId]);

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

  const hasQuizAnswers = useMemo(
    () => questions.some(q => q.id !== 'overall-style' && answers[q.id]),
    [questions, answers],
  );

  const runGenerate = async () => {
    if (!questions.length) { toast({ title: 'Style quiz template not found', variant: 'destructive' }); return; }
    setGenerating(true);
    try {
      const res = await generateFromQuiz(projectId, answers, questions, 'designer');
      toast({ title: 'Recommendations updated', description: `${res.created} new · ${res.updated} refreshed.` });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e?.message || '', variant: 'destructive' });
    } finally { setGenerating(false); }
  };

  const resetForm = () => { setForm({ category: '', title: '', description: '', imageUrl: '' }); setAdding(false); setEditingId(null); };

  const saveForm = async () => {
    if (!form.category.trim() || !form.title.trim()) {
      toast({ title: 'Category and title are required', variant: 'destructive' });
      return;
    }
    try {
      if (editingId) {
        await updateRecommendationContent(projectId, editingId, {
          category: form.category.trim(), title: form.title.trim(),
          description: form.description.trim() || null, imageUrl: form.imageUrl.trim() || null,
        });
        toast({ title: 'Recommendation updated' });
      } else {
        await addDesignerRecommendation(projectId, {
          category: form.category.trim(), title: form.title.trim(),
          description: form.description.trim() || undefined, imageUrl: form.imageUrl.trim() || null,
        });
        toast({ title: 'Recommendation added' });
      }
      resetForm();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || '', variant: 'destructive' });
    }
  };

  const startEdit = (r: SelectionRecommendation) => {
    setEditingId(r.id); setAdding(true);
    setForm({ category: r.category || '', title: r.title || '', description: r.description || '', imageUrl: r.imageUrl || '' });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <Heart className="h-4 w-4" style={{ color: '#C9A96E' }} /> Recommended For Client
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Looks the client reviews in their Design Studio. Generated from their style profile — add or override as needed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" disabled={generating || !hasQuizAnswers}
            onClick={runGenerate} title={hasQuizAnswers ? '' : 'Client hasn’t answered the style quiz yet'}>
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Sparkles className="h-3.5 w-3.5 mr-1" />From style profile</>}
          </Button>
          <Button size="sm" className="h-8 text-xs" style={{ backgroundColor: '#C9A96E', color: '#141414' }}
            onClick={() => { resetForm(); setAdding(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
      </div>

      {/* Add / edit form */}
      {adding && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Category (e.g. Kitchen)" value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="text-sm" />
            <Input placeholder="Recommended option (e.g. Quartz)" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="text-sm" />
          </div>
          <Textarea rows={2} placeholder="Short description (optional)" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="text-sm" />
          <Input placeholder="Rendering image URL (optional)" value={form.imageUrl}
            onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} className="text-sm" />
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8 text-xs" style={{ backgroundColor: '#C9A96E', color: '#141414' }} onClick={saveForm}>
              <Check className="h-3.5 w-3.5 mr-1" /> {editingId ? 'Save' : 'Add recommendation'}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetForm}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {recs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          No recommendations yet. {hasQuizAnswers ? 'Generate from the client’s style profile or add one.' : 'Add one, or wait for the client to finish the style quiz.'}
        </p>
      ) : (
        <div className="space-y-2">
          {recs.map(r => {
            const badge = STATUS_BADGE[r.status];
            return (
              <div key={r.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-3">
                <div className="w-14 h-14 rounded-md overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                  {r.status === 'photo_added' && r.clientPhotoUrl ? (
                    <img src={r.clientPhotoUrl} alt="client" className="w-full h-full object-cover" />
                  ) : r.imageUrl ? (
                    <img src={r.imageUrl} alt={r.title} className="w-full h-full object-cover" />
                  ) : (
                    <ImageUp className="h-5 w-5 text-gray-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">{[r.room, r.category].filter(Boolean).join(' · ')}</span>
                    <Badge className={`text-[10px] ${badge.cls}`}>{badge.label}</Badge>
                    {r.source === 'designer' && <Badge className="text-[10px] bg-blue-50 text-blue-600">added by you</Badge>}
                  </div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{r.title}</p>
                  {r.description && <p className="text-xs text-gray-500 leading-snug">{r.description}</p>}
                  {r.status === 'photo_added' && r.clientNote && (
                    <p className="text-xs text-gray-500 italic mt-0.5">Client: “{r.clientNote}”</p>
                  )}
                </div>
                <button onClick={() => startEdit(r)} className="text-gray-400 hover:text-gray-700 shrink-0 p-1" title="Edit">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
