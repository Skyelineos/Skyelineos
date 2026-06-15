// Create an action item out of a conversation (Phase 2 — manual only).
// Pre-links to the source thread so it's always traceable. Assignment uses the
// thread's resolved members; the Schedule/Tasks/AI links are Phase-3 hooks.

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createActionItem } from '@/lib/communications/actionItems';
import { loadSubjectMembers, type CommThread, type CommMember } from '@/lib/communications/firestore';
import { X, Loader2 } from 'lucide-react';

export function CreateActionItemModal({ thread, onClose }: { thread: CommThread; onClose: () => void }) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Staff';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [members, setMembers] = useState<CommMember[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadSubjectMembers(thread.subjectRef).then(setMembers).catch(() => {}); }, [thread.subjectRef]);

  const submit = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const m = members.find(x => x.uid === assignee);
      await createActionItem({
        title, description: description || undefined,
        assignedToUid: assignee || undefined, assignedToName: m?.name,
        dueDate: dueDate || undefined,
        projectId: thread.subjectRef.type === 'project' ? thread.subjectRef.id : undefined,
        clientId: thread.subjectRef.type !== 'project' ? thread.subjectRef.id : undefined,
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
          <h2 className="font-semibold text-[#141414]">New action item</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-5 space-y-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to happen?"
                 className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]" />
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Details (optional)" rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1">Assign to</span>
              <select value={assignee} onChange={e => setAssignee(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white">
                <option value="">— Unassigned —</option>
                {members.map(m => <option key={m.uid} value={m.uid}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <span className="block text-xs font-medium text-gray-500 mb-1">Due date</span>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
          </div>
          <p className="text-[10px] text-gray-400">Linked to this conversation. Schedule / Tasks / AI links arrive in a later phase.</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Cancel</button>
          <button onClick={submit} disabled={!title.trim() || saving}
                  className="px-4 py-2 text-sm bg-[#C9A96E] text-white rounded-md hover:bg-[#b8924a] disabled:opacity-40 inline-flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
