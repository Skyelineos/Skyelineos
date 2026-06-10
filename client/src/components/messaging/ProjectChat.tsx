// Slack-like project chat (Phase 1) on Firestore. Channel list + real-time
// messages + composer. Visibility is by channel membership; this component shows
// the channels the current user is a member of for the given project.

import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import {
  listenChannels, listenMessages, sendMessage, ensureDefaultChannels,
  loadProjectMembers, notifyMentions,
  type Channel, type ChatMessage, type Member,
} from '@/lib/messaging/firestore';
import { Hash, Send, Loader2, AtSign } from 'lucide-react';

function fmtTime(ts: any): string {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  if (!d) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ProjectChat({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const uid = (user as any)?.firebaseUid || (user as any)?.id?.toString() || '';
  const myName = (user as any)?.name || (user as any)?.email || 'Me';
  const myRole = (user as any)?.role;
  const isStaff = myRole === 'gc' || myRole === 'admin' || myRole === 'projectManager';

  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [mention, setMention] = useState<{ query: string; pos: number } | null>(null);
  const mentionMapRef = useRef<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (projectId) loadProjectMembers(projectId).then(setMembers).catch(() => {}); }, [projectId]);

  const mentionMatches = mention
    ? members.filter(m => m.name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

  const onInput = (val: string, caret: number) => {
    setInput(val);
    const before = val.slice(0, caret);
    const m = before.match(/@([\w]*)$/);
    setMention(m ? { query: m[1], pos: caret - m[0].length } : null);
  };

  const pickMention = (m: Member) => {
    const before = input.slice(0, mention?.pos ?? input.length);
    const after = input.slice(mention?.pos ?? input.length).replace(/^@[\w]*/, '');
    setInput(`${before}@${m.name} ${after}`);
    mentionMapRef.current[m.name] = m.uid;
    setMention(null);
  };

  // Seed default channels once (GC/admin only — they're the project owner) then listen.
  useEffect(() => {
    if (!projectId) return;
    let unsub = () => {};
    (async () => {
      try {
        if (isStaff) {
          const snap = await getDoc(doc(db, 'projects', projectId));
          const p = (snap.data() as any) || {};
          // Classify members so subs are NOT auto-added to default channels
          // (they only appear when @tagged); GC/designer = team, owner = client.
          const mem = await loadProjectMembers(projectId);
          const isSub = (r?: string) => /sub/i.test(r || '');
          const isClientRole = (r?: string) => /client|owner|home/i.test(r || '');
          const team = [uid, ...mem.filter(m => !isSub(m.role) && !isClientRole(m.role)).map(m => m.uid)];
          const clients = [p.clientId, ...mem.filter(m => isClientRole(m.role)).map(m => m.uid)].filter(Boolean);
          await ensureDefaultChannels(projectId, team, clients, uid).catch(() => {});
        }
      } catch { /* ignore */ }
      unsub = listenChannels(projectId, rows => {
        // Only channels the user can see (rules also enforce this).
        const visible = isStaff ? rows : rows.filter(c => (c.memberUids || []).includes(uid));
        setChannels(visible);
        setActiveId(prev => prev || visible[0]?.id || '');
        setLoading(false);
      });
    })();
    return () => unsub();
  }, [projectId, uid, isStaff]);

  // Listen to the active channel's messages.
  useEffect(() => {
    if (!projectId || !activeId) { setMessages([]); return; }
    return listenMessages(projectId, activeId, rows => setMessages(rows));
  }, [projectId, activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const active = useMemo(() => channels.find(c => c.id === activeId), [channels, activeId]);

  const send = async () => {
    if (!input.trim() || !activeId || sending) return;
    const text = input;
    const mentions = Object.entries(mentionMapRef.current)
      .filter(([name]) => text.includes(`@${name}`))
      .map(([, mUid]) => mUid);
    setSending(true);
    try {
      await sendMessage(projectId, activeId, {
        text, authorUid: uid, authorName: myName, authorRole: myRole,
        ...(mentions.length ? { mentions } : {}),
      });
      if (mentions.length && active) {
        await notifyMentions({
          projectId, channelId: activeId, channelName: active.name,
          mentionUids: mentions, fromUid: uid, fromName: myName, text,
        }).catch(() => {});
      }
      setInput('');
      mentionMapRef.current = {};
    } finally { setSending(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="flex h-[600px] rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Channels */}
      <div className="w-52 border-r border-gray-200 bg-gray-50 flex-shrink-0 overflow-y-auto">
        <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Channels</div>
        {channels.length === 0 ? (
          <p className="px-3 text-xs text-gray-400">No channels yet.</p>
        ) : channels.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
              c.id === activeId ? 'bg-[#C9A96E]/15 text-[#141414] font-medium' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Hash className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <Hash className="h-4 w-4 text-gray-400" />
          <span className="font-semibold text-sm text-[#141414]">{active?.name || '—'}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center mt-8">No messages yet. Say hello 👋</p>
          ) : messages.map(m => (
            <div key={m.id} className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-sm text-[#141414]">{m.authorName}</span>
                <span className="text-[11px] text-gray-400">{fmtTime(m.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{m.text}</p>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 p-3">
          <div className="relative flex items-end gap-2">
            {mention && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-auto z-50">
                {mentionMatches.map(m => (
                  <button
                    key={m.uid}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); pickMention(m); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <AtSign className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-700 truncate">{m.name}</span>
                    {m.trade && <span className="text-[11px] text-gray-400 truncate">· {m.trade}</span>}
                    {m.role && <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-300 flex-shrink-0">{m.role}</span>}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={input}
              onChange={e => onInput(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onKeyDown={e => {
                if (mention && mentionMatches.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); pickMention(mentionMatches[0]); return; }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                if (e.key === 'Escape') setMention(null);
              }}
              placeholder={active ? `Message #${active.name}  ·  @ to tag` : 'Select a channel'}
              rows={1}
              disabled={!activeId}
              className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E] max-h-32"
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending || !activeId}
              className="h-9 w-9 flex items-center justify-center rounded-md bg-[#C9A96E] text-white hover:bg-[#b8924a] disabled:opacity-40 flex-shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Tag someone with <strong>@</strong> — they're added to this channel and notified. Subs are only pinged when tagged.</p>
        </div>
      </div>
    </div>
  );
}
