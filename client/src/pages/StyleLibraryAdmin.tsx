// Admin curation tool for the Style Discovery image library.
//
// This is where the GC loads the vetted renderings (e.g. generated in ChatGPT,
// then approved as "correct" for a given style) and tags each with its named
// style + room. Clients later react to these blind (Like / Pass) — they never
// see the style name until the reveal — so accurate tagging here is what makes
// the resulting style profile meaningful.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage, auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  STYLES,
  DISCOVERY_ROOMS,
  styleLabel,
  roomLabel,
  roomOrder,
  subscribeStyleLibrary,
  addStyleLibraryImage,
  deleteStyleLibraryImage,
  setStyleLibraryActive,
  type StyleLibraryImage,
} from '@/lib/styleLibrary';
import {
  ImagePlus,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Images,
  CheckCircle2,
} from 'lucide-react';

const GOLD = '#C9A96E';

export default function StyleLibraryAdmin() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<StyleLibraryImage[]>([]);
  const [styleId, setStyleId] = useState(STYLES[0].id);
  const [room, setRoom] = useState(DISCOVERY_ROOMS[0].id);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [roomFilter, setRoomFilter] = useState<string>('all');

  useEffect(() => subscribeStyleLibrary(setImages, () => {}), []);

  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    const imgs = list.filter(
      (f) => f.type.startsWith('image/') && f.size <= 15 * 1024 * 1024
    );
    if (imgs.length !== list.length) {
      toast({
        title: 'Some files skipped',
        description: 'Only images under 15MB are accepted.',
        variant: 'destructive',
      });
    }
    setFiles(imgs);
  };

  const uploadOne = (file: File): Promise<{ url: string; path: string }> => {
    const path = `styleLibrary/${styleId}/${room}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const sref = storageRef(storage, path);
    const task = uploadBytesResumable(sref, file);
    return new Promise((resolve, reject) => {
      task.on('state_changed', null, reject, async () => {
        try {
          resolve({ url: await getDownloadURL(sref), path });
        } catch (e) {
          reject(e);
        }
      });
    });
  };

  const upload = async () => {
    if (!auth.currentUser) {
      toast({ title: 'Please sign in', variant: 'destructive' });
      return;
    }
    if (!files.length) {
      toast({ title: 'Choose at least one image', variant: 'destructive' });
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let ok = 0;
    for (const file of files) {
      try {
        const { url, path } = await uploadOne(file);
        await addStyleLibraryImage({
          imageUrl: url,
          storagePath: path,
          styleId,
          styleLabel: styleLabel(styleId),
          room,
          roomLabel: roomLabel(room),
          active: true,
          createdBy: auth.currentUser?.uid,
        });
        ok += 1;
        setProgress({ done: ok, total: files.length });
      } catch (e: any) {
        toast({
          title: `Failed: ${file.name}`,
          description: e?.message,
          variant: 'destructive',
        });
      }
    }
    setUploading(false);
    setFiles([]);
    if (fileRef.current) fileRef.current.value = '';
    if (ok)
      toast({
        title: `Added ${ok} image${ok > 1 ? 's' : ''}`,
        description: `${styleLabel(styleId)} · ${roomLabel(room)}`,
      });
  };

  const remove = async (img: StyleLibraryImage) => {
    try {
      await deleteStyleLibraryImage(img.id);
      if (img.storagePath)
        await deleteObject(storageRef(storage, img.storagePath)).catch(
          () => {}
        );
    } catch (e: any) {
      toast({
        title: 'Could not remove',
        description: e?.message,
        variant: 'destructive',
      });
    }
  };

  // Group for display: room (in flow order) → style.
  const grouped = useMemo(() => {
    const visible =
      roomFilter === 'all'
        ? images
        : images.filter((i) => i.room === roomFilter);
    const byRoom = new Map<string, StyleLibraryImage[]>();
    for (const img of visible) {
      if (!byRoom.has(img.room)) byRoom.set(img.room, []);
      byRoom.get(img.room)!.push(img);
    }
    return Array.from(byRoom.entries())
      .sort((a, b) => roomOrder(a[0]) - roomOrder(b[0]))
      .map(([roomId, imgs]) => ({
        roomId,
        imgs: imgs.sort((a, b) => a.styleLabel.localeCompare(b.styleLabel)),
      }));
  }, [images, roomFilter]);

  const counts = useMemo(() => {
    const total = images.length;
    const active = images.filter((i) => i.active).length;
    return { total, active };
  }, [images]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${GOLD}22` }}
        >
          <Images className="h-5 w-5" style={{ color: GOLD }} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Style Discovery Library
          </h1>
          <p className="text-sm text-gray-500">
            Curated renderings clients react to (Like / Pass). Style names stay
            hidden from clients until their reveal.
            <span className="ml-2 text-gray-400">
              {counts.active} active · {counts.total} total
            </span>
          </p>
        </div>
      </div>

      {/* Uploader */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm">
            <span className="block font-semibold text-gray-700 mb-1">
              Style
            </span>
            <select
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="block font-semibold text-gray-700 mb-1">Room</span>
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {DISCOVERY_ROOMS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-[#C9A96E]/60 transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={pickFiles}
          />
          <ImagePlus className="h-7 w-7 text-gray-400 mx-auto mb-1.5" />
          <p className="text-sm text-gray-600">
            {files.length
              ? `${files.length} image${files.length > 1 ? 's' : ''} ready`
              : 'Tap to add renderings (multiple OK)'}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            JPG / PNG up to 15MB each · all tagged as {styleLabel(styleId)} ·{' '}
            {roomLabel(room)}
          </p>
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <img
                key={i}
                src={URL.createObjectURL(f)}
                alt=""
                className="h-16 w-16 rounded-md object-cover border border-gray-200"
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button
            onClick={upload}
            disabled={uploading || !files.length}
            style={{ backgroundColor: GOLD, color: '#141414' }}
            className="font-semibold"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading{' '}
                {progress.done}/{progress.total}
              </>
            ) : (
              `Add ${files.length || ''} to library`
            )}
          </Button>
        </div>
      </div>

      {/* Room filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setRoomFilter('all')}
          className={`text-xs px-3 py-1 rounded-full border ${roomFilter === 'all' ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-gray-200 text-gray-500'}`}
        >
          All rooms
        </button>
        {DISCOVERY_ROOMS.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoomFilter(r.id)}
            className={`text-xs px-3 py-1 rounded-full border ${roomFilter === r.id ? 'border-amber-400 bg-amber-50 text-amber-700 font-medium' : 'border-gray-200 text-gray-500'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Library grid */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <Images className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No renderings yet</p>
          <p className="text-sm mt-1">
            Upload your first batch above to start building the deck.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ roomId, imgs }) => (
            <div key={roomId}>
              <h3 className="text-sm font-bold text-gray-800 mb-3">
                {roomLabel(roomId)}{' '}
                <span className="text-gray-400 font-normal">
                  · {imgs.length}
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {imgs.map((img) => (
                  <div
                    key={img.id}
                    className={`group relative rounded-xl overflow-hidden border bg-white ${img.active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}
                  >
                    <img
                      src={img.imageUrl}
                      alt={img.styleLabel}
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/70 text-white">
                        {img.styleLabel}
                      </span>
                      {img.active ? (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-600 text-white flex items-center gap-0.5">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Live
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-500 text-white">
                          Hidden
                        </span>
                      )}
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() =>
                          setStyleLibraryActive(img.id, !img.active)
                        }
                        className="bg-white/90 rounded-full p-1.5 text-gray-600 hover:text-amber-700"
                        title={
                          img.active ? 'Hide from clients' : 'Show to clients'
                        }
                      >
                        {img.active ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => remove(img)}
                        className="bg-white/90 rounded-full p-1.5 text-gray-600 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
