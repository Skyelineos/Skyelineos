import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Gift, Upload, Copy, ExternalLink, Check, Loader2 } from 'lucide-react';

// Lets an admin upload their Canva giveaway export. The image is stored in the
// public Storage bucket and recorded at public_content/giveaway, which the
// public /giveaway page reads. The giveaway QR on the model-home sign points at
// /giveaway, so swapping the image here updates what people see — no reprint.

interface GiveawayDoc {
  imageUrl?: string;
  fileName?: string;
  updatedAt?: any;
}

export function GiveawayPageManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<GiveawayDoc | null>(null);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const publicUrl = `${window.location.origin}/giveaway`;

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'public_content', 'giveaway'), snap => {
      setCurrent(snap.exists() ? (snap.data() as GiveawayDoc) : null);
    }, () => {});
    return unsub;
  }, []);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please upload an image', description: 'Export your Canva design as PNG or JPG.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const sref = storageRef(storage, `public/giveaway/${Date.now()}_${safe}`);
      await uploadBytes(sref, file, { contentType: file.type });
      const url = await getDownloadURL(sref);
      await setDoc(doc(db, 'public_content', 'giveaway'), {
        imageUrl: url,
        fileName: file.name,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email || user?.name || 'admin',
      }, { merge: true });
      toast({ title: 'Giveaway page updated', description: 'Your design is live at /giveaway.' });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message || '', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Gift className="w-4 h-4" /> Giveaway Page
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-[#C9A96E]" /> Giveaway Page
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Upload your Canva giveaway design (PNG or JPG). It publishes to a public
              page on your site — the giveaway QR on your model-home sign points here, so
              you can swap the design anytime without reprinting.
            </p>

            {/* Current design preview */}
            {current?.imageUrl ? (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <img src={current.imageUrl} alt="Current giveaway" className="w-full max-h-64 object-contain bg-gray-50" />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-10 text-center text-sm text-gray-400">
                No giveaway design uploaded yet.
              </div>
            )}

            {/* Upload */}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="w-full gap-2 text-white"
              style={{ backgroundColor: '#C9A96E' }}
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                : <><Upload className="w-4 h-4" /> {current?.imageUrl ? 'Replace design' : 'Upload design'}</>}
            </Button>

            {/* Public URL for the QR */}
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Giveaway page URL (for the QR)</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-white border border-gray-200 rounded px-2 py-1.5 truncate">{publicUrl}</code>
                <Button size="sm" variant="outline" onClick={copyUrl} className="gap-1 flex-shrink-0">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => window.open(publicUrl, '_blank')} className="gap-1 flex-shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" /> Open
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Send me this link (or just upload here) and I’ll drop the live QR into your sign.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
