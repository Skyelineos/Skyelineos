// Manage portal-invite email templates: upload a new one for a stage, preview
// any template, or delete (built-in or uploaded). Backs the "Upload / manage
// templates…" item on the Invite-to-portal dropdown. Templates live in the
// `emailTemplates` Firestore collection — no tokens consumed.
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { Trash2, Upload, Eye } from 'lucide-react';
import {
  type EmailTemplate,
  type TemplateStage,
  STAGES,
  stageLabel,
  createTemplate,
  deleteTemplate,
  ensureSeedTemplates,
  listTemplates,
  renderPreview,
} from '@/lib/emailTemplates';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Notify the parent when the template set changes so the dropdown refreshes. */
  onChanged?: () => void;
}

export function EmailTemplateManagerDialog({ open, onOpenChange, onChanged }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<EmailTemplate | null>(null);

  // New-template form state.
  const [name, setName] = useState('');
  const [stage, setStage] = useState<TemplateStage>('lead');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      await ensureSeedTemplates();
      setTemplates(await listTemplates());
    } catch (e: any) {
      toast({ title: 'Could not load templates', description: e?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setHtml(text);
    if (!name) setName(file.name.replace(/\.html?$/i, ''));
    toast({ title: 'File loaded', description: `${file.name} — edit then save below.` });
  };

  const onSave = async () => {
    if (!name.trim()) return toast({ title: 'Name required', variant: 'destructive' });
    if (!subject.trim()) return toast({ title: 'Subject required', variant: 'destructive' });
    if (!html.trim()) return toast({ title: 'Body (HTML) required', variant: 'destructive' });
    setSaving(true);
    try {
      await createTemplate({ name, stage, subject, html, createdBy: user?.email });
      toast({ title: 'Template added', description: `"${name}" is now selectable for ${stageLabel(stage)}.` });
      setName(''); setSubject(''); setHtml('');
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (t: EmailTemplate) => {
    if (!window.confirm(`Delete "${t.name}"? This can't be undone.`)) return;
    try {
      await deleteTemplate(t.id);
      toast({ title: 'Template deleted' });
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Portal invite templates</DialogTitle>
          <DialogDescription>
            Select these from the “Invite to portal” button. Use the placeholders{' '}
            <code>{'{{firstName}}'}</code> and <code>{'{{inviteLink}}'}</code> in your HTML —
            they're filled in per recipient when the email is sent.
          </DialogDescription>
        </DialogHeader>

        {/* Existing templates, grouped by stage */}
        <div className="space-y-4">
          {STAGES.map(s => {
            const inStage = templates.filter(t => t.stage === s.value);
            return (
              <div key={s.value}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  {s.label}
                </div>
                {inStage.length === 0 && (
                  <div className="text-sm text-muted-foreground italic">No templates.</div>
                )}
                <div className="space-y-1.5">
                  {inStage.map(t => (
                    <div key={t.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {t.name}
                          {t.source === 'builtin' && (
                            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                              built-in
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{t.subject}</div>
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(t)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(t)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        </div>

        {/* Upload / add a new template */}
        <div className="mt-2 rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="text-sm font-semibold">Add a new template</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="tpl-name">Name</Label>
              <Input id="tpl-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Spring promo — leads" />
            </div>
            <div className="space-y-1">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={v => setStage(v as TemplateStage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tpl-subject">Subject line</Label>
            <Input id="tpl-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your Skyeline Homes portal invitation" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-html">Body (HTML)</Label>
              <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload .html
              </Button>
              <input ref={fileRef} type="file" accept=".html,text/html" className="hidden" onChange={onPickFile} />
            </div>
            <Textarea id="tpl-html" value={html} onChange={e => setHtml(e.target.value)} rows={6}
              placeholder="Paste HTML or upload a file. Use {{firstName}} and {{inviteLink}}." className="font-mono text-xs" />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        </div>

        {/* Inline preview */}
        {preview && (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Preview — {preview.name}</div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPreview(null)}>Close</Button>
            </div>
            <iframe
              title="template preview"
              className="h-80 w-full rounded border bg-white"
              srcDoc={renderPreview(preview.html, { firstName: 'Taylor', inviteLink: '#' })}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
