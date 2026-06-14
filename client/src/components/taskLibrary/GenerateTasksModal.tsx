// ─────────────────────────────────────────────────────────────────────────────
// Generate Project Tasks from the Master Library
//
// Shown on a project with no (or partial) task list. Lets the user pick optional
// task groups by tag, previews the count by phase against the current library
// snapshot, and confirms generation. Only ACTIVE master tasks are copied;
// required tasks are always included. Re-running is safe (skips taskCodes that
// already exist on the project).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SUGGESTED_TAGS, PHASE_ORDER, type GeneratePreview } from '@shared/taskLibrary-types';
import { getGeneratePreview, generateProjectTasks } from '@/lib/taskLibrary/api';

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onGenerated?: () => void;
}

export function GenerateTasksModal({ projectId, open, onClose, onGenerated }: Props) {
  const { toast } = useToast();
  const [includeTags, setIncludeTags] = useState<string[]>([]);
  const [includeAllOptional, setIncludeAllOptional] = useState(false);
  const [preview, setPreview] = useState<GeneratePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Refresh the preview whenever the selection changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingPreview(true);
    getGeneratePreview(projectId, { includeTags, includeAllOptional })
      .then((p) => !cancelled && setPreview(p))
      .catch((e) => !cancelled && toast({ title: 'Preview failed', description: e.message, variant: 'destructive' }))
      .finally(() => !cancelled && setLoadingPreview(false));
    return () => {
      cancelled = true;
    };
  }, [open, projectId, includeTags, includeAllOptional]);

  const toggleTag = (tag: string) =>
    setIncludeTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const r = await generateProjectTasks(projectId, { includeTags, includeAllOptional });
      toast({ title: 'Project tasks generated', description: `${r.created} task${r.created === 1 ? '' : 's'} added.` });
      onGenerated?.();
      onClose();
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const sortedPhases = preview
    ? [...preview.byPhase].sort((a, b) => (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99))
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#C9A96E]" /> Generate Tasks from Master
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {preview && (
            <div className="text-sm text-gray-500">
              Using <span className="font-medium text-gray-700">{preview.masterVersionLabel}</span> ·{' '}
              {preview.totalActive} active master tasks.
            </div>
          )}

          {preview?.alreadyGenerated && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>
                This project already has {preview.existingCount} task{preview.existingCount === 1 ? '' : 's'}.
                Generating again only adds master tasks not already present — existing project tasks are untouched.
              </span>
            </div>
          )}

          {/* Optional task groups */}
          <div className="space-y-2">
            <Label>Optional task groups (by tag)</Label>
            <p className="text-xs text-gray-500">
              Required tasks are always included. Pick the conditions that apply to this home to pull in the
              matching optional tasks.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  disabled={includeAllOptional}
                  onClick={() => toggleTag(tag)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-40 ${
                    includeTags.includes(tag)
                      ? 'bg-[#C9A96E] text-white border-[#C9A96E]'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-[#C9A96E]'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
              <Checkbox checked={includeAllOptional} onCheckedChange={(v) => setIncludeAllOptional(!!v)} />
              Include all optional tasks
            </label>
          </div>

          {/* Preview by phase */}
          <div className="space-y-2">
            <Label>Preview</Label>
            {loadingPreview ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculating…
              </div>
            ) : preview ? (
              <div className="border rounded-md overflow-hidden">
                {sortedPhases.map((p) => (
                  <div key={p.phase} className="flex items-center justify-between px-3 py-2 border-b last:border-0 text-sm">
                    <span className="text-gray-700">{p.phase}</span>
                    <span className="text-gray-500">
                      <span className="font-semibold text-gray-800">{p.selected}</span> of {p.required + p.optional}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 font-medium">
                  <span>Total to generate</span>
                  <span className="text-[#C9A96E]">{preview.selectedTotal}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button
            onClick={handleGenerate}
            disabled={generating || loadingPreview || (preview?.selectedTotal ?? 0) === 0}
            className="bg-[#C9A96E] hover:bg-[#b8975c]"
          >
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Generate {preview ? preview.selectedTotal : ''} tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
