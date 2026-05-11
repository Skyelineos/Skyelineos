import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Star, Send, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  contactId?: string;
}

// A simple 1-5 star picker. Click stars to set rating, click X to clear.
function StarRow({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? 0 : n)}
            className="p-0.5"
            aria-label={`${n} stars`}
          >
            <Star
              className={`w-7 h-7 transition-colors ${
                n <= value ? 'text-amber-400 fill-current' : 'text-gray-300'
              }`}
            />
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-xs text-gray-500">{value} / 5</span>
        )}
      </div>
    </div>
  );
}

// Client-facing review form. Two ratings:
//   1. The finished project itself
//   2. Skyeline Homes as a builder (overall experience)
// Plus an optional comment for each, and an OK-to-share-publicly checkbox.
// Saved to projectReviews/{id} with status='pending' so the GC can review.
export function ProjectReviewModal({ open, onClose, projectId, projectName, contactId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projectRating, setProjectRating] = useState(0);
  const [builderRating, setBuilderRating] = useState(0);
  const [projectComment, setProjectComment] = useState('');
  const [builderComment, setBuilderComment] = useState('');
  const [shareApproved, setShareApproved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setProjectRating(0);
    setBuilderRating(0);
    setProjectComment('');
    setBuilderComment('');
    setShareApproved(false);
  };

  const handleSubmit = async () => {
    if (!projectRating && !builderRating) {
      toast({ title: 'Pick a rating', description: 'Rate at least one of the two.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'projectReviews'), {
        projectId,
        projectName: projectName || '',
        contactId: contactId || '',
        clientUid: user?.firebaseUid || user?.id?.toString() || '',
        clientName: user?.name || '',
        clientEmail: user?.email || '',
        projectRating,
        builderRating,
        projectComment: projectComment.trim(),
        builderComment: builderComment.trim(),
        clientApprovedShare: shareApproved,
        status: 'pending',
        shared: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast({
        title: 'Review submitted',
        description: 'Thanks — your feedback was sent to the Skyeline Homes team.',
      });
      reset();
      onClose();
    } catch (e: any) {
      toast({
        title: 'Could not submit review',
        description: e?.message || 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Review Your Project</DialogTitle>
          <DialogDescription>
            Two quick ratings — the finished project and the team behind it. Your
            feedback helps us improve and helps future clients.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <StarRow
            value={projectRating}
            onChange={setProjectRating}
            label={`How would you rate the finished ${projectName ? `"${projectName}"` : 'project'}?`}
          />
          <Textarea
            rows={3}
            placeholder="What did you love? What would you change? (optional)"
            value={projectComment}
            onChange={e => setProjectComment(e.target.value)}
          />

          <div className="h-px bg-gray-200" />

          <StarRow
            value={builderRating}
            onChange={setBuilderRating}
            label="How would you rate Skyeline Homes as a builder?"
          />
          <Textarea
            rows={3}
            placeholder="Communication, craftsmanship, follow-through — anything you want to call out (optional)"
            value={builderComment}
            onChange={e => setBuilderComment(e.target.value)}
          />

          <label className="flex items-start gap-2 cursor-pointer p-3 border rounded-lg bg-amber-50/40 border-amber-200">
            <input
              type="checkbox"
              checked={shareApproved}
              onChange={e => setShareApproved(e.target.checked)}
              className="mt-1"
            />
            <div className="text-sm text-amber-900">
              <p className="font-medium">OK to share publicly with my name</p>
              <p className="text-xs text-amber-700/80 mt-0.5">
                If checked and your rating is 5 stars, Skyeline may email you a one-click
                link to post the same review on Google. You'll submit it from your own
                Google account — nothing posts without your action.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter className="border-t pt-4 mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2 text-white"
            style={{ backgroundColor: '#C9A96E' }}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Submitting…' : 'Submit Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
