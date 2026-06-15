// Communication Center — create a new thread against any lifecycle subject
// (lead / client / project). The subject is what lets a conversation start at
// the lead stage and carry forward; for a project we also pre-seed the member
// list so the right people see it immediately.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  createThread, loadSubjectMembers, loadSubjectOptions,
  COMM_CATEGORIES, CATEGORY_LABELS,
  type CommCategory, type Visibility, type SubjectRef, type SubjectOption,
} from '@/lib/communications/firestore';
import { X, Loader2 } from 'lucide-react';

const VIS_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'internal', label: 'Internal only' },
  { value: 'client', label: 'Client visible' },
  { value: 'trade', label: 'Trade visible' },
  { value: 'restricted', label: 'Restricted' },
];

export function NewThreadModal({ onClose, onCreated, defaultSubject }: {
  onClose: () => void;
  onCreated: (threadId: string) => void;
  defaultSubject?: SubjectRef;
}) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Me';

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectKeySel, setSubjectKeySel] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CommCategory>('general');
  const [visibility, setVisibility] = useState<Visibility>('internal');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSubjectOptions().then(opts => {
      setSubjects(opts);
      if (defaultSubject) setSubjectKeySel(`${defaultSubject.type}:${defaultSubject.id}`);
      else setSubjectKeySel(prev => prev || opts[0]?.key || '');
    });
  }, [defaultSubject]);

  const selected = useMemo(() => subjects.find(s => s.key === subjectKeySel), [subjects, subjectKeySel]);

  const submit = async () => {
    if (!selected || !title.trim() || saving) return;
    setSaving(true);
    try {
      const subjectRef: SubjectRef = { type: selected.type, id: selected.id };
      // Seed members: creator + people resolved from the subject so the thread
      // is visible to the right audience straight away.
      let members = [uid];
      try { members = [uid, ...(await loadSubjectMembers(subjectRef)).map(m => m.uid)]; } catch { /* ignore */ }
      const id = await createThread({
        subjectRef,
        subjectLabel: selected.label.replace(/^[^\s]+\s/, ''), // strip leading emoji
        title, category, visibility,
        memberUids: members,
        createdBy: uid, createdByName: myName,
      });
      onCreated(id);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#141414]">New conversation</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <span className="block text-xs font-medium text-gray-500 mb-1">Subject (lead / client / project)</span>
            <select value={subjectKeySel} onChange={e => setSubjectKeySel(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
              {subjects.length === 0 && <option value="">No subjects found</option>}
              {subjects.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-xs font-medium text-gray-500 mb-1">Title</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kitchen cabinet selection"
                   className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1">Category</span>
              <select value={category} onChange={e => setCategory(e.target.value as CommCategory)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
                {COMM_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1">Visibility</span>
              <select value={visibility} onChange={e => setVisibility(e.target.value as Visibility)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
                {VIS_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
          <button onClick={submit} disabled={!selected || !title.trim() || saving}
                  className="px-4 py-2 text-sm bg-[#C9A96E] text-white rounded-md hover:bg-[#b8924a] disabled:opacity-40 inline-flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
