import { useState, useRef, useEffect } from 'react';
import {
  collection, addDoc, doc, getDocs, query, where, orderBy,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { createNotification } from '@/lib/notifications';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Camera, Video, Upload, Trash2, Send } from 'lucide-react';

interface Sub {
  id: string;
  name: string;
  trade?: string;
  email?: string;
}

interface Props {
  projectId: string;
  projectName?: string;
  // Floating button label override (defaults to "Capture")
  buttonLabel?: string;
  // If true, render compact icon-only button (good for tabs); else render full FAB.
  compact?: boolean;
}

const PRIORITIES = ['low', 'medium', 'high'] as const;

export function WalkthroughCapture({ projectId, projectName, buttonLabel = 'Capture', compact }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [subs, setSubs] = useState<Sub[]>([]);

  // Capture state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [mediaType, setMediaType] = useState<'photo' | 'video' | null>(null);
  const [note, setNote] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [trade, setTrade] = useState('');
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>('medium');

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Load subs / contacts when modal opens
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'contacts'),
          orderBy('name'),
        ));
        const list: Sub[] = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter((c: any) => c.role === 'sub' || c.role === 'subcontractor' || c.role === 'employee')
          .map((c: any) => ({ id: c.id, name: c.name, trade: c.trade, email: c.email }));
        setSubs(list);
      } catch {}
    })();
  }, [open]);

  const reset = () => {
    setMediaFile(null);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview('');
    setMediaType(null);
    setNote('');
    setAssigneeId('');
    setTrade('');
    setPriority('medium');
    setProgress(0);
  };

  const handleClose = () => {
    if (uploading) return;
    setOpen(false);
    setTimeout(reset, 300); // wait for modal close animation
  };

  const handleFileSelected = (file: File, type: 'photo' | 'video') => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMediaType(type);

    // Auto-fill trade if assignee already chosen
    if (assigneeId) {
      const sub = subs.find(s => s.id === assigneeId);
      if (sub?.trade) setTrade(sub.trade);
    }
  };

  const handleAssigneeChange = (id: string) => {
    setAssigneeId(id);
    const sub = subs.find(s => s.id === id);
    if (sub?.trade && !trade) setTrade(sub.trade);
  };

  const handleSave = async () => {
    if (!mediaFile || !user) {
      toast({ title: 'Capture media first', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      // Upload media to Firebase Storage
      const ext = mediaFile.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `projects/${projectId}/walkthroughs/${filename}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, mediaFile);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setProgress((snap.bytesTransferred / snap.totalBytes) * 100),
          err => reject(err),
          () => resolve(),
        );
      });
      const mediaUrl = await getDownloadURL(sref);
      const sub = subs.find(s => s.id === assigneeId);

      const batch = writeBatch(db);
      // Walkthrough record
      const walkRef = doc(collection(db, 'projects', projectId, 'walkthroughs'));
      batch.set(walkRef, {
        projectId,
        mediaUrl,
        mediaType,
        note: note.trim(),
        assignedToContactId: assigneeId || null,
        assignedToName: sub?.name || null,
        trade: trade.trim() || null,
        priority,
        status: 'open',
        createdAt: serverTimestamp(),
        createdBy: user.id?.toString() || user.email || 'unknown',
      });

      // Mirror to Tasks collection so it shows in the assignee's task list
      if (assigneeId) {
        const taskRef = doc(collection(db, 'tasks'));
        batch.set(taskRef, {
          name: note.trim() || 'Site walkthrough item',
          description: note.trim(),
          projectId,
          projectName: projectName || '',
          category: 'walkthrough',
          assignedSubId: assigneeId,
          assignedTo: sub?.name || '',
          trade: trade.trim() || '',
          priority,
          status: 'todo',
          mediaUrl,
          mediaType,
          source: 'walkthrough',
          sourceWalkthroughId: walkRef.id,
          visibleToClient: false,
          createdAt: serverTimestamp(),
          createdBy: user.id?.toString() || user.email || 'unknown',
        });
      }

      await batch.commit();

      // Fire notification to the assignee (best-effort, non-blocking)
      if (assigneeId && sub) {
        await createNotification({
          userId: assigneeId,
          kind: 'walkthrough_assigned',
          title: `New walkthrough item from ${user.name || 'GC'}`,
          body: note.trim() || 'Photo / video captured on site',
          link: `/subcontractor-portal`,
          projectId,
          refType: 'walkthrough',
          refId: walkRef.id,
          fromUserId: user.id?.toString() || user.email || 'unknown',
          fromUserName: user.name || user.email || 'GC',
        });
      }

      toast({
        title: assigneeId ? 'Captured + assigned' : 'Captured',
        description: sub ? `Sent to ${sub.name}` : 'Saved to walkthroughs (no assignee).',
      });
      handleClose();
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Trigger button */}
      {compact ? (
        <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5 text-white" style={{ backgroundColor: '#C9A96E' }}>
          <Camera className="w-4 h-4" /> {buttonLabel}
        </Button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-40 bottom-6 right-6 md:bottom-8 md:right-8 rounded-full shadow-2xl text-white flex items-center gap-2 px-5 py-4 transition-transform hover:scale-105"
          style={{ backgroundColor: '#C9A96E' }}
          aria-label="Capture walkthrough"
        >
          <Camera className="w-5 h-5" />
          <span className="hidden md:inline font-semibold">{buttonLabel}</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#C9A96E]" />
              Walkthrough Capture
            </DialogTitle>
            <DialogDescription>
              Capture a photo or video, attach a note, and assign it to a sub. They'll see it in their Tasks instantly.
            </DialogDescription>
          </DialogHeader>

          {/* Media area */}
          <div className="space-y-3">
            {!mediaPreview ? (
              <div className="space-y-2">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f, 'photo'); }}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelected(f, 'video'); }}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    handleFileSelected(f, f.type.startsWith('video/') ? 'video' : 'photo');
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-lg hover:border-[#C9A96E] hover:bg-[#FFF8E7] transition-colors"
                  >
                    <Camera className="w-8 h-8 text-[#C9A96E]" />
                    <span className="text-sm font-medium text-gray-700">Photo</span>
                  </button>
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-lg hover:border-[#C9A96E] hover:bg-[#FFF8E7] transition-colors"
                  >
                    <Video className="w-8 h-8 text-[#C9A96E]" />
                    <span className="text-sm font-medium text-gray-700">Video</span>
                  </button>
                </div>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Or pick from gallery
                </button>
              </div>
            ) : (
              <div className="relative rounded-lg overflow-hidden border border-gray-200 bg-black">
                {mediaType === 'photo' ? (
                  <img src={mediaPreview} alt="capture" className="w-full max-h-72 object-contain" />
                ) : (
                  <video src={mediaPreview} controls className="w-full max-h-72" />
                )}
                {!uploading && (
                  <button
                    onClick={() => { reset(); }}
                    className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 hover:bg-black/90"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Note */}
            <div>
              <Label htmlFor="walk-note">Note</Label>
              <Textarea
                id="walk-note"
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="What needs attention?"
              />
            </div>

            {/* Assignee + trade + priority */}
            <div className="grid grid-cols-1 gap-2">
              <div>
                <Label>Assign to</Label>
                <Select value={assigneeId} onValueChange={handleAssigneeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="— Pick a sub or contact —" />
                  </SelectTrigger>
                  <SelectContent>
                    {subs.length === 0 ? (
                      <SelectItem value="none" disabled>No subs/contacts found — add some in Contacts</SelectItem>
                    ) : (
                      subs.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}{s.trade ? ` · ${s.trade}` : ''}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="walk-trade">Trade</Label>
                  <Input
                    id="walk-trade"
                    value={trade}
                    onChange={e => setTrade(e.target.value)}
                    placeholder="e.g. Framing"
                  />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={v => setPriority(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map(p => (
                        <SelectItem key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Upload progress */}
            {uploading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <div className="flex items-center justify-between text-xs text-blue-900 mb-1">
                  <span>Uploading…</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={uploading}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!mediaFile || uploading}
              className="gap-1.5 text-white"
              style={{ backgroundColor: '#22c55e' }}
            >
              <Send className="w-3.5 h-3.5" />
              {uploading ? 'Uploading…' : 'Capture & Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
