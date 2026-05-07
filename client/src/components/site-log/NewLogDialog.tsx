import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  collection, addDoc, getDocs, query, orderBy, serverTimestamp, where,
} from 'firebase/firestore';
import {
  ref as storageRef, uploadBytes, getDownloadURL,
} from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { PhotoAnnotator } from './PhotoAnnotator';
import {
  Camera, Video, FileText, Plus, X, Pencil, ChevronRight, ChevronLeft, Loader2,
} from 'lucide-react';

interface FirestoreProject { id: string; name: string; }
interface FirestoreContact { id: string; name: string; trade?: string; trades?: string[]; }

interface LogEntry {
  id: string;
  type: 'photo' | 'video' | 'note';
  localUrl?: string;
  annotatedDataUrl?: string;
  file?: File;
  comment: string;
  tradeId: string;
  tradeName: string;
}

interface NewLogDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultProjectId?: string;
  onCreated?: (logId: string) => void;
}

function nanoid() {
  return Math.random().toString(36).slice(2, 10);
}

export function NewLogDialog({ open, onOpenChange, defaultProjectId, onCreated }: NewLogDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Step 1 state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projects, setProjects] = useState<FirestoreProject[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [projectName, setProjectName] = useState('');
  const [title, setTitle] = useState('');

  // Step 2 state
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [annotatingEntry, setAnnotatingEntry] = useState<string | null>(null);

  // Step 3 / save
  const [saving, setSaving] = useState(false);

  // Subs for trade tagging
  const [subs, setSubs] = useState<FirestoreContact[]>([]);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Load projects + subs when dialog opens
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setEntries([]);
    setTitle('');
    if (!defaultProjectId) setProjectId('');

    getDocs(query(collection(db, 'projects'), orderBy('name', 'asc')))
      .then(snap => setProjects(snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id }))))
      .catch(() => {});

    getDocs(query(collection(db, 'contacts'), where('type', 'in', ['sub', 'subcontractor'])))
      .then(snap => setSubs(snap.docs.map(d => ({ id: d.id, name: d.data().name || '', trade: d.data().trade || '' }))))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  useEffect(() => {
    const p = projects.find(p => p.id === projectId);
    if (p) setProjectName(p.name);
  }, [projectId, projects]);

  // ── Step 1 → 2 ──────────────────────────────────────────────────────────
  const handleStep1Next = () => {
    if (!projectId) { toast({ title: 'Select a project', variant: 'destructive' }); return; }
    setStep(2);
  };

  // ── Media capture ────────────────────────────────────────────────────────
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setEntries(prev => [...prev, {
      id: nanoid(), type: 'photo', localUrl, file, comment: '', tradeId: '', tradeName: '',
    }]);
    e.target.value = '';
  };

  const handleVideoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    setEntries(prev => [...prev, {
      id: nanoid(), type: 'video', localUrl, file, comment: '', tradeId: '', tradeName: '',
    }]);
    e.target.value = '';
  };

  const addNote = () => {
    setEntries(prev => [...prev, { id: nanoid(), type: 'note', comment: '', tradeId: '', tradeName: '' }]);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateEntry = (id: string, patch: Partial<LogEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (entries.length === 0) {
      toast({ title: 'Add at least one item before saving', variant: 'destructive' });
      return;
    }
    setSaving(true);

    try {
      const logRef = await addDoc(collection(db, 'siteLogs'), {
        projectId,
        projectName,
        title: title || `Log – ${new Date().toLocaleDateString()}`,
        createdBy: user?.firebaseUid || '',
        createdByName: user?.name || 'Unknown',
        createdAt: serverTimestamp(),
        status: 'open',
        entryCount: entries.length,
      });

      // Upload media and build serialisable entries
      const savedEntries = await Promise.all(entries.map(async entry => {
        let mediaUrl = '';

        if ((entry.type === 'photo' || entry.type === 'video') && entry.file) {
          const ext = entry.file.name.split('.').pop() || (entry.type === 'photo' ? 'jpg' : 'mp4');
          const path = `site-logs/${projectId}/${logRef.id}/${entry.id}.${ext}`;
          const snap = await uploadBytes(storageRef(storage, path), entry.file);
          mediaUrl = await getDownloadURL(snap.ref);
        } else if (entry.type === 'photo' && entry.annotatedDataUrl) {
          // Annotated photo — upload the data URL as a blob
          const res = await fetch(entry.annotatedDataUrl);
          const blob = await res.blob();
          const path = `site-logs/${projectId}/${logRef.id}/${entry.id}-annotated.jpg`;
          const snap = await uploadBytes(storageRef(storage, path), blob);
          mediaUrl = await getDownloadURL(snap.ref);
        }

        return {
          id: entry.id,
          type: entry.type,
          mediaUrl: mediaUrl || entry.annotatedDataUrl || '',
          comment: entry.comment,
          tradeId: entry.tradeId,
          tradeName: entry.tradeName,
        };
      }));

      // Write entries as sub-collection docs
      for (const e of savedEntries) {
        await addDoc(collection(db, 'siteLogs', logRef.id, 'entries'), e);
      }

      toast({ title: 'Site log saved' });
      onCreated?.(logRef.id);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast({ title: 'Failed to save log', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Annotation overlay ───────────────────────────────────────────────────
  const annotatingEntryObj = annotatingEntry ? entries.find(e => e.id === annotatingEntry) : null;
  if (annotatingEntryObj) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Annotate Photo</DialogTitle>
          </DialogHeader>
          <PhotoAnnotator
            imageUrl={annotatingEntryObj.localUrl!}
            onDone={dataUrl => {
              updateEntry(annotatingEntryObj.id, { annotatedDataUrl: dataUrl });
              setAnnotatingEntry(null);
            }}
            onCancel={() => setAnnotatingEntry(null)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>New Site Log</span>
            <span className="text-sm font-normal text-gray-400 ml-1">Step {step} of 2</span>
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Project + Title ── */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Job Site *</label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Log Title <span className="text-gray-400 font-normal">(optional)</span></label>
              <Input
                placeholder={`e.g. Framing inspection, ${new Date().toLocaleDateString()}`}
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleStep1Next} style={{ backgroundColor: '#C9A96E', color: '#141414', fontWeight: 600 }}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Add Entries ── */}
        {step === 2 && (
          <div className="space-y-4 py-1">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                <span className="font-medium text-gray-900">{projectName}</span>
                {title && <span> — {title}</span>}
              </p>
              <button onClick={() => setStep(1)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> Edit
              </button>
            </div>

            {/* Add buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-400 hover:text-amber-700 transition-colors"
              >
                <Camera className="w-4 h-4" /> Add Photo
              </button>
              <button
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-400 hover:text-amber-700 transition-colors"
              >
                <Video className="w-4 h-4" /> Add Video
              </button>
              <button
                onClick={addNote}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-amber-400 hover:text-amber-700 transition-colors"
              >
                <FileText className="w-4 h-4" /> Add Note
              </button>
            </div>

            {/* Hidden file inputs */}
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
            <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={handleVideoCapture} />

            {/* Entry list */}
            {entries.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm border border-dashed rounded-lg">
                Use the buttons above to add photos, videos, or notes
              </div>
            )}

            <div className="space-y-3">
              {entries.map((entry, idx) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  index={idx + 1}
                  subs={subs}
                  onUpdate={patch => updateEntry(entry.id, patch)}
                  onRemove={() => removeEntry(entry.id)}
                  onAnnotate={() => setAnnotatingEntry(entry.id)}
                />
              ))}
            </div>

            <div className="flex justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Back
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || entries.length === 0}
                style={{ backgroundColor: '#C9A96E', color: '#141414', fontWeight: 600 }}
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {saving ? 'Saving…' : `Save Log (${entries.length} item${entries.length !== 1 ? 's' : ''})`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Individual entry card ────────────────────────────────────────────────────
interface EntryCardProps {
  entry: LogEntry;
  index: number;
  subs: FirestoreContact[];
  onUpdate: (patch: Partial<LogEntry>) => void;
  onRemove: () => void;
  onAnnotate: () => void;
}

function EntryCard({ entry, index, subs, onUpdate, onRemove, onAnnotate }: EntryCardProps) {
  const previewUrl = entry.annotatedDataUrl || entry.localUrl;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {entry.type === 'photo' && <Camera className="w-4 h-4 text-amber-600" />}
          {entry.type === 'video' && <Video className="w-4 h-4 text-blue-600" />}
          {entry.type === 'note'  && <FileText className="w-4 h-4 text-gray-500" />}
          <span className="text-xs font-medium text-gray-700 capitalize">
            {entry.type} {index}
            {entry.annotatedDataUrl && <span className="ml-1 text-amber-600">· annotated</span>}
          </span>
        </div>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {/* Media preview */}
        {entry.type === 'photo' && previewUrl && (
          <div className="relative group rounded-lg overflow-hidden bg-black" style={{ maxHeight: 220 }}>
            <img src={previewUrl} alt="capture" className="w-full object-contain" style={{ maxHeight: 220 }} />
            <button
              onClick={onAnnotate}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              {entry.annotatedDataUrl ? 'Re-annotate' : 'Annotate'}
            </button>
          </div>
        )}

        {entry.type === 'video' && entry.localUrl && (
          <video src={entry.localUrl} controls className="w-full rounded-lg" style={{ maxHeight: 200 }} />
        )}

        {/* Comment */}
        <Textarea
          placeholder="Describe what you see — be specific about the issue…"
          value={entry.comment}
          onChange={e => onUpdate({ comment: e.target.value })}
          className="text-sm resize-none"
          rows={2}
        />

        {/* Trade tag */}
        <div>
          <Select
            value={entry.tradeId || '__none__'}
            onValueChange={val => {
              if (val === '__none__') {
                onUpdate({ tradeId: '', tradeName: '' });
              } else {
                const sub = subs.find(s => s.id === val);
                onUpdate({ tradeId: val, tradeName: sub?.name || '' });
              }
            }}
          >
            <SelectTrigger className="text-sm h-8">
              <SelectValue placeholder="Tag a subcontractor (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No subcontractor</SelectItem>
              {subs.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}{s.trade ? ` · ${s.trade}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {entry.tradeName && (
            <Badge variant="secondary" className="mt-1.5 text-xs">{entry.tradeName}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
