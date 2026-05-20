import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileText } from 'lucide-react';
import { DescriptionTemplatePicker } from './DescriptionTemplatePicker';

interface Props {
  value: string;
  trade?: string;
  placeholder?: string;
  onChange: (next: string) => void;
}

/**
 * Cell-sized button that shows a one-line preview of the line item's
 * description. Clicking it opens a dialog with the full editable text plus
 * the saved-template picker — that dialog is what the client-facing copy
 * lives in, so it's framed as "what the homeowner sees on the estimate".
 */
export function LineDescriptionButton({ value, trade, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || '');

  // Sync local draft whenever the upstream value changes OR the dialog opens
  // (so re-opening always shows the latest saved text, not a stale cancel).
  useEffect(() => { setDraft(value || ''); }, [value, open]);

  const commit = () => {
    onChange(draft);
    setOpen(false);
  };

  const cancel = () => {
    setDraft(value || '');
    setOpen(false);
  };

  const preview = (value || '').trim();
  const isEmpty = !preview;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`h-8 flex items-center gap-1.5 px-2 rounded border text-sm text-left transition-colors w-full min-w-0 ${
          isEmpty
            ? 'border-dashed border-gray-300 text-gray-400 hover:border-[#C9A96E] hover:text-amber-900 hover:bg-amber-50/40'
            : 'border-gray-200 bg-white hover:border-[#C9A96E] hover:bg-amber-50/40'
        }`}
        title={isEmpty ? 'Add the description shown to the client' : preview}
      >
        <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isEmpty ? '#9CA3AF' : '#C9A96E' }} />
        <span className={`flex-1 truncate ${isEmpty ? 'italic' : 'text-gray-800'}`}>
          {isEmpty ? (placeholder || 'Add description…') : preview}
        </span>
      </button>

      <Dialog open={open} onOpenChange={o => o ? setOpen(true) : cancel()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" style={{ color: '#C9A96E' }} />
              Line description
            </DialogTitle>
            <p className="text-xs text-gray-500 mt-1">This is the text the homeowner sees for this line on the estimate.</p>
          </DialogHeader>

          <div className="flex items-start gap-2">
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={10}
              placeholder="Describe the work — materials, scope, finishes, any inclusions or exclusions."
              className="text-sm leading-relaxed flex-1"
              autoFocus
            />
            <DescriptionTemplatePicker
              currentValue={draft}
              currentTrade={trade}
              onInsert={content => setDraft(content)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancel}>Cancel</Button>
            <Button
              onClick={commit}
              style={{ backgroundColor: '#C9A96E', color: '#141414' }}
              className="font-semibold hover:opacity-90"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
