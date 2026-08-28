// Slack-like project chat (Phase 1) on Firestore. Channel list + real-time
// messages + composer. Visibility is by channel membership; this component shows
// the channels the current user is a member of for the given project.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import {
  listenChannels, listenMessages, sendMessage, ensureDefaultChannels,
  loadProjectMembers, notifyMentions,
  type Channel, type ChatMessage, type ChatAttachment, type Member,
} from '@/lib/messaging/firestore';
import { Hash, Send, Loader2, AtSign, Plus, X, Paperclip, Download } from 'lucide-react';
import { createChannel } from '@/lib/messaging/firestore';

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
  const [sendError, setSendError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [mention, setMention] = useState<{ query: string; pos: number } | null>(null);
  const mentionMapRef = useRef<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  // ── New Thread modal state ───────────────────────────────────────────────
  // ── Attachment state ────────────────────────────────────────────────────
  interface PendingFile {
    file: File;
    previewUrl: string | null; // object URL for images
    type: 'image' | 'video';
    progress: number; // 0-100, -1 = error
  }
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop state
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    const newPending: PendingFile[] = arr.map(f => ({
      file: f,
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
      type: f.type.startsWith('image/') ? 'image' : 'video',
      progress: 0,
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setPendingFiles(prev => {
      const next = [...prev];
      const removed = next.splice(idx, 1)[0];
      if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }, []);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => { pendingFiles.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── New Thread modal state ───────────────────────────────────────────────
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadName, setNewThreadName] = useState('');
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const openNewThread = () => {
    setNewThreadName('');
    setSelectedUids(new Set([uid]));
    setCreateError(null);
    setShowNewThread(true);
  };

  const toggleMember = (mUid: string) => {
    if (mUid === uid) return; // current user always included
    setSelectedUids(prev => {
      const next = new Set(prev);
      next.has(mUid) ? next.delete(mUid) : next.add(mUid);
      return next;
    });
  };

  const handleCreateThread = async () => {
    const name = newThreadName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) { setCreateError('Please enter a thread name.'); return; }
    if (!uid) { setCreateError('Not signed in — please refresh.'); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const newId = await createChannel(projectId, name, Array.from(selectedUids), { kind: 'custom', createdBy: uid });
      setShowNewThread(false);
      setActiveId(newId);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create thread.');
    } finally {
      setCreating(false);
    }
  };

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

  // Fetch → Blob → object-URL download so cross-origin Firebase Storage URLs
  // work on mobile browsers (the bare `download` attribute is blocked for
  // cross-origin hrefs on iOS Safari / Android Chrome). This pattern triggers
  // the native save-to-photos / share sheet on both platforms.
  const downloadMedia = async (url: string, filename: string) => {
    try {
      const blob = await fetch(url).then(r => r.blob());
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in new tab so the user can long-press → save on mobile.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const uploadFiles = async (): Promise<ChatAttachment[]> => {
    if (!pendingFiles.length) return [];
    setUploading(true);
    const results: ChatAttachment[] = [];
    for (let i = 0; i < pendingFiles.length; i++) {
      const pf = pendingFiles[i];
      const ts = Date.now();
      const safeName = pf.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `projects/${projectId}/channels/${activeId}/attachments/${ts}_${safeName}`;
      const sRef = storageRef(storage, path);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(sRef, pf.file);
        task.on('state_changed',
          snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            setPendingFiles(prev => prev.map((p, j) => j === i ? { ...p, progress: pct } : p));
          },
          err => { setPendingFiles(prev => prev.map((p, j) => j === i ? { ...p, progress: -1 } : p)); reject(err); },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref);
            results.push({ url, type: pf.type, name: pf.file.name, size: pf.file.size });
            resolve();
          }
        );
      });
    }
    setUploading(false);
    return results;
  };

  const send = async () => {
    if ((!input.trim() && !pendingFiles.length) || !activeId || sending || uploading) return;
    // Guard: uid must be the real Firebase Auth UID. If it's empty/stale, bail
    // with a clear message rather than letting Firestore deny the write silently.
    if (!uid) {
      setSendError('Not signed in — please refresh and try again.');
      return;
    }
    const text = input;
    const mentions = Object.entries(mentionMapRef.current)
      .filter(([name]) => text.includes(`@${name}`))
      .map(([, mUid]) => mUid);
    setSending(true);
    setSendError(null);
    try {
      const attachments = await uploadFiles();
      await sendMessage(projectId, activeId, {
        text, authorUid: uid, authorName: myName, authorRole: myRole,
        ...(mentions.length ? { mentions } : {}),
        ...(attachments.length ? { attachments } : {}),
      });
      if (mentions.length && active) {
        await notifyMentions({
          projectId, channelId: activeId, channelName: active.name,
          mentionUids: mentions, fromUid: uid, fromName: myName, text,
        }).catch(() => {});
      }
      setInput('');
      setPendingFiles([]);
      mentionMapRef.current = {};
    } catch (err: any) {
      console.error('[ProjectChat] sendMessage failed:', err);
      setSendError(err?.code === 'permission-denied'
        ? 'Permission denied — you may not have access to this channel.'
        : (err?.message || 'Failed to send message — please try again.'));
    } finally { setSending(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="flex h-[600px] rounded-xl border border-gray-200 overflow-hidden bg-white">
      {/* Channels */}
      {/* New Thread Modal */}
      {showNewThread && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 font-[Inter,sans-serif]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-[#141414] text-sm">New Thread</h3>
              <button onClick={() => setShowNewThread(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Thread name */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Thread name</label>
                <input
                  autoFocus
                  type="text"
                  value={newThreadName}
                  onChange={e => setNewThreadName(e.target.value.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase())}
                  placeholder="e.g. roofing-crew, tile-selections"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C9A96E]"
                />
              </div>

              {/* Member list */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">Members</label>
                <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                  {members.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-gray-400">No project members found.</p>
                  ) : members.map(m => {
                    const isSelf = m.uid === uid;
                    const checked = selectedUids.has(m.uid);
                    return (
                      <label key={m.uid} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${isSelf ? 'opacity-60 cursor-default' : 'hover:bg-gray-50'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isSelf}
                          onChange={() => toggleMember(m.uid)}
                          className="accent-[#C9A96E] h-3.5 w-3.5 flex-shrink-0"
                        />
                        <span className="flex-1 text-sm text-[#141414] truncate">{m.name}{isSelf ? ' (you)' : ''}</span>
                        {m.role && <span className="text-[10px] uppercase tracking-wide text-gray-400 flex-shrink-0">{m.role}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>

              {createError && <p className="text-[11px] text-red-500">{createError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowNewThread(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-50"
              >Cancel</button>
              <button
                onClick={handleCreateThread}
                disabled={creating || !newThreadName.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-[#C9A96E] text-white hover:bg-[#b8924a] disabled:opacity-40 flex items-center gap-2"
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create Thread
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-52 border-r border-gray-200 bg-gray-50 flex-shrink-0 overflow-y-auto">
        <div className="px-3 py-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Channels</span>
          {isStaff && (
            <button
              onClick={openNewThread}
              title="New thread"
              className="text-gray-400 hover:text-[#C9A96E] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
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
              {m.text ? <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{m.text}</p> : null}
              {m.attachments?.length ? (
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {m.attachments.map((a, ai) => (
                    a.type === 'image' ? (
                      <div key={ai} className="relative group inline-block">
                        <a href={a.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={a.url}
                            alt={a.name}
                            loading="lazy"
                            className="rounded-md border border-gray-200 object-cover cursor-pointer hover:opacity-90 transition-opacity block"
                            style={{ maxWidth: 300, maxHeight: 200 }}
                          />
                        </a>
                        <button
                          type="button"
                          title="Download"
                          onClick={() => downloadMedia(a.url, a.name)}
                          className="absolute bottom-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-black/70"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div key={ai} className="relative group inline-block">
                        <video
                          src={a.url}
                          controls
                          className="rounded-md border border-gray-200 block"
                          style={{ maxWidth: 300 }}
                          title={a.name}
                        />
                        <button
                          type="button"
                          title="Download"
                          onClick={() => downloadMedia(a.url, a.name)}
                          className="absolute bottom-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-black/70"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div
          className={`border-t border-gray-200 p-3 transition-colors ${dragOver ? 'bg-[#C9A96E]/5' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }}
          />

          {/* File preview strip */}
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingFiles.map((pf, i) => (
                <div key={i} className="relative rounded-md border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0" style={{ width: 80, height: 64 }}>
                  {pf.type === 'image' && pf.previewUrl ? (
                    <img src={pf.previewUrl} alt={pf.file.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full px-1">
                      <span className="text-[10px] text-gray-500 truncate w-full text-center">{pf.file.name}</span>
                      <span className="text-[9px] text-gray-400 mt-0.5">{(pf.file.size / 1024 / 1024).toFixed(1)} MB</span>
                    </div>
                  )}
                  {/* Progress overlay */}
                  {pf.progress > 0 && pf.progress < 100 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                      <div className="h-full bg-[#C9A96E] transition-all" style={{ width: `${pf.progress}%` }} />
                    </div>
                  )}
                  {pf.progress === -1 && (
                    <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                      <span className="text-[9px] text-red-600">Error</span>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    disabled={uploading}
                    className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 disabled:opacity-40"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

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
            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!activeId}
              title="Attach photo or video"
              className="h-9 w-9 flex items-center justify-center rounded-md text-gray-400 hover:text-[#C9A96E] disabled:opacity-40 flex-shrink-0 transition-colors"
            >
              <Paperclip className="h-4 w-4" />
            </button>
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
              disabled={(!input.trim() && !pendingFiles.length) || sending || uploading || !activeId}
              className="h-9 w-9 flex items-center justify-center rounded-md bg-[#C9A96E] text-white hover:bg-[#b8924a] disabled:opacity-40 flex-shrink-0"
            >
              {(sending || uploading) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          {sendError && (
            <p className="text-[11px] text-red-500 mt-1">{sendError}</p>
          )}
          {dragOver && (
            <p className="text-[11px] text-[#C9A96E] mt-1">Drop photos or videos to attach</p>
          )}
          <p className="text-[10px] text-gray-400 mt-1">Tag someone with <strong>@</strong> — they're added to this channel and notified. Subs are only pinged when tagged.</p>
        </div>
      </div>
    </div>
  );
}
