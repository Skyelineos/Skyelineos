// A modal wrapper that hosts the CommunicationPanel scoped to one subject. Used
// from the contact detail view and the Sales lead cards so a GC can open all of a
// client/lead's communication without leaving the page.

import { CommunicationPanel } from './CommunicationPanel';
import type { SubjectRef } from '@/lib/communications/firestore';
import { X } from 'lucide-react';

export function CommunicationDrawer({ subjectRef, subjectLabel, onClose }: {
  subjectRef: SubjectRef;
  subjectLabel?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-[#141414]">Communication</h2>
            {subjectLabel && <p className="text-xs text-gray-400">{subjectLabel}</p>}
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="p-4">
          <CommunicationPanel subjectFilter={subjectRef} subjectLabel={subjectLabel} height="h-[70vh]" />
        </div>
      </div>
    </div>
  );
}
