// FeedbackButton — floating action button (bottom-right) that opens a modal
// letting signed-in staff submit bug reports, feature ideas, or design notes.
// The screenshot is optional; the form POSTs multipart/form-data to
// POST /api/feedback which saves to Firestore `feedback_queue` and fires a
// Telegram notification to Tyler.
//
// Suppressed on public / unauthenticated routes to avoid cluttering the sign-in
// page or portal-facing views.

import { useRef, useState } from 'react';
import { MessageCircle, X, Paperclip } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedbackCategory = 'bug' | 'feature' | 'design';

interface CategoryOption {
  value: FeedbackCategory;
  label: string;
  emoji: string;
}

const CATEGORIES: CategoryOption[] = [
  { value: 'bug',     label: 'Bug',             emoji: '🐛' },
  { value: 'feature', label: 'Feature Idea',    emoji: '💡' },
  { value: 'design',  label: 'Design Feedback', emoji: '🎨' },
];

// Routes where the FAB should never appear
const FAB_HIDDEN_PREFIXES = [
  '/sign-in',
  '/portal-login',
  '/learn-more',
  '/sms-privacy',
  '/sms-terms',
  '/giveaway',
  '/bid/respond',
  '/unauthorized',
  '/not-authorized',
  '/feedback',       // GuestFeedback page has its own form
];

// ── FeedbackButton ────────────────────────────────────────────────────────────

export function FeedbackButton() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Don't render on public pages or while unauthenticated
  if (!user) return null;
  if (FAB_HIDDEN_PREFIXES.some((p) => location.startsWith(p))) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setScreenshot(file);
  }

  function resetForm() {
    setCategory('bug');
    setDescription('');
    setScreenshot(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      toast({ title: 'Description required', description: 'Please describe your feedback.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;

      const form = new FormData();
      form.append('category', category);
      form.append('description', description.trim());
      if (screenshot) form.append('screenshot', screenshot);

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }

      toast({
        title: '✅ Feedback sent',
        description: 'Thanks! Tyler will review it soon.',
      });
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast({
        title: 'Failed to send feedback',
        description: err?.message || 'Unknown error. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* ── Floating Action Button ─────────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Send feedback"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-50',
          'flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg',
          'bg-[#C9A96E] hover:bg-[#A8864A] text-white text-sm font-medium',
          'transition-colors focus:outline-none focus:ring-2 focus:ring-[#C9A96E] focus:ring-offset-2',
        )}
        // Offset upward so it doesn't overlap the QuickExpenseFAB on mobile
        style={{ bottom: '5.5rem' }}
      >
        <MessageCircle className="w-4 h-4 shrink-0" />
        <span>Feedback</span>
      </button>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={(v) => { if (!submitting) setOpen(v); }}>
        <DialogContent className="sm:max-w-md bg-[#141414] border border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="font-[Cormorant_Garamond] text-xl font-semibold text-white">
              Share Feedback
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5 pt-1">
            {/* Submitter name (read-only) */}
            <p className="text-xs text-white/40">
              Submitting as <span className="text-white/70">{user.name || user.email}</span>
            </p>

            {/* Category pills */}
            <div>
              <label className="block text-xs text-white/50 mb-2 uppercase tracking-wide">
                Category
              </label>
              <div className="flex gap-2 flex-wrap">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors',
                      category === c.value
                        ? 'bg-[#C9A96E] border-[#C9A96E] text-[#141414] font-semibold'
                        : 'border-white/20 text-white/60 hover:border-[#C9A96E]/60 hover:text-white',
                    )}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="feedback-description" className="block text-xs text-white/50 mb-2 uppercase tracking-wide">
                Description <span className="text-[#C9A96E]">*</span>
              </label>
              <Textarea
                id="feedback-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you notice?"
                rows={4}
                required
                className="bg-[#1b1b1b] border-white/10 text-white placeholder:text-white/30 focus:border-[#C9A96E] resize-none"
              />
            </div>

            {/* Screenshot (optional) */}
            <div>
              <label className="block text-xs text-white/50 mb-2 uppercase tracking-wide">
                Screenshot <span className="text-white/30">(optional)</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                    screenshot
                      ? 'border-[#C9A96E]/60 text-[#C9A96E]'
                      : 'border-white/20 text-white/50 hover:border-white/40 hover:text-white/80',
                  )}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  {screenshot ? screenshot.name : 'Attach image'}
                </button>
                {screenshot && (
                  <button
                    type="button"
                    aria-label="Remove screenshot"
                    onClick={() => { setScreenshot(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-white/30 hover:text-white/70"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="text-white/50 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || !description.trim()}
                className="bg-[#C9A96E] hover:bg-[#A8864A] text-[#141414] font-semibold disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send Feedback'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FeedbackButton;
