// Pre-project "Selections & Inspiration" board. Lets a homeowner start
// capturing what they want — finishes, styles, rooms — by uploading photos with
// notes, organized by category, BEFORE a project/plan set exists. Their designer
// reviews these to shape the real selections later.
//
// Storage: images go to `users/{uid}/inspiration/...` (allowed by the existing
// storage rule for a user's own folder). Metadata lands in the top-level
// `inspiration` Firestore collection, keyed by the client's contact id so it
// resolves the same way projects do, and so the designer/GC can read it.

import { useEffect, useRef, useState } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, ImagePlus, Trash2, X, Loader2 } from 'lucide-react';

const GOLD = '#C9A96E';

const CATEGORIES = [
  'Kitchen', 'Bathrooms', 'Living Areas', 'Bedrooms', 'Exterior',
  'Flooring', 'Lighting & Fixtures', 'Outdoor & Landscape', 'Other',
];

interface InspirationItem {
  id: string;
  imageUrl: string;
  storagePath?: string;
  note?: string;
  category?: string;
  clientUid?: string;
  createdAt?: any;
}

interface Props {
  clientContactId: string;
  clientName?: string;
}

export function InspirationBoard({ clientContactId }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<InspirationItem[]>([]);
  const [category, setCategory] = useState<string>('Kitchen');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!clientContactId) return;
    const q = query(collection(db, 'inspiration'), where('clientContactId', '==', clientContactId));
    return onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as InspirationItem));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setItems(rows);
    }, () => {});
  }, [clientContactId]);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast({ title: 'Please choose an image file', variant: 'destructive' }); return; }
    if (f.size > 15 * 1024 * 1024) { toast({ title: 'Image must be under 15MB', variant: 'destructive' }); return; }
    setFile(f);
  };

  const add = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) { toast({ title: 'Please sign in to upload', variant: 'destructive' }); return; }
    if (!file) { toast({ title: 'Choose a photo first', variant: 'destructive' }); return; }
    setUploading(true);
    setProgress(0);
    try {
      const path = `users/${uid}/inspiration/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const sref = storageRef(storage, path);
      const task = uploadBytesResumable(sref, file);
      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          s => setProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
          reject,
          () => resolve(),
        );
      });
      const imageUrl = await getDownloadURL(sref);
      await addDoc(collection(db, 'inspiration'), {
        clientContactId,
        clientUid: uid,
        category,
        note: note.trim() || null,
        imageUrl,
        storagePath: path,
        createdAt: serverTimestamp(),
      });
      setFile(null);
      setNote('');
      if (fileRef.current) fileRef.current.value = '';
      toast({ title: 'Added to your inspiration', description: 'Your designer will see this.' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const remove = async (item: InspirationItem) => {
    try {
      await deleteDoc(doc(db, 'inspiration', item.id));
      if (item.storagePath) {
        await deleteObject(storageRef(storage, item.storagePath)).catch(() => {});
      }
    } catch (e: any) {
      toast({ title: 'Could not remove', description: e?.message, variant: 'destructive' });
    }
  };

  const byCategory = CATEGORIES
    .map(cat => ({ cat, list: items.filter(i => i.category === cat) }))
    .filter(g => g.list.length > 0);
  const uncategorized = items.filter(i => !i.category || !CATEGORIES.includes(i.category));

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Intro */}
      <div className="rounded-2xl px-6 py-7" style={{ background: 'linear-gradient(135deg,#141414,#2a2419)' }}>
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest"
          style={{ backgroundColor: 'rgba(201,169,110,0.15)', color: GOLD, letterSpacing: '0.16em' }}>
          <Sparkles className="h-3.5 w-3.5" /> Selections &amp; Inspiration
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">Start your inspiration board</h1>
        <p className="mt-2 text-sm text-gray-300 leading-relaxed max-w-xl">
          While we finalize your plans, share photos of finishes, styles, and rooms you love —
          kitchens, baths, flooring, lighting, exteriors. Your designer reviews everything here to
          shape your real selections once your plans are ready.
        </p>
      </div>

      {/* Uploader */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-800 mb-2">What room or category is this for?</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  category === c
                    ? 'border-[#C9A96E] text-[#8a6a3a] bg-[#C9A96E]/10'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[160px,1fr] gap-4">
          {/* Drop / pick */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-[#C9A96E]/60 transition-colors flex flex-col items-center justify-center min-h-[140px]"
          >
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
            {file ? (
              <img src={URL.createObjectURL(file)} alt="preview" className="h-28 w-full object-cover rounded-md" />
            ) : (
              <>
                <ImagePlus className="h-7 w-7 text-gray-400 mb-1.5" />
                <span className="text-xs text-gray-500">Tap to add a photo</span>
                <span className="text-[10px] text-gray-400 mt-0.5">JPG / PNG up to 15MB</span>
              </>
            )}
          </div>

          <div className="space-y-3">
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={4}
              placeholder="What do you love about this? (e.g. matte black fixtures, white oak floors, this exact tile…)"
            />
            <div className="flex items-center gap-3">
              <Button onClick={add} disabled={uploading || !file} style={{ backgroundColor: GOLD, color: '#141414' }} className="font-semibold">
                {uploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading {progress}%</> : 'Add to board'}
              </Button>
              {file && !uploading && (
                <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-xs text-gray-500 hover:text-red-600 inline-flex items-center gap-1">
                  <X className="h-3.5 w-3.5" /> Clear
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Board */}
      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Your inspiration board is empty</p>
          <p className="text-sm mt-1">Add a few photos above — there's no wrong answer. The more you share, the better.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {[...byCategory, ...(uncategorized.length ? [{ cat: 'Other', list: uncategorized }] : [])].map(group => (
            <div key={group.cat}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{group.cat} <span className="text-gray-400 font-normal">· {group.list.length}</span></h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {group.list.map(item => (
                  <div key={item.id} className="group relative rounded-xl overflow-hidden border border-gray-200 bg-white">
                    <img src={item.imageUrl} alt={item.note || 'Inspiration'} className="w-full h-40 object-cover" />
                    <button
                      onClick={() => remove(item)}
                      className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 text-gray-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {item.note && <p className="text-xs text-gray-600 p-3 leading-snug">{item.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
