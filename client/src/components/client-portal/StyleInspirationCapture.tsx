// "Other / Upload Inspiration" capture for Design Style Discovery. The client
// uploads images, says what they like, and tags it; saved to
// projects/{id}/styleInspiration for the designer (+ future AI analysis).

import { useState } from 'react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2, X, Check } from 'lucide-react';
import { INSPIRATION_TAGS, saveStyleInspiration } from '@/lib/styleDiscovery';

interface Props {
  projectId: string;
  clientId?: string;
  onDone?: () => void;
  onBack?: () => void;
}

export function StyleInspirationCapture({ projectId, clientId, onDone, onBack }: Props) {
  const { toast } = useToast();
  const [images, setImages] = useState<{ url: string; storagePath: string }[]>([]);
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleTag = (t: string) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const uid = auth.currentUser?.uid || 'anon';
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `users/${uid}/styleInspiration/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
        const sref = storageRef(storage, path);
        await uploadBytesResumable(sref, file);
        const url = await getDownloadURL(sref);
        setImages(prev => [...prev, { url, storagePath: path }]);
      }
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!images.length && !notes.trim()) {
      toast({ title: 'Add an image or a note first', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await saveStyleInspiration(projectId, { clientId: clientId ?? null, uploadedImages: images, notes: notes.trim(), selectedTags: tags });
      toast({ title: 'Inspiration shared 🎉', description: 'Your designer will review what you love.' });
      onDone?.();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || '', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Show us what you love</h3>
        <p className="text-sm text-gray-500">Upload a few looks and tell us what draws you to them.</p>
      </div>

      {/* Uploads */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {images.map((im, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
            <img src={im.url} alt="" className="w-full h-full object-cover" />
            <button onClick={() => setImages(prev => prev.filter((_, k) => k !== i))}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer text-gray-400 hover:border-[#C9A96E] hover:text-[#8a6a3a]">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          <span className="text-[10px] mt-1">Add photos</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={e => onFiles(e.target.files)} />
        </label>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium text-gray-700">What do you like about this image?</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="mt-1"
          placeholder="The warm wood tones, the calm feeling, the big windows…" />
      </div>

      {/* Tags */}
      <div>
        <label className="text-sm font-medium text-gray-700">What stands out? <span className="text-gray-400 font-normal">(optional)</span></label>
        <div className="flex flex-wrap gap-2 mt-2">
          {INSPIRATION_TAGS.map(t => {
            const on = tags.includes(t);
            return (
              <button key={t} onClick={() => toggleTag(t)}
                className={`text-xs px-3 py-1.5 rounded-full border capitalize transition-colors ${on ? 'text-white' : 'text-gray-600 border-gray-300 hover:border-gray-400'}`}
                style={on ? { backgroundColor: '#C9A96E', borderColor: '#C9A96E' } : {}}>
                {on && <Check className="h-3 w-3 inline mr-1" />}{t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={save} disabled={saving} style={{ backgroundColor: '#C9A96E', color: '#141414' }}>
          {saving ? 'Saving…' : 'Share with my designer'}
        </Button>
        {onBack && <Button variant="ghost" onClick={onBack}>Back</Button>}
      </div>
    </div>
  );
}
