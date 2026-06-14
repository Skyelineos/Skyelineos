// Staff-only editor for a single sales-pitch one-pager section. Lets an admin /
// GC edit the copy, pick an icon, paste a video URL, upload & remove documents,
// toggle published, and delete the whole section. Clients never see this — it is
// rendered only when the viewer is staff (see SalesPitchSection.canEdit).

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Plus, Trash2, Upload, FileText, X, Loader2, GripVertical,
} from 'lucide-react';
import {
  type SalesPitchSection, saveSection, deleteSection,
  uploadSalesPitchFile, deleteSalesPitchFile,
} from '@/lib/salesPitch';
import { ICON_NAMES, SalesIcon } from './salesPitchIcons';

const GOLD = '#C9A96E';

interface Props {
  open: boolean;
  section: SalesPitchSection;     // existing or blank
  uid?: string;
  onClose: () => void;
}

export function SalesPitchEditDialog({ open, section, uid, onClose }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<SalesPitchSection>(section);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  useEffect(() => { setDraft(section); }, [section, open]);

  const isNew = !section.id;
  const set = (patch: Partial<SalesPitchSection>) => setDraft(d => ({ ...d, ...patch }));

  const setFaq = (i: number, patch: Partial<{ q: string; a: string }>) =>
    setDraft(d => ({ ...d, faqs: d.faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));
  const addFaq = () => setDraft(d => ({ ...d, faqs: [...d.faqs, { q: '', a: '' }] }));
  const removeFaq = (i: number) => setDraft(d => ({ ...d, faqs: d.faqs.filter((_, idx) => idx !== i) }));

  const handleUpload = async (file: File) => {
    setUploadPct(0);
    try {
      const docMeta = await uploadSalesPitchFile(draft.id || 'unsaved', file, setUploadPct);
      setDraft(d => ({ ...d, documents: [...(d.documents || []), docMeta] }));
      toast({ title: 'File uploaded', description: file.name });
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e?.message, variant: 'destructive' });
    } finally {
      setUploadPct(null);
    }
  };

  const removeDoc = async (idx: number) => {
    const d = draft.documents[idx];
    if (d?.path) await deleteSalesPitchFile(d.path);
    setDraft(prev => ({ ...prev, documents: prev.documents.filter((_, i) => i !== idx) }));
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      toast({ title: 'Add a title', description: 'Every section needs a title.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await saveSection(
        { ...draft, faqs: draft.faqs.filter(f => f.q.trim() || f.a.trim()) },
        uid,
      );
      toast({ title: isNew ? 'Section added' : 'Section saved' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!section.id) return;
    if (!window.confirm(`Delete "${section.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteSection(section);
      toast({ title: 'Section deleted' });
      onClose();
    } catch (e: any) {
      toast({ title: 'Could not delete', description: e?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add a section' : 'Edit section'}</DialogTitle>
          <DialogDescription>
            This is what prospective clients see before their project starts. Edits go live immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Icon picker */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Icon</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ICON_NAMES.map(name => (
                <button
                  key={name}
                  type="button"
                  onClick={() => set({ icon: name })}
                  className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${
                    draft.icon === name ? 'border-2' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={draft.icon === name ? { borderColor: GOLD, backgroundColor: 'rgba(201,169,110,0.1)' } : undefined}
                  title={name}
                >
                  <SalesIcon name={name} className="h-5 w-5" style={{ color: draft.icon === name ? '#8a6a3a' : '#6b7280' }} />
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sp-title" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</Label>
              <Input id="sp-title" value={draft.title} onChange={e => set({ title: e.target.value })}
                placeholder="How We Build" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="sp-order" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order</Label>
              <Input id="sp-order" type="number" value={draft.order}
                onChange={e => set({ order: Number(e.target.value) || 0 })} className="mt-1.5" />
            </div>
          </div>

          <div>
            <Label htmlFor="sp-tagline" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tagline (card subtitle)</Label>
            <Input id="sp-tagline" value={draft.tagline} onChange={e => set({ tagline: e.target.value })}
              placeholder="The Skyeline process, start to finish" className="mt-1.5" />
          </div>

          <div>
            <Label htmlFor="sp-intro" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Intro paragraph</Label>
            <Textarea id="sp-intro" value={draft.intro} onChange={e => set({ intro: e.target.value })}
              rows={3} placeholder="Opening paragraph of the one-pager…" className="mt-1.5" />
          </div>

          {/* FAQs */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Questions &amp; answers</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addFaq} className="h-7 text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Q&amp;A
              </Button>
            </div>
            <div className="mt-2 space-y-3">
              {draft.faqs.map((f, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3 space-y-2 relative">
                  <div className="flex items-center gap-2 text-gray-300">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-[11px] font-medium text-gray-400">Q&amp;A {i + 1}</span>
                    <button type="button" onClick={() => removeFaq(i)}
                      className="ml-auto text-gray-300 hover:text-red-500" title="Remove">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <Input value={f.q} onChange={e => setFaq(i, { q: e.target.value })}
                    placeholder="Question clients ask…" />
                  <Textarea value={f.a} onChange={e => setFaq(i, { a: e.target.value })}
                    rows={2} placeholder="Your answer…" />
                </div>
              ))}
            </div>
          </div>

          {/* Video */}
          <div>
            <Label htmlFor="sp-video" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Video URL (optional)</Label>
            <Input id="sp-video" value={draft.videoUrl || ''} onChange={e => set({ videoUrl: e.target.value })}
              placeholder="Paste a YouTube/Vimeo/MP4 link — leave blank to show a placeholder" className="mt-1.5" />
            <p className="mt-1 text-[11px] text-gray-400">Until you add a video, clients see a tasteful "coming soon" slot.</p>
          </div>

          {/* Documents */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Documents</Label>
            <div className="mt-2 space-y-2">
              {(draft.documents || []).map((d, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <a href={d.url} target="_blank" rel="noreferrer" className="text-sm text-gray-700 truncate hover:underline flex-1">{d.name}</a>
                  <button type="button" onClick={() => removeDoc(i)} className="text-gray-300 hover:text-red-500" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 cursor-pointer hover:border-gray-400">
                {uploadPct !== null ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Uploading… {uploadPct}%</>
                ) : (
                  <><Upload className="h-4 w-4" /> Upload a document (PDF, image, etc.)</>
                )}
                <input type="file" className="hidden" disabled={uploadPct !== null}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.currentTarget.value = ''; }} />
              </label>
            </div>
          </div>

          {/* Featured + Published toggles */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Feature as hero</p>
              <p className="text-[11px] text-gray-400">On = the big banner at the top of the pitch. Only one section should be featured.</p>
            </div>
            <Switch checked={!!draft.featured} onCheckedChange={(v) => set({ featured: v })} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Published</p>
              <p className="text-[11px] text-gray-400">Off = hidden from clients, still visible to you with a badge.</p>
            </div>
            <Switch checked={draft.published} onCheckedChange={(v) => set({ published: v })} />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {!isNew ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Delete section
            </Button>
          ) : <span />}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={handleSave} disabled={saving}
              style={{ backgroundColor: GOLD, borderColor: GOLD, color: '#1a1a1a' }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {isNew ? 'Add section' : 'Save changes'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
