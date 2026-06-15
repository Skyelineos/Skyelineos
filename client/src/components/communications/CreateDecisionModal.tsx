// Record a client decision from a conversation (Phase 2). Links back to the
// source thread; related room / selection / trade are free-text/id hooks that can
// be deep-linked in a later phase.

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createDecision } from '@/lib/communications/decisions';
import type { CommThread } from '@/lib/communications/firestore';
import { X, Loader2 } from 'lucide-react';

export function CreateDecisionModal({ thread, onClose }: { thread: CommThread; onClose: () => void }) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Staff';

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [decidedOn, setDecidedOn] = useState(new Date().toISOString().slice(0, 10));
  const [room, setRoom] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await createDecision({
        title, summary: summary || undefined, decidedOn: decidedOn || undefined,
        projectId: thread.subjectRef.type === 'project' ? thread.subjectRef.id : undefined,
        clientId: thread.subjectRef.type !== 'project' ? thread.subjectRef.id : undefined,
        relatedRoom: room || undefined,
        sourceThreadId: thread.id,
        createdBy: uid, createdByName: myName,
      });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-[#141414]">Log client decision</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Cabinet selection approved"
                 className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]" />
          <textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="What was decided (optional)" rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1">Decided on</span>
              <input type="date" value={decidedOn} onChange={e => setDecidedOn(e.target.value)}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1">Related room</span>
              <input value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. Kitchen"
                     className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400">Traceable to this conversation. Selection / trade deep-links arrive later.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
          <button onClick={submit} disabled={!title.trim() || saving}
                  className="px-4 py-2 text-sm bg-[#C9A96E] text-white rounded-md hover:bg-[#b8924a] disabled:opacity-40 inline-flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
