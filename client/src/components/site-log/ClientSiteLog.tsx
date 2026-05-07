import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { PhotoAnnotator } from './PhotoAnnotator';
import {
  Camera, Video, FileText, Plus, X, Pencil, Loader2, Clock, CheckCircle2, User,
} from 'lucide-react';

interface ClientSiteLogProps {
  projectId: string;
  clientId: string;
}

interface LogEntry {
  id: string;
  type: 'photo' | 'video' | 'note';
  localUrl?: string;
  annotatedDataUrl?: string;
  file?: File;
  comment: string;
}

interface SiteLogDoc {
  id: string;
  title: string;
  createdByName: string;
  createdByRole?: string;
  createdAt: Timestamp | null;
  status: 'open' | 'resolved';
  entryCount: number;
}

function nanoid() { return Math.random().toString(36).slice(2, 10); }

function formatDate(ts: Timestamp | null) {
  if (!ts) return '';
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ClientSiteLog({ projectId, clientId }: ClientSiteLogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [logs, setLogs] = useState<SiteLogDoc[]>([]);
  const [creating, setCreating] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [annotatingId, setAnnotatingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Load this client's logs for this project
  useEffect(() => {
    if (!projectId || !clientId) return;
    const q = query(
      collection(db, 'siteLogs'),
      where('projectId', '==', projectId),
      where('createdBy', '==', clientId),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SiteLogDoc)));
    }, () => {});
  }, [projectId, clientId]);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEntries(prev => [...prev, { id: nanoid(), type: 'photo', localUrl: URL.createObjectURL(file), file, comment: '' }]);
    e.target.value = '';
  };

  const handleVideoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEntries(prev => [...prev, { id: nanoid(), type: 'video', localUrl: URL.createObjectURL(file), file, comment: '' }]);
    e.target.value = '';
  };

  const removeEntry = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));
  const updateEntry = (id: string, patch: Partial<LogEntry>) => setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const handleSave = async () => {
    if (entries.length === 0) {
      toast({ title: 'Add at least one photo, video, or note', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const logRef = await addDoc(collection(db, 'siteLogs'), {
        projectId,
        projectName: '',
        title: `Client Observation – ${new Date().toLocaleDateString()}`,
        createdBy: clientId,
        createdByName: user?.name || 'Client',
        createdByRole: 'client',
        createdAt: serverTimestamp(),
        status: 'open',
        entryCount: entries.length,
      });

      for (const entry of entries) {
        let mediaUrl = '';
        if ((entry.type === 'photo' || entry.type === 'video') && entry.file) {
          const ext = entry.file.name.split('.').pop() || (entry.type === 'photo' ? 'jpg' : 'mp4');
          const path = `site-logs/${projectId}/${logRef.id}/${entry.id}.${ext}`;
          const snap = await uploadBytes(storageRef(storage, path), entry.file);
          mediaUrl = await getDownloadURL(snap.ref);
        } else if (entry.type === 'photo' && entry.annotatedDataUrl) {
          const res = await fetch(entry.annotatedDataUrl);
          const blob = await res.blob();
          const path = `site-logs/${projectId}/${logRef.id}/${entry.id}-annotated.jpg`;
          const snap = await uploadBytes(storageRef(storage, path), blob);
          mediaUrl = await getDownloadURL(snap.ref);
        }
        await addDoc(collection(db, 'siteLogs', logRef.id, 'entries'), {
          id: entry.id,
          type: entry.type,
          mediaUrl: mediaUrl || entry.annotatedDataUrl || '',
          comment: entry.comment,
        });
      }

      toast({ title: 'Observation logged', description: 'Your team has been notified.' });
      setEntries([]);
      setCreating(false);
    } catch (err) {
      toast({ title: 'Failed to save', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const annotatingEntry = annotatingId ? entries.find(e => e.id === annotatingId) : null;

  if (annotatingEntry) {
    return (
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Annotate Photo</h3>
        <PhotoAnnotator
          imageUrl={annotatingEntry.localUrl!}
          onDone={dataUrl => { updateEntry(annotatingEntry.id, { annotatedDataUrl: dataUrl }); setAnnotatingId(null); }}
          onCancel={() => setAnnotatingId(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Site Observations</h2>
          <p className="text-xs text-gray-500 mt-0.5">Log anything you notice on site — your team will review it</p>
        </div>
        {!creating && (
          <Button
            size="sm"
            onClick={() => setCreating(true)}
            style={{ backgroundColor: '#C9A96E', color: '#141414', fontWeight: 600 }}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New Observation
          </Button>
        )}
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-800">New Observation</p>
            <button onClick={() => { setCreating(false); setEntries([]); }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:border-amber-400 transition-colors"
            >
              <Camera className="w-4 h-4 text-amber-600" /> Photo
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:border-amber-400 transition-colors"
            >
              <Video className="w-4 h-4 text-blue-600" /> Video
            </button>
            <button
              onClick={() => setEntries(prev => [...prev, { id: nanoid(), type: 'note', comment: '' }])}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:border-amber-400 transition-colors"
            >
              <FileText className="w-4 h-4 text-gray-500" /> Note
            </button>
          </div>

          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
          <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoCapture} />

          {entries.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Tap a button above to add items</p>
          )}

          {entries.map((entry, idx) => (
            <div key={entry.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-600 capitalize">{entry.type} {idx + 1}
                  {entry.annotatedDataUrl && <span className="text-amber-600 ml-1">· annotated</span>}
                </span>
                <button onClick={() => removeEntry(entry.id)} className="text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="p-3 space-y-2">
                {entry.type === 'photo' && (entry.annotatedDataUrl || entry.localUrl) && (
                  <div className="relative rounded overflow-hidden">
                    <img src={entry.annotatedDataUrl || entry.localUrl} alt="" className="w-full object-contain max-h-48" />
                    <button
                      onClick={() => setAnnotatingId(entry.id)}
                      className="absolute bottom-1.5 right-1.5 flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white text-xs hover:bg-black/80"
                    >
                      <Pencil className="w-3 h-3" /> {entry.annotatedDataUrl ? 'Re-annotate' : 'Annotate'}
                    </button>
                  </div>
                )}
                {entry.type === 'video' && entry.localUrl && (
                  <video src={entry.localUrl} controls className="w-full rounded max-h-40" />
                )}
                <Textarea
                  placeholder="Describe what you see…"
                  value={entry.comment}
                  onChange={e => updateEntry(entry.id, { comment: e.target.value })}
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            </div>
          ))}

          {entries.length > 0 && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setCreating(false); setEntries([]); }}>Cancel</Button>
              <Button
                size="sm"
                disabled={saving}
                onClick={handleSave}
                style={{ backgroundColor: '#C9A96E', color: '#141414', fontWeight: 600 }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {saving ? 'Submitting…' : `Submit (${entries.length} item${entries.length !== 1 ? 's' : ''})`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Past logs */}
      {logs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Your Observations</p>
          {logs.map(log => (
            <div key={log.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{log.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{formatDate(log.createdAt)} · {log.entryCount} item{log.entryCount !== 1 ? 's' : ''}</p>
              </div>
              {log.status === 'resolved'
                ? <Badge className="text-xs bg-green-100 text-green-800 border-green-200 gap-1 flex-shrink-0"><CheckCircle2 className="w-3 h-3" /> Reviewed</Badge>
                : <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 gap-1 flex-shrink-0"><Clock className="w-3 h-3" /> Pending</Badge>
              }
            </div>
          ))}
        </div>
      )}

      {!creating && logs.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <Camera className="w-10 h-10 mx-auto mb-2 text-gray-200" />
          <p className="text-sm">No observations yet</p>
          <p className="text-xs mt-1">Tap "New Observation" to log something you notice on site</p>
        </div>
      )}
    </div>
  );
}
