// Designer Portal — File Library panel for one room.
import { useState } from 'react';
import {
  Download,
  FileText,
  Film,
  Image as ImageIcon,
  Link2,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { DesignFile } from '@/lib/designer/portalTypes';
import {
  addDesignLink,
  deleteDesignFile,
  uploadDesignFile,
} from '@/lib/designer/portalService';
import { Dropzone, EmptyState } from './shared';

interface Props {
  projectId: string;
  roomId: string;
  files: DesignFile[];
  canUpload: boolean;
  canDelete: boolean;
}

export function FileLibraryPanel({
  projectId,
  roomId,
  files,
  canUpload,
  canDelete,
}: Props) {
  const { toast } = useToast();
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [linkOpen, setLinkOpen] = useState(false);

  async function onFiles(list: File[]) {
    for (const file of list) {
      const key = `${file.name}-${Date.now()}`;
      setProgress((p) => ({ ...p, [key]: 0 }));
      try {
        await uploadDesignFile(projectId, roomId, file, undefined, (pct) =>
          setProgress((p) => ({ ...p, [key]: Math.round(pct) }))
        );
      } catch (e: any) {
        toast({
          title: `Upload failed: ${file.name}`,
          description: e?.message,
          variant: 'destructive',
        });
      } finally {
        setProgress((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
      }
    }
  }

  const uploading = Object.keys(progress).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          Files ({files.length})
        </h4>
        {canUpload && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setLinkOpen(true)}
          >
            <Link2 className="w-4 h-4" /> Add link
          </Button>
        )}
      </div>

      {canUpload && (
        <Dropzone
          onFiles={onFiles}
          disabled={uploading}
          hint={
            uploading
              ? 'Uploading…'
              : 'Drag & drop files (images, PDFs, drawings, spec sheets, videos), or click to browse'
          }
        />
      )}

      {uploading && (
        <div className="space-y-1">
          {Object.entries(progress).map(([k, pct]) => (
            <div
              key={k}
              className="h-1.5 bg-gray-100 rounded-full overflow-hidden"
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: '#C9A96E' }}
              />
            </div>
          ))}
        </div>
      )}

      {!files.length && !uploading && (
        <EmptyState
          icon={FileText}
          title="No files yet"
          hint={
            canUpload
              ? 'Upload drawings, spec sheets, product photos, or paste a link.'
              : 'Files shared for this room will appear here.'
          }
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {files.map((f) => (
          <div
            key={f.id}
            className="rounded-xl border border-gray-200 bg-white p-3 flex items-start gap-3"
          >
            <FileIcon file={f} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">
                {f.fileName}
              </p>
              <p className="text-xs text-gray-400">
                {f.uploadedByName || 'Unknown'}
                {f.uploadedAt ? ` · ${fmtDate(f.uploadedAt)}` : ''}
              </p>
              <div className="flex items-center gap-3 mt-1.5">
                <a
                  href={f.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 inline-flex items-center gap-0.5"
                >
                  {f.isLink ? (
                    <>
                      <Link2 className="w-3 h-3" /> Open
                    </>
                  ) : (
                    <>
                      <Download className="w-3 h-3" /> Open
                    </>
                  )}
                </a>
                {canDelete && (
                  <button
                    onClick={() => del(f)}
                    className="text-xs text-gray-300 hover:text-red-500 inline-flex items-center gap-0.5"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {linkOpen && (
        <AddLinkDialog
          projectId={projectId}
          roomId={roomId}
          onClose={() => setLinkOpen(false)}
        />
      )}
    </div>
  );

  async function del(f: DesignFile) {
    if (!window.confirm(`Delete ${f.fileName}?`)) return;
    try {
      await deleteDesignFile(projectId, f.id);
      toast({ title: 'Deleted' });
    } catch (e: any) {
      toast({
        title: 'Delete failed',
        description: e?.message,
        variant: 'destructive',
      });
    }
  }
}

function FileIcon({ file }: { file: DesignFile }) {
  const t = (file.fileType || '').toLowerCase();
  const Icon = file.isLink
    ? Link2
    : t.startsWith('image')
      ? ImageIcon
      : t.startsWith('video')
        ? Film
        : FileText;
  const color = t.startsWith('image')
    ? 'text-blue-500'
    : t.startsWith('video')
      ? 'text-purple-500'
      : t.includes('pdf')
        ? 'text-red-500'
        : 'text-gray-400';
  if (t.startsWith('image') && !file.isLink) {
    return (
      <img
        src={file.fileUrl}
        alt=""
        className="w-10 h-10 rounded object-cover shrink-0"
      />
    );
  }
  return <Icon className={`w-9 h-9 shrink-0 ${color}`} />;
}

function fmtDate(v: any): string {
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

function AddLinkDialog({
  projectId,
  roomId,
  onClose,
}: {
  projectId: string;
  roomId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!url.trim()) {
      toast({ title: 'Paste a URL', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await addDesignLink(projectId, roomId, name, url);
      toast({ title: 'Link added' });
      onClose();
    } catch (e: any) {
      toast({
        title: 'Failed',
        description: e?.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a product / vendor link</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Label (e.g. Faucet on Build.com)"
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
