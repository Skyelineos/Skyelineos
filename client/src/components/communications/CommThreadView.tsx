// Communication Center — single-thread view: message stream + composer.
// Adapted from the project-channels ProjectChat composer (@mention tagging +
// notifications fan-out), extended with attachment upload and a visibility badge.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  listenMessages, postMessage, notifyThreadMentions, loadSubjectMembers,
  CATEGORY_LABELS,
  type CommThread, type CommMessage, type CommMember, type CommAttachment,
} from '@/lib/communications/firestore';
import { uploadCommAttachment } from '@/lib/communications/upload';
import { ThreadToolsBar } from './ThreadToolsBar';
import {
  Send, Loader2, AtSign, Paperclip, X, FileText, Lock, Users, Hammer, Eye, Phone, Video,
} from 'lucide-react';

function fmtTime(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const VIS_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  internal:   { label: 'Internal only', cls: 'bg-gray-100 text-gray-600', icon: Lock },
  client:     { label: 'Client visible', cls: 'bg-emerald-50 text-emerald-700', icon: Eye },
  trade:      { label: 'Trade visible',  cls: 'bg-amber-50 text-amber-700', icon: Hammer },
  restricted: { label: 'Restricted',     cls: 'bg-rose-50 text-rose-700', icon: Users },
};

export function CommThreadView({ thread }: { thread: CommThread }) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Me';
  const myRole = (user as any)?.role;

  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<CommMember[]>([]);
  const [mention, setMention] = useState<{ query: string; pos: number } | null>(null);
  const [pending, setPending] = useState<CommAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const mentionMapRef = useRef<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMessages([]); return listenMessages(thread.id, setMessages); }, [thread.id]);
  useEffect(() => { loadSubjectMembers(thread.subjectRef).then(setMembers).catch(() => {}); }, [thread.subjectRef]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const mentionMatches = mention
    ? members.filter(m => m.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

  const onInput = (val: string, caret: number) => {
    setInput(val);
    const before = val.slice(0, caret);
    const m = before.match(/@([\w]*)$/);
    setMention(m ? { query: m[1], pos: caret - m[0].length } : null);
  };

  const pickMention = (m: CommMember) => {
    const before = input.slice(0, mention?.pos ?? input.length);
    const after = input.slice(mention?.pos ?? input.length).replace(/^@[\w]*/, '');
    setInput(`${before}@${m.name} ${after}`);
    mentionMapRef.current[m.name] = m.uid;
    setMention(null);
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const att = await uploadCommAttachment(thread.id, f, setUploadPct);
        setPending(p => [...p, att]);
      }
    } catch { /* surfaced by the disabled state */ } finally {
      setUploading(false); setUploadPct(0);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async () => {
    if ((!input.trim() && pending.length === 0) || sending) return;
    const text = input;
    const mentions = Object.entries(mentionMapRef.current)
      .filter(([name]) => text.includes(`@${name}`))
      .map(([, mUid]) => mUid);
    setSending(true);
    try {
      await postMessage(thread.id, {
        text, authorUid: uid, authorName: myName, authorRole: myRole,
        ...(mentions.length ? { mentions } : {}),
        ...(pending.length ? { attachments: pending } : {}),
      });
      if (mentions.length) {
        await notifyThreadMentions({
          threadId: thread.id, threadTitle: thread.title,
          mentionUids: mentions, fromUid: uid, fromName: myName, text,
        }).catch(() => {});
      }
      setInput(''); setPending([]); mentionMapRef.current = {};
    } finally { setSending(false); }
  };

  const vis = VIS_BADGE[thread.visibility] || VIS_BADGE.internal;
  const VisIcon = vis.icon;

  const attachmentTile = (a: CommAttachment, key: string) => {
    const isImg = (a.contentType || '').startsWith('image/');
    const isVid = (a.contentType || '').startsWith('video/');
    if (isImg) return <a key={key} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="max-h-44 rounded-md border border-gray-200" /></a>;
    if (isVid) return <video key={key} src={a.url} controls className="max-h-44 rounded-md border border-gray-200"><track kind="captions" /></video>;
    return (
      <a key={key} href={a.url} target="_blank" rel="noreferrer"
         className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100">
        <FileText className="h-4 w-4 text-gray-400" /> <span className="truncate max-w-[180px]">{a.name}</span>
      </a>
    );
  };

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#141414] truncate">{thread.title}</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ${vis.cls}`}>
              <VisIcon className="h-3 w-3" /> {vis.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate flex items-center gap-1">
            {thread.kind === 'phone_call' && <Phone className="h-3 w-3" />}
            {thread.kind === 'meeting' && <Video className="h-3 w-3" />}
            {CATEGORY_LABELS[thread.category]} · {thread.subjectLabel || `${thread.subjectRef.type} ${thread.subjectRef.id.slice(0, 6)}`}
            {thread.kind !== 'thread' ? ` · ${thread.kind.replace('_', ' ')}` : ''}
            {thread.participants?.length ? ` · ${thread.participants.join(', ')}` : ''}
          </p>
        </div>
      </div>

      <ThreadToolsBar thread={thread} />

      {/* Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center mt-8">No messages yet. Start the conversation 👋</p>
        ) : messages.map(m => (
          <div key={m.id} className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm text-[#141414]">{m.authorName}</span>
              {m.source === 'ai' && <span className="text-[10px] uppercase tracking-wide text-[#C9A96E]">AI</span>}
              <span className="text-[11px] text-gray-400">{fmtTime(m.createdAt)}</span>
            </div>
            {m.text && <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{m.text}</p>}
            {!!m.attachments?.length && (
              <div className="flex flex-wrap gap-2 mt-1.5">{m.attachments.map((a, i) => attachmentTile(a, `${m.id}-${i}`))}</div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-gray-200 p-3">
        {!!pending.length && (
          <div className="flex flex-wrap gap-2 mb-2">
            {pending.map((a, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-700">
                <FileText className="h-3 w-3 text-gray-400" /> <span className="truncate max-w-[140px]">{a.name}</span>
                <button onClick={() => setPending(p => p.filter((_, j) => j !== i))}><X className="h-3 w-3 text-gray-400 hover:text-gray-600" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="relative flex items-end gap-2">
          {mention && mentionMatches.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto z-50">
              {mentionMatches.map(m => (
                <button key={m.uid} type="button"
                        onMouseDown={e => { e.preventDefault(); pickMention(m); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <AtSign className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                  <span className="font-medium text-gray-700 truncate">{m.name}</span>
                  {m.trade && <span className="text-[11px] text-gray-400 truncate">· {m.trade}</span>}
                  {m.role && <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-300 flex-shrink-0">{m.role}</span>}
                </button>
              ))}
            </div>
          )}
          <input ref={fileRef} type="file" multiple className="hidden"
                 onChange={e => onPickFiles(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="h-9 w-9 flex items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 disabled:opacity-40 flex-shrink-0"
                  title="Attach a file">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <textarea
            value={input}
            onChange={e => onInput(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={e => {
              if (mention && mentionMatches.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickMention(mentionMatches[0]); return; }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              if (e.key === 'Escape') setMention(null);
            }}
            placeholder="Write a message  ·  @ to tag"
            rows={1}
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E] max-h-32"
          />
          <button onClick={send} disabled={(!input.trim() && pending.length === 0) || sending}
                  className="h-9 w-9 flex items-center justify-center rounded-md bg-[#C9A96E] text-white hover:bg-[#b8924a] disabled:opacity-40 flex-shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {uploading && <div className="mt-1 h-1 w-full bg-gray-100 rounded"><div className="h-1 bg-[#C9A96E] rounded" style={{ width: `${uploadPct}%` }} /></div>}
        <p className="text-[10px] text-gray-400 mt-1">Tag someone with <strong>@</strong> — they're added to this thread and notified.</p>
      </div>
    </div>
  );
}
