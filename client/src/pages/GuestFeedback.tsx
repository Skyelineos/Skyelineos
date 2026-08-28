// GuestFeedback — public feedback page accessible at /feedback with no login.
// Intended for subcontractors and other guests who don't have a Skyeline account.
// Submits to POST /api/feedback/guest which saves to Firestore `feedback_queue`
// with submittedBy.role = "subcontractor" and fires a Telegram notification.

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function GuestFeedback() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Your name is required.'); return; }
    if (!description.trim()) { setError('Please describe your feedback.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/feedback/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName: name.trim(), category, description: description.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to send feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: '#141414' }}
    >
      <div className="w-full max-w-lg">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <p
            className="text-2xl font-semibold tracking-widest text-white"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '0.2em' }}
          >
            SKYELINE
          </p>
          <p className="text-xs tracking-[0.3em] text-[#C9A96E] uppercase mt-1">
            Feedback
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 border border-white/10"
          style={{ background: '#1b1b1b' }}
        >
          {submitted ? (
            // Success state
            <div className="text-center space-y-4 py-6">
              <CheckCircle className="w-12 h-12 text-[#C9A96E] mx-auto" />
              <h2 className="text-white text-lg font-semibold">Thank you!</h2>
              <p className="text-white/50 text-sm">
                Your feedback has been received. The Skyeline team will review it shortly.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setSubmitted(false); setName(''); setDescription(''); setCategory('bug'); }}
                className="text-[#C9A96E] hover:text-[#A8864A] mt-4"
              >
                Submit another
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h1
                  className="text-white text-xl font-semibold mb-1"
                  style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                >
                  Share your feedback
                </h1>
                <p className="text-white/40 text-sm">
                  Notice something? Have an idea? We want to hear from you.
                </p>
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="guest-name" className="text-white/60 text-xs uppercase tracking-wide">
                  Your Name <span className="text-[#C9A96E]">*</span>
                </Label>
                <Input
                  id="guest-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Smith"
                  required
                  className="bg-[#141414] border-white/10 text-white placeholder:text-white/30 focus:border-[#C9A96E]"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">
                  Category
                </Label>
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
              <div className="space-y-1.5">
                <Label htmlFor="guest-description" className="text-white/60 text-xs uppercase tracking-wide">
                  Description <span className="text-[#C9A96E]">*</span>
                </Label>
                <Textarea
                  id="guest-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What did you notice?"
                  rows={5}
                  required
                  className="bg-[#141414] border-white/10 text-white placeholder:text-white/30 focus:border-[#C9A96E] resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#C9A96E] hover:bg-[#A8864A] text-[#141414] font-semibold disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send Feedback'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-6">
          Skyeline Construction Management
        </p>
      </div>
    </div>
  );
}
