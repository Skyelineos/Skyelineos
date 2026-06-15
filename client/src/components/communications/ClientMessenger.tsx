// ClientMessenger — the homeowner's messaging experience. Deliberately as simple
// as iMessage/WhatsApp: no thread picker, no categories, no dropdowns. The client
// types, optionally attaches a photo/video/doc, and presses Send. Everything goes
// into their project's General thread (created on first use). Mobile-first.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase';
import {
  ensureSubjectThread, listenMessages, postMessage,
  type CommMessage, type CommAttachment,
} from '@/lib/communications/firestore';
import { uploadCommAttachment } from '@/lib/communications/upload';
import { Send, Loader2, ImagePlus, Camera, Video, Paperclip, X, FileText } from 'lucide-react';

function fmtTime(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ClientMessenger({ projectId, projectName, clientUid }: {
  projectId: string;
  projectName?: string;
  clientUid?: string;
}) {
  const { user } = useAuth();
  // The Firebase AUTH uid is what the Firestore rules check (request.auth.uid in
  // memberUids), so resolve it directly rather than a contact id.
  const uid = auth.currentUser?.uid || clientUid || (user as any)?.firebaseUid || '';
  const myName = (user as any)?.name || (user as any)?.email || 'You';
  const myRole = (user as any)?.role;

  const [threadId, setThreadId] = useState('');
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<CommAttachment[]>([]);
  const [booting, setBooting] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [sending, setSending] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Get-or-create the project's General thread for this client.
  useEffect(() => {
    if (!projectId || !uid) return;
    let cancelled = false;
    setBooting(true);
    ensureSubjectThread({
      subjectRef: { type: 'project', id: projectId },
      subjectLabel: projectName,
      category: 'general', visibility: 'client',
      seedMemberUids: [uid], createdBy: uid, createdByName: myName,
    }).then(id => { if (!cancelled) { setThreadId(id); setBooting(false); } })
      .catch(() => { if (!cancelled) setBooting(false); });
    return () => { cancelled = true; };
  }, [projectId, uid]);

  useEffect(() => { if (!threadId) return; return listenMessages(threadId, setMessages); }, [threadId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, pending]);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !threadId) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const att = await uploadCommAttachment(threadId, f, setUploadPct);
        setPending(p => [...p, att]);
      }
    } catch { /* ignore */ } finally { setUploading(false); setUploadPct(0); }
  };

  const send = async () => {
    if ((!input.trim() && pending.length === 0) || sending || !threadId) return;
    setSending(true);
    try {
      await postMessage(threadId, {
        text: input, authorUid: uid, authorName: myName, authorRole: myRole,
        senderType: 'client', ...(pending.length ? { attachments: pending } : {}),
      });
      setInput(''); setPending([]);
    } finally { setSending(false); }
  };

  const isMine = (m: CommMessage) => m.authorUid === uid;

  const tile = (a: CommAttachment, key: string, mine: boolean) => {
    const t = a.contentType || '';
    if (t.startsWith('image/')) return <a key={key} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-52 rounded-lg" /></a>;
    if (t.startsWith('video/')) return <video key={key} src={a.url} controls className="max-h-52 rounded-lg"><track kind="captions" /></video>;
    return <a key={key} href={a.url} target="_blank" rel="noreferrer"
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${mine ? 'bg-white/20 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
             <FileText className="h-4 w-4" /> <span className="truncate max-w-[160px]">{a.name}</span></a>;
  };

  if (booting) return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="flex flex-col h-[70vh] sm:h-[600px] rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-white">
        <p className="font-semibold text-[#141414]">Messages</p>
        <p className="text-xs text-gray-400">{projectName || 'Your project'} · we usually reply within a day</p>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center mt-10">Say hi 👋 — send a message, photo, or video about your home.</p>
        ) : messages.map(m => {
          const mine = isMine(m);
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? 'bg-[#C9A96E] text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                {!mine && <p className="text-[11px] font-semibold text-gray-500 mb-0.5">{m.authorName}</p>}
                {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                {!!m.attachments?.length && <div className="flex flex-col gap-1.5 mt-1.5">{m.attachments.map((a, i) => tile(a, `${m.id}-${i}`, mine))}</div>}
                <p className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-gray-400'}`}>{fmtTime(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 bg-white p-2 sm:p-3">
        {!!pending.length && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pending.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-700">
                <FileText className="h-3 w-3 text-gray-400" /> <span className="truncate max-w-[120px]">{a.name}</span>
                <button onClick={() => setPending(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3 text-gray-400" /></button>
              </span>
            ))}
          </div>
        )}
        {uploading && <div className="mb-2 h-1 w-full bg-gray-100 rounded"><div className="h-1 bg-[#C9A96E] rounded" style={{ width: `${uploadPct}%` }} /></div>}
        <div className="flex items-end gap-1.5">
          {/* Hidden inputs: photo library, camera, video, document */}
          <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => addFiles(e.target.files)} />
          <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={e => addFiles(e.target.files)} />
          <input ref={docRef} type="file" className="hidden" onChange={e => addFiles(e.target.files)} />

          <div className="flex items-center">
            <button onClick={() => photoRef.current?.click()} title="Photo" className="h-10 w-10 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><ImagePlus className="h-5 w-5" /></button>
            <button onClick={() => cameraRef.current?.click()} title="Camera" className="h-10 w-10 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hidden sm:flex"><Camera className="h-5 w-5" /></button>
            <button onClick={() => videoRef.current?.click()} title="Video" className="h-10 w-10 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><Video className="h-5 w-5" /></button>
            <button onClick={() => docRef.current?.click()} title="Attach a file" className="h-10 w-10 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><Paperclip className="h-5 w-5" /></button>
          </div>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E] max-h-32"
          />
          <button onClick={send} disabled={(!input.trim() && pending.length === 0) || sending}
                  className="h-10 w-10 flex items-center justify-center rounded-full bg-[#C9A96E] text-white hover:bg-[#b8924a] disabled:opacity-40 flex-shrink-0">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
