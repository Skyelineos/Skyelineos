import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Heart, ChevronLeft, ChevronRight, SkipForward, X, CheckCircle2 } from 'lucide-react';

/**
 * "Walk me through these" mode for the homeowner.
 *
 * Wizard-style flow that takes ONLY the selections that are still
 * actionable (have options to pick AND no client preference yet) and
 * walks the homeowner through them one at a time with big visuals.
 *
 * Built deliberately small — Next / Back / Skip / Done. No editing of
 * selection metadata, no notes inline (notes still happen on the main
 * page view). The wizard's only job is to make picking 30+ options feel
 * like one focused sitting instead of clicking into 30 cards.
 *
 * Closes itself when the user finishes the last item OR clicks Done.
 */

interface WizardItem {
  id: string;
  productName: string;
  vendor: string;
  imageUrls?: string[];
  costPerUnit?: number;
}

export interface WizardSelection {
  id: string;
  item?: string;
  room?: string;
  category?: string;
  notes?: string;
  items?: WizardItem[];
  clientPreference?: { optionId?: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** All selections in the actionable bucket — wizard filters further to
   *  ones with options the homeowner hasn't picked yet. */
  selections: WizardSelection[];
  /** Async — caller writes the preference to Firestore. The wizard
   *  optimistically advances on success. */
  onPick: (selectionId: string, optionId: string) => Promise<void>;
}

export function SelectionsWizard({ open, onClose, selections, onPick }: Props) {
  // The wizard only walks through selections that have OPTIONS the
  // homeowner hasn't picked yet. Locked / fully-decided items are
  // skipped — the homeowner can still revisit those on the main page.
  const pending = useMemo(
    () => selections.filter(s =>
      (s.items && s.items.length > 0) && !s.clientPreference?.optionId
    ),
    [selections]
  );

  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Reset to the first item every time the wizard opens, so the user
  // doesn't land mid-stream from a previous session.
  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  // If the underlying selection list shrinks (e.g. user picks one outside
  // the wizard, or a designer locks one), clamp the index so we don't
  // index past the end.
  useEffect(() => {
    if (idx >= pending.length && pending.length > 0) {
      setIdx(pending.length - 1);
    }
  }, [pending.length, idx]);

  const current = pending[idx];
  const total = pending.length;
  const progress = total > 0 ? Math.round(((idx) / total) * 100) : 0;

  const handlePick = async (optionId: string) => {
    if (!current) return;
    setSubmitting(true);
    try {
      await onPick(current.id, optionId);
      // Optimistic advance — the parent's onPick removes this item from
      // `pending` on success, so we just nudge the index. If we're on
      // the last item, finish.
      if (idx >= total - 1) {
        onClose();
      } else {
        setIdx(i => i + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (idx >= total - 1) {
      onClose();
    } else {
      setIdx(i => i + 1);
    }
  };

  const handleBack = () => {
    setIdx(i => Math.max(0, i - 1));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-lg">
              Walk me through these
              {total > 0 && (
                <span className="ml-2 text-sm text-gray-500 font-normal">
                  {idx + 1} of {total}
                </span>
              )}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close wizard"
              className="text-gray-400 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <Progress value={progress} className="mt-2" />
        </DialogHeader>

        {/* Body */}
        <div className="px-6 py-5 min-h-[420px]">
          {total === 0 ? (
            <EmptyState onClose={onClose} />
          ) : current ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={current.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-xl font-heading font-semibold text-[#141414]">{current.item || 'Untitled selection'}</h3>
                  <p className="text-sm text-gray-500">
                    {current.room ? `${current.room} · ` : ''}{current.category || ''}
                  </p>
                  {current.notes && (
                    <p className="text-sm text-gray-700 mt-2 italic bg-[#FFF8E7]/40 border border-[#C9A96E]/30 rounded px-3 py-2">
                      From your designer: "{current.notes}"
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(current.items || []).map(opt => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => handlePick(opt.id)}
                      disabled={submitting}
                      className="text-left border border-gray-200 rounded-lg overflow-hidden hover:border-[#C9A96E] hover:shadow-md transition-all bg-white disabled:opacity-60 disabled:cursor-wait"
                    >
                      {opt.imageUrls?.[0] && (
                        <img
                          src={opt.imageUrls[0]}
                          alt={opt.productName}
                          className="w-full h-40 object-cover"
                        />
                      )}
                      <div className="p-3 space-y-1">
                        <div className="font-medium text-sm">{opt.productName}</div>
                        <div className="text-xs text-gray-500">{opt.vendor}</div>
                        <div className="pt-1.5">
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Heart className="w-3 h-3" /> Pick this one
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          ) : null}
        </div>

        {/* Footer */}
        {total > 0 && (
          <div className="border-t px-6 py-3 flex items-center justify-between bg-gray-50/50">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={idx === 0 || submitting}
              className="gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSkip}
                disabled={submitting}
                className="gap-1.5"
              >
                <SkipForward className="w-3.5 h-3.5" />
                {idx >= total - 1 ? 'Done' : 'Skip for now'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 gap-4">
      <CheckCircle2 className="w-12 h-12 text-green-500" />
      <div>
        <h3 className="text-lg font-heading font-semibold text-[#141414]">Nothing to walk through</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">
          Either you've picked everything that has options, or your designer is still putting options together. Check back when more land.
        </p>
      </div>
      <Button onClick={onClose} variant="outline">Close</Button>
    </div>
  );
}
