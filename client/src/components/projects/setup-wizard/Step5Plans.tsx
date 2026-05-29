import { useRef, useState } from 'react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Upload, FileText, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import type { ProjectSetupDraft } from '@/types/projectSetup';

/**
 * Step 5 — Plans &amp; docs.
 *
 * Upload floor plans, elevations, site survey, specs. Each upload:
 *   - Lands in Storage at `projects/{projectId}/plans/{filename}`
 *   - Writes a doc into the `documents` collection (so DocumentsTab
 *     and any other consumer picks it up automatically)
 *   - Adds the doc id to `draft.plansDocIds[]` so the completeness
 *     scorer can see plans exist
 *
 * Multi-file drag-drop is supported. Per-file progress shown.
 */

interface UploadedPlan {
  id: string;
  name: string;
  fileUrl: string;
  storagePath: string;
  size: number;
  uploadedAt: number;
}

interface Props {
  draft: ProjectSetupDraft;
  onChange: (next: ProjectSetupDraft) => void;
}

export function Step5Plans({ draft, onChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Record<string, number>>({}); // filename -> 0..100
  const [plans, setPlans] = useState<UploadedPlan[]>([]); // local cache of what we know is uploaded

  // Without a draft id we can't store the upload yet — Save & exit
  // creates the draft, so prompt the user to do that first.
  const draftId = draft.id;

  const handleFiles = async (files: FileList | File[]) => {
    if (!draftId) {
      toast({
        title: 'Save the draft first',
        description: 'Click Next or Save & exit to create the draft, then come back to upload plans.',
        variant: 'destructive',
      });
      return;
    }
    const fileArr = Array.from(files);
    for (const file of fileArr) {
      const tempKey = `${file.name}-${Date.now()}`;
      setUploads(prev => ({ ...prev, [tempKey]: 0 }));
      try {
        const path = `projects/${draftId}/plans/${Date.now()}-${file.name}`;
        const sref = storageRef(storage, path);
        const task = uploadBytesResumable(sref, file);
        await new Promise<void>((resolve, reject) => {
          task.on('state_changed',
            snap => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              setUploads(prev => ({ ...prev, [tempKey]: pct }));
            },
            reject,
            () => resolve(),
          );
        });
        const url = await getDownloadURL(sref);
        // Write to the documents collection so DocumentsTab + other
        // consumers see it. Also keep the id in draft.plansDocIds so
        // the completeness scorer and Step 8 can reference it.
        const docRef = await addDoc(collection(db, 'documents'), {
          projectId: draftId,
          name: file.name,
          fileName: file.name,
          fileUrl: url,
          storagePath: path,
          size: file.size,
          category: 'plans',
          uploadedBy: user?.id?.toString() || '',
          uploadedAt: serverTimestamp(),
        });
        setPlans(prev => [...prev, {
          id: docRef.id,
          name: file.name,
          fileUrl: url,
          storagePath: path,
          size: file.size,
          uploadedAt: Date.now(),
        }]);
        onChange({
          ...draft,
          plansDocIds: [...(draft.plansDocIds || []), docRef.id],
        });
      } catch (e: any) {
        console.warn('[setup-wizard] plan upload failed', e);
        toast({ title: `Upload failed: ${file.name}`, description: e.message, variant: 'destructive' });
      } finally {
        setUploads(prev => {
          const next = { ...prev };
          delete next[tempKey];
          return next;
        });
      }
    }
  };

  const handleRemove = async (plan: UploadedPlan) => {
    const ok = await confirm({
      title: `Remove "${plan.name}"?`,
      description: 'The file will be deleted from storage. This cannot be undone.',
      confirmText: 'Remove',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'documents', plan.id));
      try { await deleteObject(storageRef(storage, plan.storagePath)); } catch { /* file may already be gone — ignore */ }
      setPlans(prev => prev.filter(p => p.id !== plan.id));
      onChange({
        ...draft,
        plansDocIds: (draft.plansDocIds || []).filter(id => id !== plan.id),
      });
    } catch (e: any) {
      toast({ title: 'Could not remove file', description: e.message, variant: 'destructive' });
    }
  };

  const uploadKeys = Object.keys(uploads);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-heading font-semibold text-[#141414]">Plans &amp; documents</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload floor plans, elevations, site surveys, specs. Subs need these to bid against real drawings; the designer references them for selection scopes.
        </p>
      </div>

      {!draftId && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
          Save the draft first (Save &amp; exit, or click Next) so uploads have a project to attach to.
        </div>
      )}

      {/* Drop / pick area */}
      <div
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={e => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
        }}
        className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-[#C9A96E] transition-colors cursor-pointer bg-gray-50/40"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-700">Drag files here or click to browse</p>
        <p className="text-xs text-gray-500 mt-1">PDF, DWG, JPG, PNG — multiple files OK</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/*,.dwg,.dxf"
          className="hidden"
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {/* In-progress uploads */}
      {uploadKeys.length > 0 && (
        <div className="space-y-1.5">
          {uploadKeys.map(key => (
            <div key={key} className="flex items-center gap-2 text-xs text-gray-600 px-2 py-1.5 bg-blue-50 rounded">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span className="flex-1 truncate">{key.replace(/-\d+$/, '')}</span>
              <span className="font-mono">{uploads[key]}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded list */}
      {plans.length > 0 && (
        <div>
          <Label className="text-sm font-semibold">Uploaded ({plans.length})</Label>
          <div className="mt-2 space-y-1.5">
            {plans.map(plan => (
              <div key={plan.id} className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-white">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="flex-1 text-sm truncate">{plan.name}</span>
                <span className="text-[11px] text-gray-500 font-mono">{formatBytes(plan.size)}</span>
                <a href={plan.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#C9A96E] hover:underline flex items-center gap-0.5">
                  view <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(plan)}
                  className="text-gray-300 hover:text-red-500"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {plans.length === 0 && uploadKeys.length === 0 && draftId && (
        <p className="text-xs text-gray-400 italic">
          No plans uploaded yet. You can add them now or after publishing the project — Document tab lets you upload more anytime.
        </p>
      )}

      {/* If we have existing plansDocIds on the draft (resume case)
          we don't fetch them lazily here — the audit reflects the
          existing references and the user can manage them on the
          Documents tab. */}
      {plans.length === 0 && (draft.plansDocIds?.length || 0) > 0 && (
        <Badge variant="secondary" className="text-xs">
          {draft.plansDocIds!.length} plan(s) already attached to this draft
        </Badge>
      )}
    </div>
  );
}

function formatBytes(b: number): string {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
