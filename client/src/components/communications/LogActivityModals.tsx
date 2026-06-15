// Log a phone call or a meeting into the Communication Center. Both become typed
// threads (kind 'phone_call' / 'meeting') so they're searchable alongside every
// other conversation. Meetings accept audio/video uploads; transcript + AI
// summary are reserved Phase-3 placeholders (not produced here).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  createPhoneCallThread, createMeetingThread, loadSubjectOptions, postMessage,
  type SubjectRef, type SubjectOption, type CommAttachment,
} from '@/lib/communications/firestore';
import { uploadCommAttachment } from '@/lib/communications/upload';
import { X, Loader2, Phone, Video, Paperclip } from 'lucide-react';

function useSubjects(defaultSubject?: SubjectRef) {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [sel, setSel] = useState('');
  useEffect(() => {
    loadSubjectOptions().then(opts => {
      setSubjects(opts);
      setSel(defaultSubject ? `${defaultSubject.type}:${defaultSubject.id}` : (opts[0]?.key || ''));
    });
  }, [defaultSubject]);
  const selected = useMemo(() => subjects.find(s => s.key === sel), [subjects, sel]);
  return { subjects, sel, setSel, selected };
}

function Shell({ title, icon, onClose, children, footer }: any) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#141414] flex items-center gap-2">{icon} {title}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">{footer}</div>
      </div>
    </div>
  );
}

function SubjectSelect({ subjects, sel, setSel }: any) {
  return (
    <div>
      <span className="block text-xs font-medium text-gray-500 mb-1">Subject (lead / client / project)</span>
      <select value={sel} onChange={e => setSel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
        {subjects.length === 0 && <option value="">No subjects found</option>}
        {subjects.map((s: SubjectOption) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]';

export function LogPhoneCallModal({ onClose, onCreated, defaultSubject }: {
  onClose: () => void; onCreated?: (id: string) => void; defaultSubject?: SubjectRef;
}) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Staff';
  const { subjects, sel, setSel, selected } = useSubjects(defaultSubject);
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!selected || !title.trim() || saving) return;
    setSaving(true);
    try {
      const id = await createPhoneCallThread({
        subjectRef: { type: selected.type, id: selected.id },
        subjectLabel: selected.label.replace(/^[^\s]+\s/, ''),
        title,
        participants: participants ? participants.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        occurredAt: when ? new Date(when) : undefined,
        notes: notes || undefined, followUp: followUp || undefined,
        createdBy: uid, createdByName: myName,
      });
      onCreated?.(id); onClose();
    } finally { setSaving(false); }
  };

  return (
    <Shell title="Log phone call" icon={<Phone className="h-4 w-4 text-[#C9A96E]" />} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
        <button onClick={submit} disabled={!selected || !title.trim() || saving}
                className="px-4 py-2 text-sm bg-[#C9A96E] text-white rounded-md hover:bg-[#b8924a] disabled:opacity-40 inline-flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Log call
        </button>
      </>}>
      <SubjectSelect subjects={subjects} sel={sel} setSel={setSel} />
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Call subject (e.g. Pool finish discussion)" className={inputCls} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="block text-xs font-medium text-gray-500 mb-1">When</span>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={inputCls} />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-500 mb-1">Participants</span>
          <input value={participants} onChange={e => setParticipants(e.target.value)} placeholder="comma, separated" className={inputCls} />
        </div>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Call notes" rows={3} className={inputCls} />
      <input value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="Follow-up (optional)" className={inputCls} />
    </Shell>
  );
}

export function LogMeetingModal({ onClose, onCreated, defaultSubject }: {
  onClose: () => void; onCreated?: (id: string) => void; defaultSubject?: SubjectRef;
}) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Staff';
  const { subjects, sel, setSel, selected } = useSubjects(defaultSubject);
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [when, setWhen] = useState(new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!selected || !title.trim() || saving) return;
    setSaving(true);
    try {
      // Create the record first so uploads have a home, then attach recordings.
      const id = await createMeetingThread({
        subjectRef: { type: selected.type, id: selected.id },
        subjectLabel: selected.label.replace(/^[^\s]+\s/, ''),
        title,
        participants: participants ? participants.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        occurredAt: when ? new Date(when) : undefined,
        notes: notes || undefined,
        createdBy: uid, createdByName: myName,
      });
      if (files.length) {
        const atts: CommAttachment[] = [];
        for (const f of files) atts.push(await uploadCommAttachment(id, f));
        await postMessage(id, {
          text: '', authorUid: uid, authorName: myName, type: 'meeting_record',
          sourceType: 'meeting_note', source: 'meeting', senderType: 'internal', attachments: atts,
        });
      }
      onCreated?.(id); onClose();
    } finally { setSaving(false); }
  };

  return (
    <Shell title="Meeting record" icon={<Video className="h-4 w-4 text-[#C9A96E]" />} onClose={onClose}
      footer={<>
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
        <button onClick={submit} disabled={!selected || !title.trim() || saving}
                className="px-4 py-2 text-sm bg-[#C9A96E] text-white rounded-md hover:bg-[#b8924a] disabled:opacity-40 inline-flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save record
        </button>
      </>}>
      <SubjectSelect subjects={subjects} sel={sel} setSel={setSel} />
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title" className={inputCls} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="block text-xs font-medium text-gray-500 mb-1">When</span>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className={inputCls} />
        </div>
        <div>
          <span className="block text-xs font-medium text-gray-500 mb-1">Participants</span>
          <input value={participants} onChange={e => setParticipants(e.target.value)} placeholder="comma, separated" className={inputCls} />
        </div>
      </div>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Meeting notes" rows={3} className={inputCls} />
      <div>
        <input ref={fileRef} type="file" multiple accept="audio/*,video/*" className="hidden"
               onChange={e => setFiles(Array.from(e.target.files || []))} />
        <button onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">
          <Paperclip className="h-4 w-4" /> Attach audio / video {files.length ? `(${files.length})` : ''}
        </button>
        <p className="text-[10px] text-gray-400 mt-1">Transcript &amp; AI summary are reserved for a later phase.</p>
      </div>
    </Shell>
  );
}
